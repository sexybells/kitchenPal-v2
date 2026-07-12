import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type {
  AdminBootstrapInput,
  AuthResult,
  ForgotPasswordInput,
  LoginInput,
  LoginPhoneOtpInput,
  Locale,
  RegisterInput,
  ResetPasswordInput,
  Role,
  TokenPair,
  UserResponse,
  VerifyEmailInput,
  VerifyPhoneOtpInput,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { APP_CONFIG, AppConfig } from "../../../config/env.schema";
import { EMAIL_ADAPTER, type EmailAdapter } from "../adapters/email-adapter";
import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
} from "../auth.constants";
import { EmailVerificationTokenRepository } from "../repositories/email-verification-token.repository";
import { PasswordResetTokenRepository } from "../repositories/password-reset-token.repository";
import type { UserEntity } from "../repositories/user.repository";
import { UserRepository } from "../repositories/user.repository";
import { resolveLocale } from "./locale-resolver";
import { OtpService } from "./otp.service";
import { PasswordService } from "./password.service";
import { generateOpaqueToken, hashToken } from "./secret-token";
import type { SocialIdentity } from "./social-auth.service";
import { SocialAuthService } from "./social-auth.service";
import { TokenService, toTokenSubject } from "./token.service";
import { toUserResponse } from "./user-mapper";

type UserDoc = HydratedDocument<UserEntity>;

/** Result carrier that also surfaces dev-only tokens for local flows. */
export interface DevTokenResult {
  delivered: boolean;
  devToken?: string;
}

/**
 * Orchestrates every authentication flow: email/password, social, phone-OTP,
 * password reset, email verification, admin bootstrap, and the `me` projection.
 * Token minting/rotation lives in {@link TokenService}; this service owns the
 * account lifecycle and issues a token pair on each successful sign-in.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_ADAPTER) private readonly email: EmailAdapter,
    private readonly logger: AppLogger,
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly resetTokens: PasswordResetTokenRepository,
    private readonly verificationTokens: EmailVerificationTokenRepository,
    private readonly social: SocialAuthService,
    private readonly otp: OtpService,
  ) {}

  async register(
    input: RegisterInput,
    acceptLanguage: string | undefined,
  ): Promise<{ result: AuthResult; verification: DevTokenResult }> {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw new ConflictException({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
        message: "An account with this email already exists",
      });
    }

    const locale = resolveLocale(input.locale, acceptLanguage);
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      email,
      passwordHash,
      displayName: input.displayName,
      roles: ["user"],
      locale,
    });

    const verification = await this.sendEmailVerification(user, email);
    return { result: await this.buildResult(user), verification };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    // Always run the full KDF — even when the account is missing or has no
    // password — against a VALID equalizer hash, so response time does not reveal
    // whether an email is registered (or is a passwordless social/phone account).
    const hash = user?.passwordHash ?? this.passwords.timingEqualizerHash;
    const ok = await this.passwords.verify(input.password, hash);
    if (!user || !user.passwordHash || !ok) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: "Invalid email or password",
      });
    }
    if (user.suspendedAt) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: "This account has been suspended",
      });
    }
    return this.buildResult(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const { tokens } = await this.tokens.rotate(refreshToken);
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeByToken(refreshToken);
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<DevTokenResult> {
    const user = await this.users.findByEmail(input.email);
    // Always report success to avoid revealing whether the email is registered.
    if (!user) {
      return { delivered: this.email.delivers };
    }

    const token = generateOpaqueToken();
    await this.resetTokens.issue({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000),
    });
    await this.email.send({
      to: input.email,
      subject: "Reset your KitchenPal password",
      text: `Use this token to reset your password: ${token}\n${this.config.APP_WEB_URL}/reset-password?token=${token}`,
    });
    return this.devResult(token);
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const record = await this.resetTokens.findByHash(hashToken(input.token));
    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw this.invalidToken("The reset link is invalid or has expired");
    }
    // Consume first, atomically: only the caller that wins the compare-and-swap
    // may reset the password, so a token is single-use even under concurrency.
    if (!(await this.resetTokens.consume(record.tokenHash))) {
      throw this.invalidToken("The reset link is invalid or has expired");
    }
    const user = await this.users.findById(record.userId.toString());
    if (!user) {
      throw this.invalidToken("The reset link is invalid or has expired");
    }

    const passwordHash = await this.passwords.hash(input.password);
    await this.users.updateWithVersion(
      user.id,
      user.version,
      { passwordHash },
      user.id,
    );
    // A password change invalidates every existing session.
    await this.tokens.revokeAllForUser(user.id);
  }

  async verifyEmail(input: VerifyEmailInput): Promise<void> {
    const record = await this.verificationTokens.findByHash(
      hashToken(input.token),
    );
    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw this.invalidToken("The verification link is invalid or has expired");
    }
    const user = await this.users.findById(record.userId.toString());
    // Reject a stale token whose pinned address no longer matches the account
    // (e.g. the email was changed after the token was issued).
    if (!user || (user.email ?? "").toLowerCase() !== record.email.toLowerCase()) {
      throw this.invalidToken("The verification link is invalid or has expired");
    }
    // Consume atomically before recording verification (single-use).
    if (!(await this.verificationTokens.consume(record.tokenHash))) {
      throw this.invalidToken("The verification link is invalid or has expired");
    }
    await this.users.updateWithVersion(
      user.id,
      user.version,
      { emailVerifiedAt: new Date() },
      user.id,
    );
  }

  async socialSignIn(
    provider: "google" | "apple",
    idToken: string,
    localeHint: Locale | undefined,
    acceptLanguage: string | undefined,
  ): Promise<AuthResult> {
    const identity = await this.social.verify(provider, idToken);
    const user = await this.resolveSocialUser(
      identity,
      resolveLocale(localeHint, acceptLanguage),
    );
    return this.buildResult(user);
  }

  async requestPhoneOtp(phone: string): Promise<DevTokenResult> {
    const { devCode } = await this.otp.request("phone", phone);
    return devCode ? { delivered: false, devToken: devCode } : { delivered: true };
  }

  async verifyPhoneOtp(input: VerifyPhoneOtpInput): Promise<void> {
    await this.otp.verify("phone", input.phone, input.code);
    const user = await this.users.findByPhone(input.phone);
    if (user && user.phoneVerifiedAt === null) {
      await this.users.updateWithVersion(
        user.id,
        user.version,
        { phoneVerifiedAt: new Date() },
        user.id,
      );
    }
  }

  async loginWithPhoneOtp(
    input: LoginPhoneOtpInput,
    acceptLanguage: string | undefined,
  ): Promise<AuthResult> {
    await this.otp.verify("phone", input.phone, input.code);
    let user = await this.users.findByPhone(input.phone);
    if (!user) {
      user = await this.users.create({
        phone: input.phone,
        displayName: input.displayName ?? input.phone,
        roles: ["user"],
        locale: resolveLocale(input.locale, acceptLanguage),
        phoneVerifiedAt: new Date(),
      });
    } else if (user.phoneVerifiedAt === null) {
      await this.users.updateWithVersion(
        user.id,
        user.version,
        { phoneVerifiedAt: new Date() },
        user.id,
      );
    }
    return this.buildResult(user);
  }

  async bootstrapAdmin(input: AdminBootstrapInput): Promise<UserResponse> {
    const allowed = this.adminEmails();
    const configuredSecret = this.config.ADMIN_BOOTSTRAP_SECRET;
    const email = input.email.trim().toLowerCase();
    if (
      !configuredSecret ||
      input.secret !== configuredSecret ||
      !allowed.includes(email)
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "Admin bootstrap is not permitted for this request",
      });
    }
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "No account exists for this email yet",
      });
    }
    if (!user.roles.includes("admin")) {
      const roles: Role[] = [...user.roles, "admin"];
      await this.users.updateWithVersion(user.id, user.version, { roles }, user.id);
      this.logger.warn(`Elevated ${email} to admin via bootstrap.`, "AuthService");
      const refreshed = await this.users.findById(user.id);
      return toUserResponse(refreshed ?? user);
    }
    return toUserResponse(user);
  }

  async me(userId: string): Promise<UserResponse> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: "Account no longer exists",
      });
    }
    return toUserResponse(user);
  }

  /** Finds or provisions the account behind a verified social identity. */
  private async resolveSocialUser(
    identity: SocialIdentity,
    locale: Locale,
  ): Promise<UserDoc> {
    const existing = await this.users.findByProvider(
      identity.provider,
      identity.providerId,
    );
    if (existing) {
      return existing;
    }

    const email = identity.email?.toLowerCase() ?? null;
    if (email) {
      const byEmail = await this.users.findByEmail(email);
      if (byEmail) {
        // Auto-link to an existing account ONLY when the provider proves the
        // caller controls the email. Linking on an unverified provider email
        // would let an attacker take over an account by claiming its address.
        if (!identity.emailVerified) {
          throw new ConflictException({
            code: ErrorCode.EMAIL_ALREADY_EXISTS,
            message:
              "This email already has an account. Sign in and link this provider from settings.",
          });
        }
        const authProviders = [
          ...byEmail.authProviders,
          { provider: identity.provider, providerId: identity.providerId },
        ];
        await this.users.updateWithVersion(
          byEmail.id,
          byEmail.version,
          { authProviders },
          byEmail.id,
        );
        const refreshed = await this.users.findById(byEmail.id);
        return refreshed ?? byEmail;
      }
    }

    return this.users.create({
      email,
      displayName: identity.name ?? email ?? `${identity.provider}-user`,
      roles: ["user"],
      locale,
      emailVerifiedAt: identity.emailVerified ? new Date() : null,
      authProviders: [
        { provider: identity.provider, providerId: identity.providerId },
      ],
    });
  }

  private async sendEmailVerification(
    user: UserDoc,
    email: string,
  ): Promise<DevTokenResult> {
    const token = generateOpaqueToken();
    await this.verificationTokens.issue({
      userId: user.id,
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000),
    });
    await this.email.send({
      to: email,
      subject: "Verify your KitchenPal email",
      text: `Confirm your email with this token: ${token}\n${this.config.APP_WEB_URL}/verify-email?token=${token}`,
    });
    return this.devResult(token);
  }

  private async buildResult(user: UserDoc): Promise<AuthResult> {
    const tokens = await this.tokens.issueTokenPair(toTokenSubject(user));
    return { user: toUserResponse(user), tokens };
  }

  /** Surfaces the token only when no real delivery happened (development). */
  private devResult(token: string): DevTokenResult {
    return this.email.delivers
      ? { delivered: true }
      : { delivered: false, devToken: token };
  }

  private adminEmails(): string[] {
    return (this.config.ADMIN_EMAILS ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
  }

  private invalidToken(message: string): BadRequestException {
    return new BadRequestException({ code: ErrorCode.BAD_REQUEST, message });
  }
}

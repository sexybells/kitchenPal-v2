import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  adminBootstrapSchema,
  forgotPasswordSchema,
  loginPhoneOtpSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  requestPhoneOtpSchema,
  resetPasswordSchema,
  socialSignInSchema,
  verifyEmailSchema,
  verifyPhoneOtpSchema,
  logoutSchema,
  type AdminBootstrapInput,
  type AuthResult,
  type ForgotPasswordInput,
  type LoginInput,
  type LoginPhoneOtpInput,
  type RefreshInput,
  type RegisterInput,
  type RequestPhoneOtpInput,
  type ResetPasswordInput,
  type SocialSignInInput,
  type TokenPair,
  type UserResponse,
  type VerifyEmailInput,
  type VerifyPhoneOtpInput,
  type LogoutInput,
} from "@kitchenpal/api-contract";
import type { AuthUser } from "../../common/scope/auth-user";
import { CurrentUser } from "../../common/scope/current-user.decorator";
import { Public } from "../../common/scope/public.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { AuthService, type DevTokenResult } from "./services/auth.service";

const ACCEPTED_STATUS = { success: true } as const;

const ONE_MINUTE_MS = 60_000;
// Tight per-IP caps on credential-guessing and code-request endpoints, well below
// the general limit, to blunt credential stuffing and reset/OTP abuse.
const CREDENTIAL_THROTTLE = { default: { limit: 10, ttl: ONE_MINUTE_MS } };
const SENSITIVE_REQUEST_THROTTLE = { default: { limit: 5, ttl: ONE_MINUTE_MS } };

/**
 * Authentication endpoints. Every flow returns the canonical response envelope.
 * Sign-in flows are public; identity for protected routes always comes from the
 * verified access token (`@CurrentUser`), never the request body.
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @ApiOperation({ summary: "Register with email and password" })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Headers("accept-language") acceptLanguage?: string,
  ): Promise<AuthResult & { emailVerification: DevTokenResult }> {
    const { result, verification } = await this.auth.register(
      body,
      acceptLanguage,
    );
    return { ...result, emailVerification: verification };
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({ summary: "Log in with email and password" })
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
  ): Promise<AuthResult> {
    return this.auth.login(body);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate a refresh token for a new token pair" })
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
  ): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke a refresh-token family" })
  async logout(
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutInput,
  ): Promise<typeof ACCEPTED_STATUS> {
    await this.auth.logout(body.refreshToken);
    return ACCEPTED_STATUS;
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle(SENSITIVE_REQUEST_THROTTLE)
  @ApiOperation({ summary: "Request a password-reset token" })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<DevTokenResult> {
    return this.auth.forgotPassword(body);
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset a password with a valid token" })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<typeof ACCEPTED_STATUS> {
    await this.auth.resetPassword(body);
    return ACCEPTED_STATUS;
  }

  @Public()
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify an email address with a token" })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
  ): Promise<typeof ACCEPTED_STATUS> {
    await this.auth.verifyEmail(body);
    return ACCEPTED_STATUS;
  }

  @Public()
  @Post("google")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign in with a Google identity token" })
  google(
    @Body(new ZodValidationPipe(socialSignInSchema)) body: SocialSignInInput,
    @Headers("accept-language") acceptLanguage?: string,
  ): Promise<AuthResult> {
    return this.auth.socialSignIn(
      "google",
      body.idToken,
      body.locale,
      acceptLanguage,
    );
  }

  @Public()
  @Post("apple")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign in with an Apple identity token" })
  apple(
    @Body(new ZodValidationPipe(socialSignInSchema)) body: SocialSignInInput,
    @Headers("accept-language") acceptLanguage?: string,
  ): Promise<AuthResult> {
    return this.auth.socialSignIn(
      "apple",
      body.idToken,
      body.locale,
      acceptLanguage,
    );
  }

  @Public()
  @Post("request-phone-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle(SENSITIVE_REQUEST_THROTTLE)
  @ApiOperation({ summary: "Request a one-time phone verification code" })
  requestPhoneOtp(
    @Body(new ZodValidationPipe(requestPhoneOtpSchema))
    body: RequestPhoneOtpInput,
  ): Promise<DevTokenResult> {
    return this.auth.requestPhoneOtp(body.phone);
  }

  @Public()
  @Post("verify-phone-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({ summary: "Verify ownership of a phone number" })
  async verifyPhoneOtp(
    @Body(new ZodValidationPipe(verifyPhoneOtpSchema)) body: VerifyPhoneOtpInput,
  ): Promise<typeof ACCEPTED_STATUS> {
    await this.auth.verifyPhoneOtp(body);
    return ACCEPTED_STATUS;
  }

  @Public()
  @Post("login-phone-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({ summary: "Passwordless login with a phone code" })
  loginPhoneOtp(
    @Body(new ZodValidationPipe(loginPhoneOtpSchema)) body: LoginPhoneOtpInput,
    @Headers("accept-language") acceptLanguage?: string,
  ): Promise<AuthResult> {
    return this.auth.loginWithPhoneOtp(body, acceptLanguage);
  }

  @Public()
  @Post("bootstrap-admin")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Elevate a whitelisted account to admin" })
  bootstrapAdmin(
    @Body(new ZodValidationPipe(adminBootstrapSchema)) body: AdminBootstrapInput,
  ): Promise<UserResponse> {
    return this.auth.bootstrapAdmin(body);
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Current authenticated user" })
  me(@CurrentUser() user: AuthUser): Promise<UserResponse> {
    return this.auth.me(user.id);
  }
}

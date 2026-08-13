import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ErrorCode } from "../../../common/http/error-codes";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { APP_CONFIG, AppConfig } from "../../../config/env.schema";
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "../auth.constants";
import { OtpTokenRepository } from "../repositories/otp-token.repository";
import { generateOtpCode, hashToken } from "./secret-token";

/**
 * Issues and verifies one-time codes. Delivery is not yet integrated with an SMS
 * provider, so requests use a development path that logs and returns the code.
 * That path is fail-closed: in production, with no delivery channel configured,
 * requesting a code is refused rather than silently returning it.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: AppLogger,
    private readonly otpTokens: OtpTokenRepository,
  ) {}

  /**
   * Generates a code for a destination and "delivers" it. Returns the code only
   * on the development path so callers can echo it back for local testing.
   */
  async request(
    channel: "phone" | "email",
    destination: string,
  ): Promise<{ devCode: string | null }> {
    if (this.config.NODE_ENV === "production") {
      // No SMS/email OTP transport is wired yet; never return a code silently.
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: "One-time-code delivery is not configured.",
      });
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    await this.otpTokens.issue({
      channel,
      destination,
      codeHash: hashToken(code),
      expiresAt,
    });

    this.logger.warn(
      `[dev otp] channel=${channel} destination=${destination} code=${code}`,
      "OtpService",
    );
    return { devCode: code };
  }

  /** Verifies and consumes a code, enforcing expiry and an attempt cap. */
  async verify(
    channel: "phone" | "email",
    destination: string,
    code: string,
  ): Promise<void> {
    const record = await this.otpTokens.findActive(channel, destination);
    if (!record) {
      throw this.invalid();
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw this.invalid("The code has expired");
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: "Too many incorrect attempts. Request a new code.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (hashToken(code) !== record.codeHash) {
      await this.otpTokens.recordAttempt(record.id);
      throw this.invalid();
    }
    await this.otpTokens.consume(record.id);
  }

  private invalid(message = "Invalid verification code"): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCode.INVALID_CREDENTIALS,
      message,
    });
  }
}

import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AppLogger } from "../../common/logging/app-logger.service";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";
import { AuthController } from "./auth.controller";
import {
  EMAIL_ADAPTER,
  type EmailAdapter,
} from "./adapters/email-adapter";
import { LogEmailAdapter } from "./adapters/log-email.adapter";
import { ResendEmailAdapter } from "./adapters/resend-email.adapter";
import { EmailVerificationTokenRepository } from "./repositories/email-verification-token.repository";
import { OtpTokenRepository } from "./repositories/otp-token.repository";
import { PasswordResetTokenRepository } from "./repositories/password-reset-token.repository";
import { RefreshTokenRepository } from "./repositories/refresh-token.repository";
import { UserRepository } from "./repositories/user.repository";
import {
  EmailVerificationToken,
  EmailVerificationTokenSchema,
} from "./schemas/email-verification-token.schema";
import { OtpToken, OtpTokenSchema } from "./schemas/otp-token.schema";
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from "./schemas/password-reset-token.schema";
import {
  RefreshToken,
  RefreshTokenSchema,
} from "./schemas/refresh-token.schema";
import { User, UserSchema } from "./schemas/user.schema";
import { AuthService } from "./services/auth.service";
import { OtpService } from "./services/otp.service";
import { PasswordService } from "./services/password.service";
import { SocialAuthService } from "./services/social-auth.service";
import { TokenService } from "./services/token.service";

/**
 * Selects the email transport from config. Resend when an API key is present;
 * otherwise the development log transport, which itself refuses to run in
 * production — so a production deployment without a key fails closed.
 */
const emailAdapterProvider = {
  provide: EMAIL_ADAPTER,
  inject: [APP_CONFIG, AppLogger],
  useFactory: (config: AppConfig, logger: AppLogger): EmailAdapter =>
    config.RESEND_API_KEY
      ? new ResendEmailAdapter(config.RESEND_API_KEY, config.EMAIL_FROM, logger)
      : new LogEmailAdapter(config.NODE_ENV === "production", logger),
};

/**
 * Identity and authentication module: user/token collections, the auth flows,
 * and the token service consumed by the global JWT guard. Exports the pieces
 * other feature modules need (token verification and user lookup).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
      { name: EmailVerificationToken.name, schema: EmailVerificationTokenSchema },
      { name: OtpToken.name, schema: OtpTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    UserRepository,
    RefreshTokenRepository,
    PasswordResetTokenRepository,
    EmailVerificationTokenRepository,
    OtpTokenRepository,
    PasswordService,
    TokenService,
    SocialAuthService,
    OtpService,
    AuthService,
    emailAdapterProvider,
  ],
  exports: [TokenService, UserRepository, EMAIL_ADAPTER],
})
export class AuthModule {}

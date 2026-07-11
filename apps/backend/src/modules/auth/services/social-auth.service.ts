import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import appleSignin from "apple-signin-auth";
import { OAuth2Client } from "google-auth-library";
import { ErrorCode } from "../../../common/http/error-codes";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { APP_CONFIG, AppConfig } from "../../../config/env.schema";

/** Normalized identity resolved from a verified social id token. */
export interface SocialIdentity {
  provider: "google" | "apple";
  /** Stable provider subject id (`sub`). */
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/** Shape a development id token must have when no real client IDs are set. */
interface DevSocialToken {
  sub: string;
  email?: string;
  name?: string;
  /** Mirrors a provider's `email_verified`; defaults to false when omitted. */
  emailVerified?: boolean;
}

function unauthorized(message: string): UnauthorizedException {
  return new UnauthorizedException({
    code: ErrorCode.UNAUTHORIZED,
    message,
  });
}

/**
 * Verifies Google/Apple identity tokens.
 *
 * When the provider's accepted audiences are configured, tokens are verified
 * for real against the provider. When they are NOT configured, a development
 * path accepts a self-describing JSON token so local sign-in works without
 * provider credentials — but that path is impossible in production: it is
 * fail-closed and rejects when NODE_ENV is production. Every use of the dev path
 * is logged.
 */
@Injectable()
export class SocialAuthService {
  private readonly googleAudiences: string[];
  private readonly appleAudiences: string[];
  private readonly google = new OAuth2Client();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {
    this.googleAudiences = SocialAuthService.parseList(config.GOOGLE_CLIENT_IDS);
    this.appleAudiences = SocialAuthService.parseList(config.APPLE_CLIENT_IDS);
  }

  async verify(
    provider: "google" | "apple",
    idToken: string,
  ): Promise<SocialIdentity> {
    return provider === "google"
      ? this.verifyGoogle(idToken)
      : this.verifyApple(idToken);
  }

  private async verifyGoogle(idToken: string): Promise<SocialIdentity> {
    if (this.googleAudiences.length === 0) {
      return this.verifyDev("google", idToken);
    }
    const ticket = await this.google
      .verifyIdToken({ idToken, audience: this.googleAudiences })
      .catch(() => {
        throw unauthorized("Google identity token could not be verified");
      });
    const payload = ticket.getPayload();
    if (!payload?.sub) {
      throw unauthorized("Google identity token is missing a subject");
    }
    return {
      provider: "google",
      providerId: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
    };
  }

  private async verifyApple(idToken: string): Promise<SocialIdentity> {
    if (this.appleAudiences.length === 0) {
      return this.verifyDev("apple", idToken);
    }
    const payload = await appleSignin
      .verifyIdToken(idToken, { audience: this.appleAudiences })
      .catch(() => {
        throw unauthorized("Apple identity token could not be verified");
      });
    if (!payload.sub) {
      throw unauthorized("Apple identity token is missing a subject");
    }
    return {
      provider: "apple",
      providerId: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified === "true" || payload.email_verified === true,
      name: null,
    };
  }

  /** Development fallback — rejected outright in production (fail-closed). */
  private verifyDev(
    provider: "google" | "apple",
    idToken: string,
  ): SocialIdentity {
    if (this.config.NODE_ENV === "production") {
      throw unauthorized(
        `${provider} sign-in is not configured; refusing the development path in production.`,
      );
    }
    const parsed = this.parseDevToken(idToken);
    this.logger.warn(
      `Accepting a development ${provider} identity token (no client IDs configured). sub=${parsed.sub}`,
      "SocialAuthService",
    );
    return {
      provider,
      providerId: parsed.sub,
      email: parsed.email ?? null,
      // Do not assume a dev email is verified; only an explicit flag counts,
      // mirroring how a real provider reports `email_verified`.
      emailVerified: parsed.emailVerified === true,
      name: parsed.name ?? null,
    };
  }

  private parseDevToken(idToken: string): DevSocialToken {
    let decoded: unknown;
    try {
      decoded = JSON.parse(idToken);
    } catch {
      throw unauthorized(
        "Development social token must be JSON: {\"sub\":\"...\",\"email\":\"...\"}",
      );
    }
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof (decoded as { sub?: unknown }).sub !== "string"
    ) {
      throw unauthorized("Development social token must include a string 'sub'");
    }
    const value = decoded as Record<string, unknown>;
    return {
      sub: value.sub as string,
      email: typeof value.email === "string" ? value.email : undefined,
      name: typeof value.name === "string" ? value.name : undefined,
      emailVerified: value.emailVerified === true,
    };
  }

  private static parseList(raw: string | undefined): string[] {
    if (!raw) {
      return [];
    }
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
}

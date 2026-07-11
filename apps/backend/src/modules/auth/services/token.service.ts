import { randomUUID } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Role, TokenPair } from "@kitchenpal/api-contract";
import { ErrorCode } from "../../../common/http/error-codes";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { APP_CONFIG, AppConfig } from "../../../config/env.schema";
import type { HydratedDocument } from "mongoose";
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_TTL_SECONDS,
  DEV_ACCESS_SECRET,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../auth.constants";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { UserEntity, UserRepository } from "../repositories/user.repository";
import { generateOpaqueToken, hashToken } from "./secret-token";

/** Claims carried by the access JWT. Identity is `sub`; never trust the body. */
export interface AccessTokenPayload {
  sub: string;
  roles: Role[];
  activeHouseholdId: string | null;
}

/** The minimal principal needed to sign an access token. */
export interface TokenSubject {
  id: string;
  roles: Role[];
  activeHouseholdId: string | null;
}

/** Projects a user document into the token subject used for signing. */
export function toTokenSubject(user: HydratedDocument<UserEntity>): TokenSubject {
  return {
    id: user.id,
    roles: user.roles,
    activeHouseholdId: user.activeHouseholdId
      ? user.activeHouseholdId.toString()
      : null,
  };
}

function unauthorized(message: string): UnauthorizedException {
  return new UnauthorizedException({ code: ErrorCode.UNAUTHORIZED, message });
}

/**
 * Issues and verifies access JWTs and manages refresh-token rotation with
 * reuse detection.
 *
 * Access tokens are stateless, short-lived JWTs. Refresh tokens are opaque,
 * stored only as a hash, single-use, and rotated on every refresh. Presenting a
 * refresh token that was already rotated or revoked is treated as theft: the
 * whole family is revoked, logging out both the attacker and the victim so the
 * chain cannot continue.
 */
@Injectable()
export class TokenService {
  private readonly jwt: JwtService;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly logger: AppLogger,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
  ) {
    let secret: string;
    if (config.JWT_ACCESS_SECRET) {
      secret = config.JWT_ACCESS_SECRET;
    } else {
      // Reachable only outside production (env validation requires the secret in
      // production). Loudly logged so it is never mistaken for a real setup.
      secret = DEV_ACCESS_SECRET;
      this.logger.warn(
        "JWT_ACCESS_SECRET is not set; signing access tokens with an insecure development secret.",
        "TokenService",
      );
    }
    this.jwt = new JwtService({ secret });
  }

  signAccessToken(subject: TokenSubject): string {
    const payload: AccessTokenPayload = {
      sub: subject.id,
      roles: subject.roles,
      activeHouseholdId: subject.activeHouseholdId,
    };
    return this.jwt.sign(payload, {
      algorithm: ACCESS_TOKEN_ALGORITHM,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      // Pin the accepted algorithm so a forged token cannot request a different
      // one (algorithm-confusion / `alg:none` hardening).
      return this.jwt.verify<AccessTokenPayload>(token, {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
      });
    } catch {
      throw unauthorized("Invalid or expired access token");
    }
  }

  /** Starts a fresh rotation family and returns the first token pair. */
  async issueTokenPair(subject: TokenSubject): Promise<TokenPair> {
    return this.mintPair(subject, randomUUID());
  }

  /**
   * Rotates a presented refresh token. The presented token is CLAIMED atomically
   * before any successor is minted, so two concurrent requests carrying the same
   * token cannot both succeed: exactly one wins the claim; the loser (and any
   * later replay of a consumed/revoked token) is treated as reuse and revokes the
   * whole family. Returns a fresh pair plus the up-to-date subject (roles and
   * household are re-read on every refresh).
   */
  async rotate(
    presentedToken: string,
  ): Promise<{ tokens: TokenPair; subject: TokenSubject }> {
    const tokenHash = hashToken(presentedToken);
    const record = await this.refreshTokens.findByHash(tokenHash);
    if (!record) {
      throw unauthorized("Invalid refresh token");
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw unauthorized("Refresh token has expired");
    }

    // Pre-generate the successor so the presented token can be claimed and linked
    // to it in a single atomic step, then only persist the successor if we won.
    const successorToken = generateOpaqueToken();
    const successorHash = hashToken(successorToken);
    const won = await this.refreshTokens.claim(tokenHash, successorHash);
    if (!won) {
      await this.refreshTokens.revokeFamily(record.familyId);
      this.logger.warn(
        `Refresh token reuse detected for user ${record.userId.toString()}; revoked token family.`,
        "TokenService",
      );
      throw unauthorized("Refresh token has already been used");
    }

    const user = await this.users.findById(record.userId.toString());
    if (!user) {
      await this.refreshTokens.revokeFamily(record.familyId);
      throw unauthorized("Account no longer exists");
    }

    const subject = toTokenSubject(user);
    await this.refreshTokens.issue({
      userId: subject.id,
      familyId: record.familyId,
      tokenHash: successorHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    return {
      tokens: {
        accessToken: this.signAccessToken(subject),
        refreshToken: successorToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
      subject,
    };
  }

  /** Revokes the family that a presented refresh token belongs to (logout). */
  async revokeByToken(presentedToken: string): Promise<void> {
    const record = await this.refreshTokens.findByHash(hashToken(presentedToken));
    if (record) {
      await this.refreshTokens.revokeFamily(record.familyId);
    }
  }

  /** Revokes every refresh family for a user (password reset / lockout). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  /** Signs an access token and persists a new refresh token in `familyId`. */
  private async mintPair(
    subject: TokenSubject,
    familyId: string,
  ): Promise<TokenPair> {
    const refreshToken = generateOpaqueToken();
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    await this.refreshTokens.issue({
      userId: subject.id,
      familyId,
      tokenHash,
      expiresAt,
    });

    return {
      accessToken: this.signAccessToken(subject),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}

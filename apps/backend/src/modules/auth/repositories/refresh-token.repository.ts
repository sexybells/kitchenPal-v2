import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model, Types } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { RefreshToken } from "../schemas/refresh-token.schema";

export type RefreshTokenEntity = RefreshToken & BaseDocumentFields;

/**
 * Data access for refresh-token rotation chains. All lifecycle transitions
 * (rotate, revoke, revoke-family) are expressed here so the token service stays
 * focused on policy. Reads are by token hash; a raw token is never persisted.
 */
@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshTokenEntity> {
  constructor(@InjectModel(RefreshToken.name) model: Model<RefreshTokenEntity>) {
    super(model);
  }

  issue(data: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<HydratedDocument<RefreshTokenEntity>> {
    return this.create({
      userId: new Types.ObjectId(data.userId),
      familyId: data.familyId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    });
  }

  findByHash(
    tokenHash: string,
  ): Promise<HydratedDocument<RefreshTokenEntity> | null> {
    return this.findOne({ tokenHash });
  }

  /**
   * Atomically CLAIMS a live token for rotation: marks it consumed and links its
   * successor, but only if it is still unrotated and unrevoked. Returns true when
   * this caller won the claim. A false result means the token was already
   * consumed or revoked (a concurrent double-submit or a replay) — the caller
   * must treat it as reuse. This compare-and-swap is what makes rotation safe
   * under concurrency: exactly one request can ever mint a successor per token.
   */
  async claim(tokenHash: string, replacedByHash: string): Promise<boolean> {
    const claimed = await this.model
      .findOneAndUpdate(
        { tokenHash, rotatedAt: null, revokedAt: null },
        { $set: { rotatedAt: new Date(), replacedByHash } },
        { new: true },
      )
      .exec();
    return claimed !== null;
  }

  /** Revokes every still-live token in a family (reuse detection / logout). */
  async revokeFamily(familyId: string): Promise<void> {
    await this.model
      .updateMany(
        { familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }

  /** Revokes every family for a user (password reset, account lockout). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.model
      .updateMany(
        { userId: new Types.ObjectId(userId), revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }
}

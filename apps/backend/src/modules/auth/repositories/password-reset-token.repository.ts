import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model, Types } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { PasswordResetToken } from "../schemas/password-reset-token.schema";

export type PasswordResetTokenEntity = PasswordResetToken & BaseDocumentFields;

/** Data access for single-use password-reset grants (stored hashed). */
@Injectable()
export class PasswordResetTokenRepository extends BaseRepository<PasswordResetTokenEntity> {
  constructor(
    @InjectModel(PasswordResetToken.name)
    model: Model<PasswordResetTokenEntity>,
  ) {
    super(model);
  }

  issue(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<HydratedDocument<PasswordResetTokenEntity>> {
    return this.create({
      userId: new Types.ObjectId(data.userId),
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    });
  }

  findByHash(
    tokenHash: string,
  ): Promise<HydratedDocument<PasswordResetTokenEntity> | null> {
    return this.findOne({ tokenHash });
  }

  /**
   * Atomically consumes a token, only if it is still unused. Returns true when
   * this caller consumed it — so two concurrent resets with the same token cannot
   * both proceed (single-use is enforced by the compare-and-swap, not a prior read).
   */
  async consume(tokenHash: string): Promise<boolean> {
    const consumed = await this.model
      .findOneAndUpdate(
        { tokenHash, consumedAt: null },
        { $set: { consumedAt: new Date() } },
        { new: true },
      )
      .exec();
    return consumed !== null;
  }
}

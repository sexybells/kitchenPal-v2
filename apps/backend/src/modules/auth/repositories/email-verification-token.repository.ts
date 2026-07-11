import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model, Types } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { EmailVerificationToken } from "../schemas/email-verification-token.schema";

export type EmailVerificationTokenEntity = EmailVerificationToken &
  BaseDocumentFields;

/** Data access for single-use email-verification grants (stored hashed). */
@Injectable()
export class EmailVerificationTokenRepository extends BaseRepository<EmailVerificationTokenEntity> {
  constructor(
    @InjectModel(EmailVerificationToken.name)
    model: Model<EmailVerificationTokenEntity>,
  ) {
    super(model);
  }

  issue(data: {
    userId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<HydratedDocument<EmailVerificationTokenEntity>> {
    return this.create({
      userId: new Types.ObjectId(data.userId),
      email: data.email.toLowerCase(),
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    });
  }

  findByHash(
    tokenHash: string,
  ): Promise<HydratedDocument<EmailVerificationTokenEntity> | null> {
    return this.findOne({ tokenHash });
  }

  /**
   * Atomically consumes a token, only if it is still unused. Returns true when
   * this caller consumed it, making verification single-use even under concurrent
   * requests carrying the same token.
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

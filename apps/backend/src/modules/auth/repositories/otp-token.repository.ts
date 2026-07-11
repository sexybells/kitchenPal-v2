import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { OtpToken } from "../schemas/otp-token.schema";

export type OtpTokenEntity = OtpToken & BaseDocumentFields;

/** Data access for one-time verification codes (stored hashed). */
@Injectable()
export class OtpTokenRepository extends BaseRepository<OtpTokenEntity> {
  constructor(@InjectModel(OtpToken.name) model: Model<OtpTokenEntity>) {
    super(model);
  }

  issue(data: {
    channel: "phone" | "email";
    destination: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<HydratedDocument<OtpTokenEntity>> {
    return this.create({
      channel: data.channel,
      destination: data.destination,
      codeHash: data.codeHash,
      expiresAt: data.expiresAt,
    });
  }

  /** The latest unconsumed code for a destination (most recent request wins). */
  findActive(
    channel: "phone" | "email",
    destination: string,
  ): Promise<HydratedDocument<OtpTokenEntity> | null> {
    return this.model
      .findOne(this.notDeletedFilter({ channel, destination, consumedAt: null }))
      .sort({ createdAt: -1 })
      .exec();
  }

  async recordAttempt(id: string): Promise<void> {
    await this.model.updateOne({ _id: id }, { $inc: { attempts: 1 } }).exec();
  }

  async consume(id: string): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { consumedAt: new Date() } })
      .exec();
  }
}

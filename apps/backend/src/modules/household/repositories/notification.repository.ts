import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { HydratedDocument, Model } from "mongoose";
import { BaseRepository } from "../../../common/database/base.repository";
import type { BaseDocumentFields } from "../../../common/database/base.schema";
import { Notification } from "../schemas/notification.schema";

export type NotificationEntity = Notification & BaseDocumentFields;

type NotificationDoc = HydratedDocument<NotificationEntity>;

/** Data access for per-user notifications (always scoped by userId). */
@Injectable()
export class NotificationRepository extends BaseRepository<NotificationEntity> {
  constructor(
    @InjectModel(Notification.name) model: Model<NotificationEntity>,
  ) {
    super(model);
  }

  /** One notification, only when it belongs to the given user. */
  findForUser(userId: string, id: string): Promise<NotificationDoc | null> {
    return this.findOne({ _id: id, userId });
  }

  /** A page of a user's notifications (newest first) plus the total count. */
  async page(
    userId: string,
    unreadOnly: boolean,
    skip: number,
    limit: number,
  ): Promise<{ items: NotificationDoc[]; total: number }> {
    const filter: Record<string, unknown> = { userId, deletedAt: null };
    if (unreadOnly) {
      filter.readAt = null;
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  /** Marks one of the user's notifications read; returns the updated doc. */
  markRead(userId: string, id: string): Promise<NotificationDoc | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, userId, deletedAt: null, readAt: null },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .exec();
  }
}

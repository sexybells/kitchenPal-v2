import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  MessageQuery,
  MessageResponse,
  MessageType,
  SendImageMessageInput,
  SendTextMessageInput,
  SendVoteMessageInput,
  VotePayload,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { PageResult, paginate } from "../../../common/http/page-result";
import {
  HouseholdMessageEntity,
  HouseholdMessageRepository,
} from "../repositories/household-message.repository";
import { HouseholdMemberRepository } from "../repositories/household-member.repository";
import { MembershipService } from "./membership.service";
import { NotificationService } from "./notification.service";
import { RealtimeEmitter } from "../realtime/realtime-emitter";

type MessageDoc = HydratedDocument<HouseholdMessageEntity>;

/** A system card the spending seam posts (no acting member authors it). */
export interface PostCardInput {
  type: Extract<MessageType, "expense" | "budget_alert">;
  text: string;
  senderId: string;
  expenseId?: string | null;
}

/**
 * Household chat: text/image/vote messages, live vote tallies, and read
 * receipts. Every entry point re-verifies active membership via
 * {@link MembershipService}, so REST and the socket gateway (which both call
 * this service) share one enforcement path — a non-member can never read or post.
 * Sends emit to the household room and notify the other members.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly messages: HouseholdMessageRepository,
    private readonly members: HouseholdMemberRepository,
    private readonly membership: MembershipService,
    private readonly notifications: NotificationService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async listMessages(
    householdId: string,
    userId: string,
    query: MessageQuery,
  ): Promise<PageResult<MessageResponse>> {
    await this.membership.requireActiveMember(householdId, userId);
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.messages.page(
      householdId,
      skip,
      query.limit,
    );
    const nextSkip = skip + items.length;
    const hasMore = nextSkip < total;
    return paginate(items.map(toMessageResponse), {
      nextCursor: hasMore ? encodeCursor(nextSkip) : null,
      total,
    });
  }

  async sendText(
    householdId: string,
    userId: string,
    input: SendTextMessageInput,
  ): Promise<MessageResponse> {
    await this.membership.requireActiveMember(householdId, userId);
    const doc = await this.messages.create(
      {
        householdId,
        senderId: userId,
        type: "text",
        text: input.text,
        readByUserIds: [userId],
      } as unknown as Partial<HouseholdMessageEntity>,
      userId,
    );
    return this.publish(householdId, userId, doc, previewOf(input.text));
  }

  async sendImage(
    householdId: string,
    userId: string,
    input: SendImageMessageInput,
  ): Promise<MessageResponse> {
    await this.membership.requireActiveMember(householdId, userId);
    const doc = await this.messages.create(
      {
        householdId,
        senderId: userId,
        type: "image",
        imageUrl: input.imageUrl,
        readByUserIds: [userId],
      } as unknown as Partial<HouseholdMessageEntity>,
      userId,
    );
    return this.publish(householdId, userId, doc, "Sent a photo");
  }

  async sendVote(
    householdId: string,
    userId: string,
    input: SendVoteMessageInput,
  ): Promise<MessageResponse> {
    await this.membership.requireActiveMember(householdId, userId);
    const options = input.options.map((label) => ({
      id: randomUUID(),
      label,
    }));
    const doc = await this.messages.create(
      {
        householdId,
        senderId: userId,
        type: "vote",
        vote: { question: input.question, options, ballots: [] },
        readByUserIds: [userId],
      } as unknown as Partial<HouseholdMessageEntity>,
      userId,
    );
    return this.publish(householdId, userId, doc, `Poll: ${input.question}`);
  }

  /**
   * Casts (or moves) the caller's vote. The existing ballot is replaced so a
   * member has exactly one vote. Emits the recomputed tally to the room.
   */
  async castVote(
    householdId: string,
    userId: string,
    messageId: string,
    optionId: string,
  ): Promise<MessageResponse> {
    await this.membership.requireActiveMember(householdId, userId);
    const message = await this.messages.findInHousehold(householdId, messageId);
    if (!message || message.type !== "vote" || !message.vote) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Vote message not found",
        details: { messageId },
      });
    }
    const validOption = message.vote.options.some(
      (option) => option.id === optionId,
    );
    if (!validOption) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "Unknown vote option",
        details: { optionId },
      });
    }
    const updated = await this.messages.setBallot(
      householdId,
      messageId,
      userId,
      optionId,
    );
    const response = toMessageResponse(updated ?? message);
    this.realtime.emitToHousehold(householdId, "voteUpdated", response);
    return response;
  }

  async markRead(
    householdId: string,
    userId: string,
    messageIds: string[],
  ): Promise<{ marked: number }> {
    await this.membership.requireActiveMember(householdId, userId);
    await this.messages.markRead(householdId, messageIds, userId);
    this.realtime.emitToHousehold(householdId, "messagesRead", {
      householdId,
      userId,
      messageIds,
    });
    return { marked: messageIds.length };
  }

  /**
   * Posts a system card (expense/budget alert) into a household's chat. Called by
   * the spending seam after an expense is logged in household context. There is no
   * membership check on the acting user here — the spending scope guard already
   * proved household membership before the expense was written.
   */
  async postCard(
    householdId: string,
    input: PostCardInput,
  ): Promise<MessageResponse> {
    const doc = await this.messages.create(
      {
        householdId,
        senderId: input.senderId,
        type: input.type,
        text: input.text,
        expenseId: input.expenseId ?? null,
        readByUserIds: [input.senderId],
      } as unknown as Partial<HouseholdMessageEntity>,
      input.senderId,
    );
    const response = toMessageResponse(doc);
    this.realtime.emitToHousehold(householdId, "message", response);
    return response;
  }

  /** Emits a new message to the room and notifies the other active members. */
  private async publish(
    householdId: string,
    senderId: string,
    doc: MessageDoc,
    preview: string,
  ): Promise<MessageResponse> {
    const response = toMessageResponse(doc);
    this.realtime.emitToHousehold(householdId, "message", response);

    const memberIds = await this.members.activeMemberIds(householdId);
    const recipients = memberIds.filter((id) => id !== senderId);
    if (recipients.length > 0) {
      await this.notifications.notifyMany(recipients, {
        type: "chat_message",
        payload: { householdId, messageId: response.id, preview },
        delivery: { push: { title: "New message", body: preview } },
      });
    }
    return response;
  }
}

/** Builds the wire message, computing the live vote tally from its ballots. */
function toMessageResponse(doc: MessageDoc): MessageResponse {
  let vote: VotePayload | null = null;
  if (doc.type === "vote" && doc.vote) {
    const tally = doc.vote.options.map((option) => {
      const voterIds = doc.vote!.ballots
        .filter((ballot) => ballot.optionId === option.id)
        .map((ballot) => ballot.userId.toString());
      return { optionId: option.id, count: voterIds.length, voterIds };
    });
    vote = {
      question: doc.vote.question,
      options: doc.vote.options.map((option) => ({
        id: option.id,
        label: option.label,
      })),
      tally,
    };
  }
  return {
    id: doc.id,
    householdId: doc.householdId.toString(),
    senderId: doc.senderId ? doc.senderId.toString() : null,
    type: doc.type,
    text: doc.text ?? null,
    imageUrl: doc.imageUrl ?? null,
    expenseId: doc.expenseId ? doc.expenseId.toString() : null,
    vote,
    readByUserIds: doc.readByUserIds.map((id) => id.toString()),
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

function previewOf(text: string): string {
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const decoded = Number.parseInt(
    Buffer.from(cursor, "base64url").toString("utf8"),
    10,
  );
  return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
}

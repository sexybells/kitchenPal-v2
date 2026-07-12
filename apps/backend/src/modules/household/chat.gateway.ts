import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import {
  castVoteSchema,
  householdIdParamSchema,
  markReadSchema,
  sendTextMessageSchema,
} from "@kitchenpal/api-contract";
import { AppLogger } from "../../common/logging/app-logger.service";
import { TokenService } from "../auth/services/token.service";
import { ChatService } from "./services/chat.service";
import { MembershipService } from "./services/membership.service";
import { householdRoom, userRoom, RealtimeEmitter } from "./realtime/realtime-emitter";

/** Acknowledgement returned to the emitting client for every event. */
interface Ack {
  ok: boolean;
  data?: unknown;
  error?: string;
}

function ok(data?: unknown): Ack {
  return { ok: true, data };
}

function fail(error: string): Ack {
  return { ok: false, error };
}

/**
 * Realtime chat + notification gateway. Scoped to chat and notifications only —
 * pantry/shopping live-sync is deferred.
 *
 * Security: the connection is authenticated from the JWT in the handshake (never
 * a client-sent userId); an invalid/missing token is disconnected immediately.
 * `joinHousehold` verifies ACTIVE membership before joining the room and emits
 * `joinRejected` otherwise, so a non-member socket never receives a household's
 * messages. CORS is enforced by the server adapter's allowlist.
 */
@WebSocketGateway({ transports: ["websocket", "polling"] })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection
{
  @WebSocketServer() private server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly chat: ChatService,
    private readonly membership: MembershipService,
    private readonly realtime: RealtimeEmitter,
    private readonly logger: AppLogger,
  ) {}

  afterInit(server: Server): void {
    // Hand the live server to the emitter so services can push to rooms.
    this.realtime.bind(server);
  }

  handleConnection(client: Socket): void {
    const token = extractToken(client);
    if (!token) {
      this.reject(client, "Missing authentication token");
      return;
    }
    try {
      const payload = this.tokens.verifyAccessToken(token);
      // Identity is taken ONLY from the verified token, never from the client.
      client.data.userId = payload.sub;
      // Every socket joins its own room so notifications reach all its devices.
      void client.join(userRoom(payload.sub));
    } catch {
      this.reject(client, "Invalid or expired token");
    }
  }

  @SubscribeMessage("joinHousehold")
  async joinHousehold(client: Socket, payload: unknown): Promise<Ack> {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      return fail("Not authenticated");
    }
    const parsed = householdIdParamSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("A valid householdId is required");
    }
    const { householdId } = parsed.data;
    // MembershipVerifier contract order is (userId, householdId).
    const isMember = await this.membership.isActiveMember(userId, householdId);
    if (!isMember) {
      // Fail closed: do NOT join the room; tell the client it was rejected.
      client.emit("joinRejected", { householdId });
      return fail("You are not an active member of this household");
    }
    await client.join(householdRoom(householdId));
    return ok({ householdId });
  }

  @SubscribeMessage("leaveHousehold")
  async leaveHousehold(client: Socket, payload: unknown): Promise<Ack> {
    const parsed = householdIdParamSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("A valid householdId is required");
    }
    await client.leave(householdRoom(parsed.data.householdId));
    return ok();
  }

  @SubscribeMessage("sendMessage")
  async sendMessage(client: Socket, payload: unknown): Promise<Ack> {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      return fail("Not authenticated");
    }
    const idParse = householdIdParamSchema.safeParse(payload);
    const textParse = sendTextMessageSchema.safeParse(payload);
    if (!idParse.success || !textParse.success) {
      return fail("householdId and text are required");
    }
    try {
      const message = await this.chat.sendText(
        idParse.data.householdId,
        userId,
        textParse.data,
      );
      return ok(message);
    } catch (error) {
      return fail((error as Error).message);
    }
  }

  @SubscribeMessage("castVote")
  async castVote(client: Socket, payload: unknown): Promise<Ack> {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      return fail("Not authenticated");
    }
    const idParse = householdIdParamSchema.safeParse(payload);
    const voteParse = castVoteSchema.safeParse(payload);
    const body = payload as { messageId?: unknown };
    if (
      !idParse.success ||
      !voteParse.success ||
      typeof body.messageId !== "string"
    ) {
      return fail("householdId, messageId and optionId are required");
    }
    try {
      const message = await this.chat.castVote(
        idParse.data.householdId,
        userId,
        body.messageId,
        voteParse.data.optionId,
      );
      return ok(message);
    } catch (error) {
      return fail((error as Error).message);
    }
  }

  @SubscribeMessage("markRead")
  async markRead(client: Socket, payload: unknown): Promise<Ack> {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      return fail("Not authenticated");
    }
    const idParse = householdIdParamSchema.safeParse(payload);
    const readParse = markReadSchema.safeParse(payload);
    if (!idParse.success || !readParse.success) {
      return fail("householdId and messageIds are required");
    }
    try {
      const result = await this.chat.markRead(
        idParse.data.householdId,
        userId,
        readParse.data.messageIds,
      );
      return ok(result);
    } catch (error) {
      return fail((error as Error).message);
    }
  }

  private reject(client: Socket, reason: string): void {
    this.logger.warn(
      `Rejected socket ${client.id}: ${reason}`,
      "ChatGateway",
    );
    client.emit("unauthorized", { message: reason });
    client.disconnect(true);
  }
}

/** Reads the JWT from the handshake auth payload or the Authorization header. */
function extractToken(client: Socket): string | null {
  const auth = client.handshake.auth as { token?: unknown } | undefined;
  if (auth && typeof auth.token === "string" && auth.token.length > 0) {
    return auth.token;
  }
  const header = client.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }
  return null;
}

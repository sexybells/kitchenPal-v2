import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

/** Room a household's members share; only active members are ever joined to it. */
export function householdRoom(householdId: string): string {
  return `household:${householdId}`;
}

/** Per-user room every authenticated socket joins, for direct notifications. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Decouples the chat/notification services from the WebSocket gateway. The
 * gateway binds its Socket.IO server here at init; services emit through it
 * without a direct (circular) dependency on the gateway. When no server is bound
 * (e.g. a unit test with the gateway absent) emits are silent no-ops.
 */
@Injectable()
export class RealtimeEmitter {
  private server: Server | null = null;

  /** Called once by the gateway when its server is ready. */
  bind(server: Server): void {
    this.server = server;
  }

  /** Emits to every socket currently joined to the household room. */
  emitToHousehold(householdId: string, event: string, payload: unknown): void {
    this.server?.to(householdRoom(householdId)).emit(event, payload);
  }

  /** Emits to every device the user has connected. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  /**
   * Forces all of the user's live sockets out of a household room after their
   * membership is revoked, so a still-open socket stops receiving that
   * household's broadcasts (leaving their other households intact). Uses the
   * adapter-aware `socketsLeave`, so it propagates across instances through the
   * Redis adapter in production.
   */
  evictUserFromHousehold(userId: string, householdId: string): void {
    this.server
      ?.in(userRoom(userId))
      .socketsLeave(householdRoom(householdId));
  }
}

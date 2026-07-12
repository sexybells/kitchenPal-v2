import { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server, ServerOptions } from "socket.io";
import { AppLogger } from "../logging/app-logger.service";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";

type OriginCallback = (err: Error | null, allow?: boolean) => void;

/**
 * Socket.IO adapter that pins CORS to an explicit allowlist and, in production,
 * fans events across instances through Redis.
 *
 * CORS fails closed: only origins listed in `SOCKET_CORS_ORIGINS` are allowed for
 * browser clients — a wildcard is never used. Requests without an `Origin`
 * header (native mobile clients, which the JWT handshake still authenticates) are
 * allowed through; any other unlisted browser origin is rejected.
 */
export class AuthenticatedIoAdapter extends IoAdapter {
  private readonly config: AppConfig;
  private readonly logger: AppLogger;
  private readonly allowedOrigins: string[];
  private redisClients: { pub: Redis; sub: Redis } | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
    this.config = app.get<AppConfig>(APP_CONFIG);
    this.logger = app.get(AppLogger);
    this.allowedOrigins = (this.config.SOCKET_CORS_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: (origin: string | undefined, callback: OriginCallback): void => {
          // No Origin header → native client; allow (JWT handshake still gates it).
          if (!origin || this.allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          this.logger.warn(
            `Rejected socket connection from disallowed origin: ${origin}`,
            "AuthenticatedIoAdapter",
          );
          callback(new Error("Origin not allowed"), false);
        },
        credentials: true,
      },
    }) as Server;

    // Cross-instance delivery in production; a single dev/test node uses the
    // default in-memory adapter, so no Redis is required to run the gateway.
    if (this.config.NODE_ENV === "production" && this.config.REDIS_URL) {
      const pub = new Redis(this.config.REDIS_URL);
      const sub = pub.duplicate();
      this.redisClients = { pub, sub };
      server.adapter(createAdapter(pub, sub));
      this.logger.log(
        "Socket.IO Redis adapter enabled for cross-instance delivery",
        "AuthenticatedIoAdapter",
      );
    }

    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    if (this.redisClients) {
      this.redisClients.pub.disconnect();
      this.redisClients.sub.disconnect();
      this.redisClients = null;
    }
  }
}

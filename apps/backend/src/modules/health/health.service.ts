import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";

const MONGO_STATE: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export interface HealthReport {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  mongo: string;
}

/** Reports process liveness and MongoDB connectivity. */
@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  check(): HealthReport {
    const state = this.connection.readyState;
    return {
      status: state === 1 ? "ok" : "degraded",
      uptimeSeconds: Math.floor(process.uptime()),
      mongo: MONGO_STATE[state] ?? "unknown",
    };
  }
}

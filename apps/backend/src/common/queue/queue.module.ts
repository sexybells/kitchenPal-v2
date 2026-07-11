import { BullModule } from "@nestjs/bullmq";
import { Global, Logger, Module } from "@nestjs/common";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";

/**
 * Registers the shared BullMQ connection so feature modules can add queues with
 * `BullModule.registerQueue`. No queues are declared here, so no Redis
 * connection is opened until a feature registers one.
 *
 * `REDIS_URL` is guaranteed present in production by env validation, so the
 * localhost fallback below is reachable only in development/test and is logged.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        if (config.REDIS_URL) {
          return { connection: { url: config.REDIS_URL } };
        }
        if (config.NODE_ENV !== "test") {
          new Logger(AppQueueModule.name).warn(
            "REDIS_URL is not set; BullMQ will use the localhost fallback (development only).",
          );
        }
        return { connection: { host: "127.0.0.1", port: 6379 } };
      },
    }),
  ],
  exports: [BullModule],
})
export class AppQueueModule {}

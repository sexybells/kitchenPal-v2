import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerModuleOptions,
} from "@nestjs/throttler";
import Redis from "ioredis";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";

/**
 * Global rate limiting. Uses Redis-backed storage (shared across instances)
 * when `REDIS_URL` is set outside tests; otherwise the default in-memory store
 * keeps single-instance dev and tests hermetic. Registered as a global guard.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): ThrottlerModuleOptions => ({
        throttlers: [
          { ttl: config.THROTTLE_TTL, limit: config.THROTTLE_LIMIT },
        ],
        storage:
          config.REDIS_URL && config.NODE_ENV !== "test"
            ? new ThrottlerStorageRedisService(new Redis(config.REDIS_URL))
            : undefined,
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  exports: [ThrottlerModule],
})
export class AppThrottlerModule {}

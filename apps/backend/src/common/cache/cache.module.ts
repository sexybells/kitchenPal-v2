import { createKeyv } from "@keyv/redis";
import { CacheModule, CacheOptions } from "@nestjs/cache-manager";
import { Global, Module } from "@nestjs/common";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";

/**
 * Global cache. Backed by Redis when `REDIS_URL` is set (outside tests),
 * otherwise an in-memory store so development and tests run without Redis.
 */
@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): CacheOptions => {
        if (config.REDIS_URL && config.NODE_ENV !== "test") {
          return { stores: [createKeyv(config.REDIS_URL)] };
        }
        return {};
      },
    }),
  ],
  exports: [CacheModule],
})
export class AppCacheModule {}

import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AppCacheModule } from "./common/cache/cache.module";
import { DatabaseModule } from "./common/database/database.module";
import { AllExceptionsFilter } from "./common/http/all-exceptions.filter";
import { ResponseInterceptor } from "./common/http/response.interceptor";
import { LoggingModule } from "./common/logging/logging.module";
import { RequestIdMiddleware } from "./common/logging/request-id.middleware";
import { AppQueueModule } from "./common/queue/queue.module";
import { ScopeGuard } from "./common/scope/scope.guard";
import { AppThrottlerModule } from "./common/throttler/throttler.module";
import { AppConfigModule } from "./config/config.module";
import { HealthModule } from "./modules/health/health.module";
import { LogsModule } from "./modules/logs/logs.module";

/**
 * Root module wiring the core platform: config, logging, database, cache,
 * rate limiting, queues, and the global envelope/filter/scope providers that
 * every feature module inherits.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    DatabaseModule,
    AppCacheModule,
    AppThrottlerModule,
    AppQueueModule,
    LogsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ScopeGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

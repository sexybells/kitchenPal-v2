import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AppCacheModule } from "./common/cache/cache.module";
import { DatabaseModule } from "./common/database/database.module";
import { AllExceptionsFilter } from "./common/http/all-exceptions.filter";
import { ResponseInterceptor } from "./common/http/response.interceptor";
import { LoggingModule } from "./common/logging/logging.module";
import { RequestIdMiddleware } from "./common/logging/request-id.middleware";
import { AppQueueModule } from "./common/queue/queue.module";
import { RolesGuard } from "./common/scope/roles.guard";
import { ScopeGuard } from "./common/scope/scope.guard";
import { AppThrottlerModule } from "./common/throttler/throttler.module";
import { AppConfigModule } from "./config/config.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CommunityModule } from "./modules/community/community.module";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { HealthModule } from "./modules/health/health.module";
import { HouseholdModule } from "./modules/household/household.module";
import { LogsModule } from "./modules/logs/logs.module";
import { PantryModule } from "./modules/pantry/pantry.module";
import { RecipesModule } from "./modules/recipes/recipes.module";
import { ShoppingModule } from "./modules/shopping/shopping.module";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";
import { UploadsModule } from "./modules/uploads/uploads.module";
import { UsersModule } from "./modules/users/users.module";

/**
 * Root module wiring the core platform plus the identity/auth feature modules.
 * Global guard order matters: {@link JwtAuthGuard} runs first to authenticate and
 * populate `request.user`, then {@link ScopeGuard} resolves the data scope from
 * that verified principal. Everything is authenticated unless a route is `@Public`.
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
    AuthModule,
    UsersModule,
    UploadsModule,
    PantryModule,
    RecipesModule,
    CommunityModule,
    HouseholdModule,
    ShoppingModule,
    SubscriptionsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Runs after authentication so `request.user` is populated; enforces every
    // `@Roles(...)` route (admin console) globally, not just where remembered.
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

import { Global, Module } from "@nestjs/common";
import { APP_CONFIG, loadConfig } from "./env.schema";

/**
 * Global config module. Provides the validated {@link APP_CONFIG} object so any
 * module can inject typed configuration via `@Inject(APP_CONFIG)`.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}

import { Global, Module } from "@nestjs/common";
import { AppLogger } from "./app-logger.service";

/** Provides the structured {@link AppLogger} application-wide. */
@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggingModule {}

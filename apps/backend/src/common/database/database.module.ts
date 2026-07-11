import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";

/**
 * Establishes the shared MongoDB connection from validated config. The
 * connection is global; feature modules register their models with
 * `MongooseModule.forFeature`.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ uri: config.MONGODB_URI }),
    }),
  ],
})
export class DatabaseModule {}

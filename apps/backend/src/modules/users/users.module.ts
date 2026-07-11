import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { TipsStateRepository } from "./repositories/tips-state.repository";
import { UserSettingsRepository } from "./repositories/user-settings.repository";
import { TipsState, TipsStateSchema } from "./schemas/tips-state.schema";
import {
  UserSettings,
  UserSettingsSchema,
} from "./schemas/user-settings.schema";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/**
 * User-account module: settings and tips state. Depends on {@link AuthModule}
 * for user lookup (locale sync, admin counts).
 */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: UserSettings.name, schema: UserSettingsSchema },
      { name: TipsState.name, schema: TipsStateSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, UserSettingsRepository, TipsStateRepository],
})
export class UsersModule {}

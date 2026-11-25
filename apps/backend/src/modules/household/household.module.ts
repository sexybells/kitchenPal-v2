import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AppLogger } from "../../common/logging/app-logger.service";
import { MembershipVerifier } from "../../common/scope/membership";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { ChatController } from "./chat.controller";
import { ChatGateway } from "./chat.gateway";
import { HouseholdController } from "./household.controller";
import { InviteController } from "./invite.controller";
import { NotificationController } from "./notification.controller";
import { ExpoPushSender } from "./notifications/expo-push.sender";
import { LogPushSender } from "./notifications/log-push.sender";
import { PUSH_SENDER, type PushSender } from "./notifications/push-sender";
import { RealtimeEmitter } from "./realtime/realtime-emitter";
import { HouseholdInviteRepository } from "./repositories/household-invite.repository";
import { HouseholdMemberRepository } from "./repositories/household-member.repository";
import { HouseholdMessageRepository } from "./repositories/household-message.repository";
import { HouseholdRepository } from "./repositories/household.repository";
import { NotificationRepository } from "./repositories/notification.repository";
import {
  HouseholdInvite,
  HouseholdInviteSchema,
} from "./schemas/household-invite.schema";
import {
  HouseholdMember,
  HouseholdMemberSchema,
} from "./schemas/household-member.schema";
import {
  HouseholdMessage,
  HouseholdMessageSchema,
} from "./schemas/household-message.schema";
import { Household, HouseholdSchema } from "./schemas/household.schema";
import {
  Notification,
  NotificationSchema,
} from "./schemas/notification.schema";
import { ChatService } from "./services/chat.service";
import { ChatSpendingEvents } from "./services/chat-spending-events";
import { HouseholdService } from "./services/household.service";
import { MembershipService } from "./services/membership.service";
import { NotificationService } from "./services/notification.service";

/**
 * Selects the push transport from config. Expo when push is enabled; otherwise
 * the development log transport (a logged no-op) so an unconfigured deployment
 * still records in-app notifications and never crashes.
 */
const pushSenderProvider = {
  provide: PUSH_SENDER,
  inject: [APP_CONFIG, AppLogger],
  useFactory: (config: AppConfig, logger: AppLogger): PushSender =>
    config.EXPO_PUSH_ENABLED
      ? new ExpoPushSender(logger, config.EXPO_ACCESS_TOKEN)
      : new LogPushSender(config.NODE_ENV === "production", logger),
};

/**
 * Households, realtime chat, and notifications. Depends on {@link AuthModule}
 * (JWT verification for the socket handshake + user lookup) and {@link UsersModule}
 * (settings/push tokens for fan-out). Binds {@link MembershipService} to the
 * shared {@link MembershipVerifier} the scope guard uses, and exports
 * {@link ChatSpendingEvents} so the shopping module can make the expense/budget
 * chat-card seam live.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Household.name, schema: HouseholdSchema },
      { name: HouseholdMember.name, schema: HouseholdMemberSchema },
      { name: HouseholdInvite.name, schema: HouseholdInviteSchema },
      { name: HouseholdMessage.name, schema: HouseholdMessageSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [
    HouseholdController,
    InviteController,
    ChatController,
    NotificationController,
  ],
  providers: [
    HouseholdRepository,
    HouseholdMemberRepository,
    HouseholdInviteRepository,
    HouseholdMessageRepository,
    NotificationRepository,
    MembershipService,
    { provide: MembershipVerifier, useExisting: MembershipService },
    HouseholdService,
    ChatService,
    NotificationService,
    ChatSpendingEvents,
    RealtimeEmitter,
    ChatGateway,
    pushSenderProvider,
  ],
  // The reminder job resolves a user's household and sends through notify().
  exports: [
    MembershipVerifier,
    ChatSpendingEvents,
    HouseholdMemberRepository,
    NotificationService,
  ],
})
export class HouseholdModule {}

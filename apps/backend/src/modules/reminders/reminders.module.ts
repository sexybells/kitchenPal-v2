import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { HouseholdModule } from "../household/household.module";
import { RecipesModule } from "../recipes/recipes.module";
import { UsersModule } from "../users/users.module";
import {
  MEAL_REMINDERS_QUEUE,
  ReminderSchedulerService,
} from "./reminder-scheduler.service";
import { ReminderTickProcessor } from "./reminder-tick.processor";
import { ReminderTickService } from "./reminder-tick.service";
import { ReminderDeliveryRepository } from "./repositories/reminder-delivery.repository";
import {
  ReminderDelivery,
  ReminderDeliverySchema,
} from "./schemas/reminder-delivery.schema";

/**
 * The queue, worker and scheduler open Redis connections, so they are left out
 * entirely under `NODE_ENV=test` (e2e suites boot the app without Redis). Read
 * from `process.env` because module imports are fixed before config is
 * injectable; it is the same variable `envSchema` validates.
 */
const schedulingEnabled = process.env.NODE_ENV !== "test";

/**
 * Daily 16:00 (user-local) meal reminder: an hourly BullMQ tick that sends one
 * vegetarian-day or use-it-up push per user per local date.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    RecipesModule,
    HouseholdModule,
    MongooseModule.forFeature([
      { name: ReminderDelivery.name, schema: ReminderDeliverySchema },
    ]),
    ...(schedulingEnabled ? [BullModule.registerQueue({ name: MEAL_REMINDERS_QUEUE })] : []),
  ],
  providers: [
    ReminderTickService,
    ReminderDeliveryRepository,
    ...(schedulingEnabled ? [ReminderSchedulerService, ReminderTickProcessor] : []),
  ],
})
export class RemindersModule {}

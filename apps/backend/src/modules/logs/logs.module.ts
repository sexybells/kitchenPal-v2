import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  AdminAuditLog,
  AdminAuditLogSchema,
} from "./schemas/admin-audit-log.schema";
import { AiLog, AiLogSchema } from "./schemas/ai-log.schema";

/**
 * Registers the platform audit collections so their indexes exist from the
 * start. Feature phases inject these models to write log entries.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiLog.name, schema: AiLogSchema },
      { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class LogsModule {}

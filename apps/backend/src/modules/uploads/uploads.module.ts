import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";
import { AuthModule } from "../auth/auth.module";
import { UploadRepository } from "./repositories/upload.repository";
import { Upload, UploadSchema } from "./schemas/upload.schema";
import { LocalStorageAdapter } from "./storage/local-storage.adapter";
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from "./storage/storage-adapter";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

/**
 * Selects the storage transport. Local disk for now; the same {@link StorageAdapter}
 * contract lets an S3 adapter drop in for production without touching callers.
 */
const storageAdapterProvider = {
  provide: STORAGE_ADAPTER,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): StorageAdapter =>
    new LocalStorageAdapter(config.UPLOAD_DIR, config.UPLOAD_PUBLIC_BASE_URL),
};

/** Upload module: avatar storage behind the storage adapter. */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Upload.name, schema: UploadSchema }]),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, UploadRepository, storageAdapterProvider],
  // Export the storage adapter so other feature modules (e.g. pantry scans)
  // persist binaries through the same contract without redefining the transport.
  // Export the model so the admin console can list uploads cross-tenant.
  exports: [STORAGE_ADAPTER, MongooseModule],
})
export class UploadsModule {}

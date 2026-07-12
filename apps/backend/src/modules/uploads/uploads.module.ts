import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";
import { AuthModule } from "../auth/auth.module";
import { UploadRepository } from "./repositories/upload.repository";
import { Upload, UploadSchema } from "./schemas/upload.schema";
import { selectStorageAdapter } from "./storage/select-storage-adapter";
import { STORAGE_ADAPTER } from "./storage/storage-adapter";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

/**
 * Selects the storage transport per `STORAGE_PROVIDER`. Both adapters implement
 * the same {@link StorageAdapter} contract, so callers never change when the
 * transport swaps between local disk (dev) and S3 (production).
 */
const storageAdapterProvider = {
  provide: STORAGE_ADAPTER,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) => selectStorageAdapter(config),
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

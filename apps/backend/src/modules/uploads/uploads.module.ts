import { Module } from "@nestjs/common";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";
import { AuthModule } from "../auth/auth.module";
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
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService, storageAdapterProvider],
  // Export the storage adapter so other feature modules (e.g. pantry scans)
  // persist binaries through the same contract without redefining the transport.
  exports: [STORAGE_ADAPTER],
})
export class UploadsModule {}

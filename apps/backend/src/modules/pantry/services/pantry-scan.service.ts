import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ConfirmScanInput,
  PantryScanResponse,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { Types } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import type { ScopeContext } from "../../../common/scope/scope-context";
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from "../../uploads/storage/storage-adapter";
import type { UploadedImage } from "../../uploads/uploads.service";
import { AiVisionService } from "../ai/ai-vision.service";
import {
  PantryItemRepository,
  type PantryItemEntity,
} from "../repositories/pantry-item.repository";
import {
  PantryScanRepository,
  type PantryScanEntity,
} from "../repositories/pantry-scan.repository";

/** Upper bound on a scan image; enforced before any storage or AI call. */
export const MAX_SCAN_BYTES = 8 * 1024 * 1024; // 8 MB

type ScanDoc = HydratedDocument<PantryScanEntity>;

/**
 * Detects a supported image from its leading magic bytes (not the client's
 * declared content type). Returns the canonical extension and MIME, or null when
 * the payload is not a supported image.
 */
function detectImage(
  buffer: Buffer,
): { extension: string; contentType: string } | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { extension: "png", contentType: "image/png" };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}

function toScanResponse(doc: ScanDoc): PantryScanResponse {
  return {
    id: doc.id,
    status: doc.status,
    provider: doc.provider,
    imageUrl: doc.imageUrl ?? null,
    detections: doc.detections.map((detection) => ({
      name: detection.name,
      category: detection.category ?? null,
      quantity: detection.quantity ?? null,
      unit: detection.unit ?? null,
      stockState: detection.stockState,
      confidence: detection.confidence,
      confidenceState: detection.confidenceState,
      lowConfidence: detection.lowConfidence,
    })),
    degraded: doc.degraded,
    materializedItemIds: doc.materializedItemIds.map((id) => id.toString()),
    error: doc.error ?? null,
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

/**
 * Photo-scan lifecycle: store the image, run AI vision (with safe degrade), and
 * materialize confirmed detections into pantry items. Everything is
 * scope-partitioned so a caller only ever sees or confirms their own scans.
 */
@Injectable()
export class PantryScanService {
  constructor(
    private readonly scans: PantryScanRepository,
    private readonly items: PantryItemRepository,
    private readonly vision: AiVisionService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async createScan(
    scope: ScopeContext,
    file: UploadedImage | undefined,
  ): Promise<PantryScanResponse> {
    if (!file) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "An image file is required",
      });
    }
    if (file.size > MAX_SCAN_BYTES) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "Scan image must be 8 MB or smaller",
      });
    }
    const detected = detectImage(file.buffer);
    if (!detected) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "Scan image must be a JPEG, PNG, or WebP image",
      });
    }

    const key = `pantry-scans/${scope.userId}-${randomUUID()}.${detected.extension}`;
    const stored = await this.storage.save(
      key,
      file.buffer,
      detected.contentType,
    );

    const result = await this.vision.detect(
      { buffer: file.buffer, contentType: detected.contentType },
      scope.userId,
    );

    const doc = await this.scans.create(scope, {
      imageKey: stored.key,
      imageUrl: stored.url,
      status: "ready",
      provider: result.provider,
      detections: result.detections,
      degraded: result.degraded,
      materializedItemIds: [],
      error: null,
    } as Partial<PantryScanEntity>);

    return toScanResponse(doc);
  }

  async getScan(scope: ScopeContext, id: string): Promise<PantryScanResponse> {
    const doc = await this.scans.findById(scope, id);
    if (!doc) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Scan not found",
        details: { id },
      });
    }
    return toScanResponse(doc);
  }

  async confirmScan(
    scope: ScopeContext,
    id: string,
    input: ConfirmScanInput,
  ): Promise<PantryScanResponse> {
    const scan = await this.scans.findById(scope, id);
    if (!scan) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: "Scan not found",
        details: { id },
      });
    }
    if (scan.status === "confirmed") {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "Scan has already been confirmed",
        details: { id },
      });
    }
    if (scan.status !== "ready") {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: "Scan is not ready to confirm",
        details: { id, status: scan.status },
      });
    }

    // CLAIM the scan first: flip its status with the version guard BEFORE
    // materializing any items. Two concurrent confirms both read `ready`, but
    // only one version-guarded flip wins; the loser gets a conflict and creates
    // nothing, so items are materialized exactly once (no orphan duplicates).
    let claimed: ScanDoc;
    try {
      claimed = await this.scans.updateWithVersion(scope, scan.id, scan.version, {
        status: "confirmed",
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: "Scan is already being confirmed",
          details: { id },
        });
      }
      throw error;
    }

    const materializedItemIds: Types.ObjectId[] = [];
    for (const item of input.items) {
      const created = await this.items.create(scope, {
        name: item.name,
        category: item.category,
        quantity: item.quantity ?? 0,
        unit: item.unit ?? null,
        stockState: item.stockState,
        trackingMode: item.trackingMode,
        // The user reviewed and accepted these, so the reading is confirmed.
        confidenceState: "confirmed",
        source: "scan",
        expiryDate: item.expiryDate ?? null,
      } as Partial<PantryItemEntity>);
      materializedItemIds.push(new Types.ObjectId(created.id));
    }

    const updated = await this.scans.updateWithVersion(
      scope,
      claimed.id,
      claimed.version,
      { materializedItemIds },
    );
    return toScanResponse(updated);
  }
}

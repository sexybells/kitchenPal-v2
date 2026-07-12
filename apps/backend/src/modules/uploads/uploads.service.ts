import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { AvatarUploadResponse } from "@kitchenpal/api-contract";
import { ErrorCode } from "../../common/http/error-codes";
import { UserRepository } from "../auth/repositories/user.repository";
import {
  UploadRepository,
  type UploadEntity,
} from "./repositories/upload.repository";
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from "./storage/storage-adapter";

/** Maximum accepted avatar size. Enforced at the multer boundary and here. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

/** A minimal view of the multipart file the controller hands over. */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Identifies an image from its leading magic bytes, not the client-supplied
 * content type (which is attacker-controlled). Returns the canonical extension,
 * or null when the bytes are not a supported image — so a mislabeled or
 * non-image payload cannot be stored under an image key.
 */
function detectImageExtension(buffer: Buffer): "jpg" | "png" | "webp" | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Stores user avatars through the {@link StorageAdapter} and records the
 * resulting URL on the account. Validation (type/size) happens here so the
 * error envelope is consistent regardless of transport.
 */
@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly users: UserRepository,
    private readonly uploads: UploadRepository,
  ) {}

  async uploadAvatar(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<AvatarUploadResponse> {
    if (!file) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "An image file is required",
      });
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "Avatar must be 5 MB or smaller",
      });
    }
    // Trust the file's own bytes, not the declared content type.
    const extension = detectImageExtension(file.buffer);
    if (!extension) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "Avatar must be a JPEG, PNG, or WebP image",
      });
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: "Account no longer exists",
      });
    }

    const contentType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    const key = `avatars/${userId}-${randomUUID()}.${extension}`;
    const stored = await this.storage.save(key, file.buffer, contentType);
    await this.users.updateWithVersion(
      user.id,
      user.version,
      { avatarUrl: stored.url },
      user.id,
    );
    // Record the stored object so admins can audit uploads without scanning the
    // storage backend. Best-effort metadata only — never the bytes.
    await this.uploads.create(
      {
        key: stored.key,
        url: stored.url,
        kind: "avatar",
        contentType,
        sizeBytes: file.size,
        ownerUserId: userId,
      } as unknown as Partial<UploadEntity>,
      userId,
    );
    return { avatarUrl: stored.url };
  }
}

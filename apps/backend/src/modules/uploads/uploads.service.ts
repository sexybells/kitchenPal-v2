import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { AvatarUploadResponse } from "@kitchenpal/api-contract";
import { ErrorCode } from "../../common/http/error-codes";
import { contentTypeFor, detectImageExtension } from "./image-type";
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

/** Maximum accepted community post image size. Enforced at multer and here. */
export const MAX_COMMUNITY_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

/** A minimal view of the multipart file the controller hands over. */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
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

    const contentType = contentTypeFor(extension);
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
    await this.recordUpload(stored, "avatar", contentType, file.size, userId);
    return { avatarUrl: stored.url };
  }

  /**
   * Stores an image for a community post and returns its public URL. Mirrors
   * {@link uploadAvatar}'s type/size validation but does NOT mutate the account —
   * the client attaches the returned URL to a post's `images`. Each accepted
   * image is recorded in the uploads audit like avatars.
   */
  async uploadCommunityImage(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<{ url: string }> {
    return this.storeImage(userId, file, "community");
  }

  /**
   * Stores a dish photo for a recipe and returns its public URL. Same contract
   * as {@link uploadCommunityImage} — the caller attaches the returned URL to a
   * recipe's `imageUrl`. This is the supported way to give the seeded system
   * recipes real photography: upload here, then PATCH the recipe.
   */
  async uploadRecipeImage(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<{ url: string }> {
    return this.storeImage(userId, file, "recipe");
  }

  /**
   * Shared validate-and-store path for standalone images (community posts,
   * recipe photos): size bound, real-bytes type sniffing, storage write, audit
   * record. `kind` is both the audit label and the storage key prefix.
   */
  private async storeImage(
    userId: string,
    file: UploadedImage | undefined,
    kind: "community" | "recipe",
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "An image file is required",
      });
    }
    if (file.size > MAX_COMMUNITY_IMAGE_BYTES) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "Image must be 8 MB or smaller",
      });
    }
    // Trust the file's own bytes, not the declared content type.
    const extension = detectImageExtension(file.buffer);
    if (!extension) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: "Image must be a JPEG, PNG, or WebP image",
      });
    }
    const contentType = contentTypeFor(extension);
    const key = `${kind}/${userId}-${randomUUID()}.${extension}`;
    const stored = await this.storage.save(key, file.buffer, contentType);
    await this.recordUpload(stored, kind, contentType, file.size, userId);
    return { url: stored.url };
  }

  /** Records stored-object metadata for the uploads audit (never the bytes). */
  private async recordUpload(
    stored: { key: string; url: string },
    kind: string,
    contentType: string,
    sizeBytes: number,
    userId: string,
  ): Promise<void> {
    await this.uploads.create(
      {
        key: stored.key,
        url: stored.url,
        kind,
        contentType,
        sizeBytes,
        ownerUserId: userId,
      } as unknown as Partial<UploadEntity>,
      userId,
    );
  }
}

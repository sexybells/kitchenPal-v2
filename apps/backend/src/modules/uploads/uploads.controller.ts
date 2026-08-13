import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AvatarUploadResponse } from "@kitchenpal/api-contract";
import type { AuthUser } from "../../common/scope/auth-user";
import { CurrentUser } from "../../common/scope/current-user.decorator";
import {
  MAX_AVATAR_BYTES,
  MAX_COMMUNITY_IMAGE_BYTES,
  UploadsService,
  type UploadedImage,
} from "./uploads.service";

/** File-upload endpoints. Authenticated via the global JWT guard. */
@ApiTags("uploads")
@ApiBearerAuth()
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("avatar")
  @HttpCode(HttpStatus.OK)
  // Bound the upload at the multer boundary so an oversize body is rejected while
  // streaming, never fully buffered into memory (the service re-checks as defense
  // in depth).
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload the current user's avatar image" })
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<AvatarUploadResponse> {
    return this.uploads.uploadAvatar(user.id, file);
  }

  @Post("community-image")
  @HttpCode(HttpStatus.OK)
  // Bound the upload at the multer boundary (see uploadAvatar) so an oversize
  // body is rejected while streaming; the service re-checks as defense in depth.
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_COMMUNITY_IMAGE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload an image for a community post" })
  uploadCommunityImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<{ url: string }> {
    return this.uploads.uploadCommunityImage(user.id, file);
  }

  @Post("recipe-image")
  @HttpCode(HttpStatus.OK)
  // Bound the upload at the multer boundary (see uploadAvatar) so an oversize
  // body is rejected while streaming; the service re-checks as defense in depth.
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_COMMUNITY_IMAGE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload a dish photo for a recipe" })
  uploadRecipeImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<{ url: string }> {
    return this.uploads.uploadRecipeImage(user.id, file);
  }
}

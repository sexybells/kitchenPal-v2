import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  confirmScanSchema,
  objectIdSchema,
  type ConfirmScanInput,
  type PantryScanResponse,
} from "@kitchenpal/api-contract";
import { CurrentScope, Scope } from "../../common/scope/scope.decorator";
import type { ScopeContext } from "../../common/scope/scope-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import type { UploadedImage } from "../uploads/uploads.service";
import { MAX_SCAN_BYTES, PantryScanService } from "./services/pantry-scan.service";

/**
 * Photo-scan endpoints: upload a photo, review AI detections, confirm them into
 * pantry items. `@Scope("personal")` binds every scan to its owner.
 */
@ApiTags("pantry")
@ApiBearerAuth()
@Controller("pantry/scans")
export class PantryScansController {
  constructor(private readonly scans: PantryScanService) {}

  @Post()
  @Scope("personal")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_SCAN_BYTES, files: 1 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload a photo and run AI item detection" })
  createScan(
    @CurrentScope() scope: ScopeContext,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<PantryScanResponse> {
    return this.scans.createScan(scope, file);
  }

  @Get(":id")
  @Scope("personal")
  @ApiOperation({ summary: "Get a scan and its detections" })
  getScan(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
  ): Promise<PantryScanResponse> {
    return this.scans.getScan(scope, id);
  }

  @Post(":id/confirm")
  @Scope("personal")
  @ApiOperation({ summary: "Materialize accepted detections into pantry items" })
  confirmScan(
    @CurrentScope() scope: ScopeContext,
    @Param("id", new ZodValidationPipe(objectIdSchema)) id: string,
    @Body(new ZodValidationPipe(confirmScanSchema)) body: ConfirmScanInput,
  ): Promise<PantryScanResponse> {
    return this.scans.confirmScan(scope, id, body);
  }
}

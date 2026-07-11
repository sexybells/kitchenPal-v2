import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { ErrorCode } from "../http/error-codes";

/**
 * Validates and coerces an incoming value against a zod schema (the same
 * schemas shared via `@kitchenpal/api-contract`). On failure it raises a
 * `VALIDATION_ERROR` with field-level `details` for the error envelope.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Validation failed",
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}

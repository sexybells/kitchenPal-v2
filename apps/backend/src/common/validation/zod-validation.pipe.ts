import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import type { ZodType, ZodTypeDef } from "zod";
import { ErrorCode } from "../http/error-codes";

/**
 * Validates and coerces an incoming value against a zod schema (the same
 * schemas shared via `@kitchenpal/api-contract`). On failure it raises a
 * `VALIDATION_ERROR` with field-level `details` for the error envelope. The
 * schema's INPUT type is left unconstrained so schemas that coerce or transform
 * (e.g. a query flag parsed from a string) validate against their OUTPUT type.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

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

import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type {
  ConsumePantryInput,
  ConsumeResult,
  CookMealInput,
  CookResult,
  CreatePantryItemInput,
  PantryItemQuery,
  PantryItemResponse,
  RefillSuggestion,
  UpdatePantryItemInput,
} from "@kitchenpal/api-contract";
import type { Cache } from "cache-manager";
import type { ClientSession, Connection, HydratedDocument } from "mongoose";
import { ErrorCode } from "../../../common/http/error-codes";
import { PageResult, paginate } from "../../../common/http/page-result";
import type { ScopeContext } from "../../../common/scope/scope-context";
import {
  PantryItemRepository,
  type PantryItemEntity,
} from "../repositories/pantry-item.repository";
import { applyDepletion, needsRefill } from "./stock-state";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** How long a consume/cook idempotency result is remembered. */
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

type PantryItemDoc = HydratedDocument<PantryItemEntity>;

function toItemResponse(doc: PantryItemDoc): PantryItemResponse {
  return {
    id: doc.id,
    name: doc.name,
    category: doc.category,
    quantity: doc.quantity,
    unit: doc.unit ?? null,
    stockState: doc.stockState,
    trackingMode: doc.trackingMode,
    confidenceState: doc.confidenceState,
    source: doc.source,
    expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : null,
    scope: doc.scope,
    version: doc.version,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

function toRefillSuggestion(doc: PantryItemDoc): RefillSuggestion {
  return {
    pantryItemId: doc.id,
    name: doc.name,
    category: doc.category,
    unit: doc.unit ?? null,
    quantity: doc.quantity,
    stockState: doc.stockState,
  };
}

/**
 * Pantry item lifecycle and the cook→deplete→refill loop. All access is
 * scope-partitioned via {@link PantryItemRepository}, so a caller only ever
 * touches their own (or their household's) items. Multi-item depletion runs
 * inside a MongoDB transaction so a mid-batch failure rolls the whole set back
 * (all-or-nothing); an optional idempotency key dedupes retries.
 */
@Injectable()
export class PantryService {
  constructor(
    private readonly items: PantryItemRepository,
    @InjectConnection() private readonly connection: Connection,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async listItems(
    scope: ScopeContext,
    query: PantryItemQuery,
  ): Promise<PageResult<PantryItemResponse>> {
    const skip = decodeCursor(query.cursor);
    const { items, total } = await this.items.list(scope, {
      category: query.category,
      stockState: query.stockState,
      search: query.search,
      expiringBefore:
        query.expiringInDays !== undefined
          ? new Date(Date.now() + query.expiringInDays * MS_PER_DAY)
          : undefined,
      sort: query.sort,
      skip,
      limit: query.limit,
    });
    const nextSkip = skip + items.length;
    const hasMore = nextSkip < total;
    return paginate(items.map(toItemResponse), {
      nextCursor: hasMore ? encodeCursor(nextSkip) : null,
      total,
    });
  }

  async createItem(
    scope: ScopeContext,
    input: CreatePantryItemInput,
  ): Promise<PantryItemResponse> {
    const doc = await this.items.create(scope, {
      name: input.name,
      category: input.category,
      quantity: input.quantity ?? 0,
      unit: input.unit ?? null,
      stockState: input.stockState,
      trackingMode: input.trackingMode,
      // A person entered this, so the reading is confirmed and manually sourced.
      confidenceState: "confirmed",
      source: "manual",
      expiryDate: input.expiryDate ?? null,
    } as Partial<PantryItemEntity>);
    return toItemResponse(doc);
  }

  async updateItem(
    scope: ScopeContext,
    id: string,
    input: UpdatePantryItemInput,
  ): Promise<PantryItemResponse> {
    const existing = await this.items.findById(scope, id);
    if (!existing) {
      throw this.notFound(id);
    }

    const update: Record<string, unknown> = {};
    if (input.name !== undefined) {
      update.name = input.name;
    }
    if (input.category !== undefined) {
      update.category = input.category;
    }
    if (input.quantity !== undefined) {
      update.quantity = input.quantity;
    }
    if ("unit" in input) {
      update.unit = input.unit ?? null;
    }
    if (input.stockState !== undefined) {
      update.stockState = input.stockState;
    }
    if (input.trackingMode !== undefined) {
      update.trackingMode = input.trackingMode;
    }
    if ("expiryDate" in input) {
      update.expiryDate = input.expiryDate ?? null;
    }
    // A manual edit re-confirms the reading.
    if (input.stockState !== undefined || input.quantity !== undefined) {
      update.confidenceState = "confirmed";
    }

    const updated = await this.items.updateWithVersion(
      scope,
      existing.id,
      existing.version,
      update,
    );
    return toItemResponse(updated);
  }

  async deleteItem(scope: ScopeContext, id: string): Promise<void> {
    const removed = await this.items.softDelete(scope, id);
    if (!removed) {
      throw this.notFound(id);
    }
  }

  async getRefillSuggestions(
    scope: ScopeContext,
  ): Promise<{ suggestions: RefillSuggestion[] }> {
    return { suggestions: await this.buildRefillSuggestions(scope) };
  }

  async consume(
    scope: ScopeContext,
    input: ConsumePantryInput,
  ): Promise<ConsumeResult> {
    return this.runIdempotent(scope, "consume", input.idempotencyKey, () =>
      this.inTransaction(async (session) => {
        const updated: PantryItemResponse[] = [];
        for (const line of input.items) {
          // Every listed item must exist; a missing one aborts the whole batch,
          // so no item is left half-depleted.
          const doc = await this.requireItem(scope, line.pantryItemId, session);
          const next = await this.deplete(
            scope,
            doc,
            { amount: line.quantity, steps: line.steps },
            session,
          );
          updated.push(toItemResponse(next));
        }
        return {
          updated,
          depleted: updated.filter((item) => needsRefill(item.stockState)),
        };
      }),
    );
  }

  async cook(scope: ScopeContext, input: CookMealInput): Promise<CookResult> {
    return this.runIdempotent(scope, "cook", input.idempotencyKey, () =>
      this.inTransaction(async (session) => {
        const consumed: PantryItemResponse[] = [];
        const unmatched: { name: string }[] = [];

        for (const ingredient of input.ingredients) {
          let target: PantryItemDoc | null;
          if (ingredient.pantryItemId) {
            // An explicit id must resolve; if it does not, abort the whole meal
            // rather than silently skipping and depleting the rest.
            target = await this.requireItem(
              scope,
              ingredient.pantryItemId,
              session,
            );
          } else {
            target = await this.items.findByName(scope, ingredient.name, session);
          }
          if (!target) {
            unmatched.push({ name: ingredient.name });
            continue;
          }
          const next = await this.deplete(
            scope,
            target,
            { amount: ingredient.quantity },
            session,
          );
          consumed.push(toItemResponse(next));
        }

        return {
          consumed,
          unmatched,
          // Refill list is the hand-off to the shopping module (a later phase);
          // this endpoint only RETURNS suggestions and never writes a list.
          refillSuggestions: await this.buildRefillSuggestions(scope, session),
        };
      }),
    );
  }

  /** Applies one depletion using the atomic, version-guarded write in-session. */
  private deplete(
    scope: ScopeContext,
    doc: PantryItemDoc,
    input: { amount?: number; steps?: number },
    session: ClientSession,
  ): Promise<PantryItemDoc> {
    const next = applyDepletion(
      {
        quantity: doc.quantity,
        stockState: doc.stockState,
        trackingMode: doc.trackingMode,
      },
      input,
    );
    return this.items.updateWithVersion(
      scope,
      doc.id,
      doc.version,
      {
        quantity: next.quantity,
        stockState: next.stockState,
        // Depletion is computed, not user-verified.
        confidenceState: "estimated",
      },
      session,
    );
  }

  private async requireItem(
    scope: ScopeContext,
    id: string,
    session: ClientSession,
  ): Promise<PantryItemDoc> {
    const doc = await this.items.findById(scope, id, session);
    if (!doc) {
      throw this.notFound(id);
    }
    return doc;
  }

  private async buildRefillSuggestions(
    scope: ScopeContext,
    session?: ClientSession,
  ): Promise<RefillSuggestion[]> {
    const docs = await this.items.find(
      scope,
      { stockState: { $in: ["low", "out"] } },
      session,
    );
    // Surface the emptiest items first: out before low.
    return docs
      .sort((a, b) => refillRank(a.stockState) - refillRank(b.stockState))
      .map(toRefillSuggestion);
  }

  /**
   * Runs `work` inside a MongoDB transaction. A write conflict (e.g. a
   * concurrent consume of the same item) aborts and the driver retries the whole
   * callback, so batch depletion stays consistent and all-or-nothing.
   */
  private async inTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Dedupes repeated calls carrying the same idempotency key (per user and
   * operation): the first result is cached briefly and returned for replays, so
   * a client retry or double-tap does not deplete twice.
   */
  private async runIdempotent<T>(
    scope: ScopeContext,
    operation: string,
    key: string | undefined,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key) {
      return work();
    }
    const cacheKey = `pantry:idem:${operation}:${scope.userId}:${key}`;
    const cached = await this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }
    const result = await work();
    await this.cache.set(cacheKey, result, IDEMPOTENCY_TTL_MS);
    return result;
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: "Pantry item not found",
      details: { id },
    });
  }
}

/** Sort weight so `out` items are suggested before `low` ones. */
function refillRank(state: string): number {
  return state === "out" ? 0 : 1;
}

/** Cursor is an opaque base64 of the numeric offset. */
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const decoded = Number.parseInt(
    Buffer.from(cursor, "base64url").toString("utf8"),
    10,
  );
  return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
}

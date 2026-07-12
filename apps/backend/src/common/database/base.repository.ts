import { ConflictException, NotFoundException } from "@nestjs/common";
import type {
  ClientSession,
  FilterQuery,
  HydratedDocument,
  Model,
  UpdateQuery,
} from "mongoose";
import { ErrorCode } from "../http/error-codes";
import type { ScopeContext } from "../scope/scope-context";
import type { BaseDocumentFields, ScopedDocumentFields } from "./base.schema";
import { scopeFilterFor } from "./scope-filter";

type Actor = string | null | undefined;

/**
 * Merges a caller update with the platform write invariants: stamps
 * `updatedBy`, bumps `version` via `$inc`, and — crucially — forwards every
 * caller operator (`$inc`, `$push`, `$pull`, `$unset`, `$addToSet`, …) instead
 * of collapsing them into `$set`. Plain field assignments are folded into
 * `$set` so both operator-form and field-map updates work.
 */
function buildVersionedUpdate<T>(
  update: UpdateQuery<T>,
  actor: Actor,
): UpdateQuery<T> {
  const plainFields: Record<string, unknown> = {};
  const operators: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith("$")) {
      operators[key] = value;
    } else {
      plainFields[key] = value;
    }
  }

  const callerSet = (operators.$set as Record<string, unknown> | undefined) ?? {};
  const callerInc = (operators.$inc as Record<string, unknown> | undefined) ?? {};
  delete operators.$set;
  delete operators.$inc;

  return {
    ...operators,
    $set: { ...callerSet, ...plainFields, updatedBy: actor ?? null },
    $inc: { ...callerInc, version: 1 },
  } as UpdateQuery<T>;
}

/**
 * Shared persistence mechanics for both scoped and unscoped repositories.
 * Centralizes the two cross-cutting invariants that must never be forgotten:
 * 1. soft-deleted documents (`deletedAt != null`) are excluded from every read
 *    and write via {@link notDeletedFilter};
 * 2. optimistic concurrency — writes must match the current `version`, which is
 *    bumped on success; a stale write raises HTTP 409 `OPTIMISTIC_LOCK_CONFLICT`
 *    and a missing document raises 404.
 *
 * Feature code does not extend this directly — it extends {@link BaseRepository}
 * (global/unscoped collections) or {@link ScopedRepository} (scoped entities).
 */
abstract class AbstractRepository<T extends BaseDocumentFields> {
  protected constructor(protected readonly model: Model<T>) {}

  /** Adds the unconditional soft-delete exclusion to any base filter. */
  protected notDeletedFilter(extra: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...extra, deletedAt: null } as FilterQuery<T>;
  }

  /**
   * Applies `update` to the document matching `base` filter, `id`, and
   * `expectedVersion`, bumping the version atomically. `base` already carries
   * soft-delete (and scope, when applicable) constraints, so a mismatched scope
   * degrades to a clean 404 rather than touching another owner's document.
   */
  protected async versionedUpdateWhere(
    base: FilterQuery<T>,
    id: string,
    expectedVersion: number,
    update: UpdateQuery<T>,
    actor: Actor,
    session?: ClientSession,
  ): Promise<HydratedDocument<T>> {
    const result = await this.model
      .findOneAndUpdate(
        { ...base, _id: id, version: expectedVersion } as FilterQuery<T>,
        buildVersionedUpdate(update, actor),
        { new: true, session },
      )
      .exec();

    if (result) {
      return result;
    }

    const exists = await this.model
      .exists({ ...base, _id: id } as FilterQuery<T>)
      .session(session ?? null)
      .exec();
    if (exists) {
      throw new ConflictException({
        code: ErrorCode.OPTIMISTIC_LOCK_CONFLICT,
        message:
          "The document was modified by another request. Re-read it and retry.",
        details: { id, expectedVersion },
      });
    }
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: "Document not found",
      details: { id },
    });
  }

  protected softDeleteWhere(
    base: FilterQuery<T>,
    id: string,
    actor: Actor,
    session?: ClientSession,
  ): Promise<HydratedDocument<T> | null> {
    return this.model
      .findOneAndUpdate(
        { ...base, _id: id } as FilterQuery<T>,
        buildVersionedUpdate(
          { $set: { deletedAt: new Date() } } as UpdateQuery<T>,
          actor,
        ),
        { new: true, session },
      )
      .exec();
  }
}

/**
 * Repository for global / unscoped collections (e.g. audit logs, system
 * reference data) that are not partitioned by owner or household. Soft-delete
 * and optimistic-lock invariants still apply; there is no scope concept here by
 * design, so scoped entities must use {@link ScopedRepository} instead.
 */
export abstract class BaseRepository<
  T extends BaseDocumentFields,
> extends AbstractRepository<T> {
  find(filter: FilterQuery<T> = {}): Promise<HydratedDocument<T>[]> {
    return this.model.find(this.notDeletedFilter(filter)).exec();
  }

  findOne(filter: FilterQuery<T> = {}): Promise<HydratedDocument<T> | null> {
    return this.model.findOne(this.notDeletedFilter(filter)).exec();
  }

  findById(id: string): Promise<HydratedDocument<T> | null> {
    return this.model
      .findOne(this.notDeletedFilter({ _id: id } as FilterQuery<T>))
      .exec();
  }

  count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(this.notDeletedFilter(filter)).exec();
  }

  create(data: Partial<T>, actor?: Actor): Promise<HydratedDocument<T>> {
    return this.model.create({
      ...data,
      createdBy: actor ?? null,
      updatedBy: actor ?? null,
      deletedAt: null,
      version: 0,
    } as T);
  }

  updateWithVersion(
    id: string,
    expectedVersion: number,
    update: UpdateQuery<T>,
    actor?: Actor,
  ): Promise<HydratedDocument<T>> {
    return this.versionedUpdateWhere(
      this.notDeletedFilter(),
      id,
      expectedVersion,
      update,
      actor,
    );
  }

  softDelete(id: string, actor?: Actor): Promise<HydratedDocument<T> | null> {
    return this.softDeleteWhere(this.notDeletedFilter(), id, actor);
  }
}

/**
 * Repository for scope-partitioned entities (`personal | household | system`).
 * Every read and write takes a REQUIRED {@link ScopeContext}, so the scope
 * filter is injected on all queries with no way to forget it — a call site
 * cannot silently run across all owners/households. `create` stamps `scope`,
 * `householdId`, and `createdBy` from the context (never from caller-supplied
 * values), mirroring how identity is derived from the verified principal.
 */
export abstract class ScopedRepository<
  T extends ScopedDocumentFields,
> extends AbstractRepository<T> {
  private scopedFilter(
    scope: ScopeContext,
    filter: FilterQuery<T> = {},
  ): FilterQuery<T> {
    return this.notDeletedFilter({
      ...scopeFilterFor<T>(scope),
      ...filter,
    } as FilterQuery<T>);
  }

  find(
    scope: ScopeContext,
    filter: FilterQuery<T> = {},
    session?: ClientSession,
  ): Promise<HydratedDocument<T>[]> {
    return this.model
      .find(this.scopedFilter(scope, filter))
      .session(session ?? null)
      .exec();
  }

  findOne(
    scope: ScopeContext,
    filter: FilterQuery<T> = {},
    session?: ClientSession,
  ): Promise<HydratedDocument<T> | null> {
    return this.model
      .findOne(this.scopedFilter(scope, filter))
      .session(session ?? null)
      .exec();
  }

  findById(
    scope: ScopeContext,
    id: string,
    session?: ClientSession,
  ): Promise<HydratedDocument<T> | null> {
    return this.model
      .findOne(this.scopedFilter(scope, { _id: id } as FilterQuery<T>))
      .session(session ?? null)
      .exec();
  }

  count(scope: ScopeContext, filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(this.scopedFilter(scope, filter)).exec();
  }

  async create(
    scope: ScopeContext,
    data: Partial<T>,
    session?: ClientSession,
  ): Promise<HydratedDocument<T>> {
    const doc = {
      ...data,
      scope: scope.scope,
      householdId: scope.scope === "household" ? scope.householdId : null,
      createdBy: scope.userId,
      updatedBy: scope.userId,
      deletedAt: null,
      version: 0,
    } as unknown as T;
    // `Model.create` only accepts a session in its array form; pass a single-doc
    // array so an insert can join a transaction (e.g. expense + budget deduction).
    const [created] = await this.model.create([doc], { session });
    return created as HydratedDocument<T>;
  }

  updateWithVersion(
    scope: ScopeContext,
    id: string,
    expectedVersion: number,
    update: UpdateQuery<T>,
    session?: ClientSession,
  ): Promise<HydratedDocument<T>> {
    return this.versionedUpdateWhere(
      this.scopedFilter(scope),
      id,
      expectedVersion,
      update,
      scope.userId,
      session,
    );
  }

  softDelete(
    scope: ScopeContext,
    id: string,
    session?: ClientSession,
  ): Promise<HydratedDocument<T> | null> {
    return this.softDeleteWhere(
      this.scopedFilter(scope),
      id,
      scope.userId,
      session,
    );
  }
}

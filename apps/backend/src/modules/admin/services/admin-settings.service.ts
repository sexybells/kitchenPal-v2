import { Injectable } from "@nestjs/common";
import type {
  IntegrationKey,
  SystemSettingResponse,
  UpdateSettingInput,
} from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import { AppLogger } from "../../../common/logging/app-logger.service";
import {
  SystemSettingEntity,
  SystemSettingRepository,
} from "../repositories/system-setting.repository";
import { AdminAuditService } from "./admin-audit.service";

/** The integration toggles the console manages, in display order. */
const KNOWN_KEYS: IntegrationKey[] = [
  "ai",
  "email",
  "sms",
  "push",
  "storage",
  "external_search",
];

/**
 * Config keys that could carry a credential. Any matching key is stripped before
 * a setting is stored, so secrets never enter the database and can never be
 * echoed back. Secrets belong in environment variables only.
 */
const SECRET_KEY_PATTERN =
  /(secret|password|passwd|token|api[-_]?key|credential|private[-_]?key)/i;

/**
 * Integration settings management. Stores ONLY non-secret toggles and config;
 * sanitizes writes to strip anything that looks like a credential; never returns
 * secrets. Every update is audit-logged (key + non-secret config only).
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly settings: SystemSettingRepository,
    private readonly audit: AdminAuditService,
    private readonly logger: AppLogger,
  ) {}

  /** All known toggles, merging stored values over disabled defaults. */
  async list(): Promise<SystemSettingResponse[]> {
    const stored = await this.settings.listAll();
    const byKey = new Map(stored.map((s) => [s.key, s]));
    return KNOWN_KEYS.map((key) => {
      const doc = byKey.get(key);
      return doc
        ? toSettingResponse(doc)
        : { key, enabled: false, config: {}, updatedAt: new Date(0).toISOString() };
    });
  }

  async update(
    actorId: string,
    key: IntegrationKey,
    input: UpdateSettingInput,
  ): Promise<SystemSettingResponse> {
    const { config, stripped } = sanitizeConfig(input.config);
    if (stripped.length > 0) {
      this.logger.warn(
        `Stripped secret-looking keys from setting "${key}": ${stripped.join(", ")}`,
        "AdminSettingsService",
      );
    }
    const doc = await this.settings.upsert(key, input.enabled, config, actorId);
    await this.audit.record(actorId, {
      action: "setting.update",
      targetType: "setting",
      targetId: key,
      after: { enabled: input.enabled, configKeys: Object.keys(config) },
      metadata: stripped.length > 0 ? { strippedKeys: stripped } : undefined,
    });
    return toSettingResponse(doc);
  }
}

/**
 * Removes secret-looking keys from a config object at ANY depth. Recurses
 * through nested objects and arrays so a secret cannot hide under a non-secret
 * parent key (e.g. `config.ai.apiKey`). Reports the paths of every dropped key.
 *
 * Limitation: this inspects key NAMES only. A secret placed in a value under a
 * non-secret-named key (e.g. `{ note: "sk-live-..." }`) still passes — callers
 * must not store credentials in setting VALUES; secrets belong in env vars.
 */
function sanitizeConfig(config: Record<string, unknown>): {
  config: Record<string, unknown>;
  stripped: string[];
} {
  const stripped: string[] = [];
  const clean = sanitizeValue(config, "", stripped) as Record<string, unknown>;
  return { config: clean, stripped };
}

/** Recursively strips secret-named keys; `path` is the dotted key path so far. */
function sanitizeValue(
  value: unknown,
  path: string,
  stripped: string[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeValue(item, `${path}[${index}]`, stripped),
    );
  }
  if (value !== null && typeof value === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SECRET_KEY_PATTERN.test(key)) {
        stripped.push(childPath);
      } else {
        clean[key] = sanitizeValue(child, childPath, stripped);
      }
    }
    return clean;
  }
  return value;
}

function toSettingResponse(
  doc: HydratedDocument<SystemSettingEntity>,
): SystemSettingResponse {
  return {
    key: doc.key,
    enabled: doc.enabled,
    config: doc.config ?? {},
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  contentTypeFor,
  detectImageExtension,
} from "../../uploads/image-type";
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from "../../uploads/storage/storage-adapter";
import type { RecipeEntity } from "../repositories/recipe.repository";
import { Recipe } from "../schemas/recipe.schema";

/** Outcome of one image-attachment run. */
export interface AttachImagesResult {
  /** Recipes that received a photo they did not have. */
  attached: number;
  /** Recipes left alone because they already carry an image. */
  skipped: number;
  /** Files whose name matched no system recipe. */
  unmatched: string[];
  /** System recipes still without a photo after the run. */
  missing: string[];
}

/**
 * Turns a dish name into the ASCII file stem its photo is stored under —
 * "Đậu hũ sốt cà chua" becomes "dau-hu-sot-ca-chua".
 *
 * Order matters: lower-case FIRST so "Đ" becomes "đ" and survives the ASCII
 * fold, then map "đ" to "d", then strip the remaining diacritics. Folding
 * before lower-casing silently drops a leading "Đ", which would leave that one
 * dish unmatched with no error to notice.
 */
export function imageStemFor(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Attaches bundled dish photography to the seeded system recipes.
 *
 * Photos live in the repo (`assets/recipe-images/`) and are pushed through the
 * same {@link StorageAdapter} every upload uses, so they land on local disk in
 * development and on S3/MinIO in production — the app never serves them from
 * the source tree.
 *
 * Additive and idempotent, matching the seeder: a recipe that already has an
 * `imageUrl` is left alone, so a photo curated through the admin console
 * survives a re-run. The storage key is deterministic (`recipe/system/<stem>`),
 * so re-uploading overwrites in place instead of littering orphans.
 */
@Injectable()
export class SystemRecipeImageService {
  private readonly logger = new Logger(SystemRecipeImageService.name);

  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeEntity>,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async attachFrom(
    directory: string,
    options: { force?: boolean } = {},
  ): Promise<AttachImagesResult> {
    const files = (await readdir(directory)).filter((file) =>
      [".jpg", ".jpeg", ".png", ".webp"].includes(extname(file).toLowerCase()),
    );
    const byStem = new Map(
      files.map((file) => [file.slice(0, -extname(file).length), file]),
    );

    const recipes = await this.recipeModel
      .find({ scope: "system", deletedAt: null })
      .exec();

    let attached = 0;
    let skipped = 0;
    const missing: string[] = [];
    const matchedStems = new Set<string>();

    for (const recipe of recipes) {
      const stem = imageStemFor(recipe.name);
      const file = byStem.get(stem);
      if (!file) {
        missing.push(recipe.name);
        continue;
      }
      matchedStems.add(stem);

      if (recipe.imageUrl && !options.force) {
        skipped += 1;
        continue;
      }

      const buffer = await readFile(join(directory, file));
      // Trust the bytes, not the file extension: a mislabeled file must not be
      // stored under an image key.
      const detected = detectImageExtension(buffer);
      if (!detected) {
        this.logger.warn(`${file} is not a JPEG, PNG or WebP — skipped.`);
        continue;
      }

      const stored = await this.storage.save(
        `recipe/system/${stem}.${detected}`,
        buffer,
        contentTypeFor(detected),
      );
      await this.recipeModel
        .updateOne({ _id: recipe._id }, { $set: { imageUrl: stored.url } })
        .exec();
      attached += 1;
    }

    const unmatched = [...byStem.keys()].filter(
      (stem) => !matchedStems.has(stem),
    );
    this.logger.log(
      `Dish photos: ${attached} attached, ${skipped} already had one, ` +
        `${missing.length} recipes still without, ${unmatched.length} files matched nothing.`,
    );
    return { attached, skipped, unmatched, missing };
  }
}

import "reflect-metadata";
import { resolve } from "node:path";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SystemRecipeImageService } from "../modules/recipes/services/system-recipe-image.service";

/**
 * Attaches the bundled dish photos to the seeded system recipes.
 *
 *   pnpm --filter @kitchenpal/backend images:recipes [directory] [--force]
 *
 * The directory defaults to `assets/recipe-images` at the repo root. In a
 * container the source tree is not present, so pass the path the images were
 * mounted or copied to.
 *
 * Safe to re-run: recipes that already carry a photo are skipped, so a picture
 * curated through the admin console is never overwritten. `--force` replaces
 * them anyway.
 */
async function main(): Promise<void> {
  const logger = new Logger("attach-recipe-images");
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const directory = resolve(
    args.find((arg) => !arg.startsWith("--")) ?? "../../assets/recipe-images",
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const result = await app
      .get(SystemRecipeImageService)
      .attachFrom(directory, { force });

    logger.log(
      `Done — ${result.attached} attached, ${result.skipped} already had a photo.`,
    );
    if (result.missing.length > 0) {
      logger.warn(
        `${result.missing.length} recipes still have no photo: ${result.missing.join(", ")}`,
      );
    }
    if (result.unmatched.length > 0) {
      logger.warn(
        `${result.unmatched.length} files matched no recipe: ${result.unmatched.join(", ")}`,
      );
    }
  } finally {
    await app.close();
  }
}

// Exit explicitly: closing the Nest context leaves the Redis/BullMQ handles
// open, so the process would hang after a successful run.
main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    new Logger("attach-recipe-images").error(error);
    process.exit(1);
  });

import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SystemRecipeSeederService } from "../modules/recipes/services/system-recipe-seeder.service";

/**
 * Standalone seeder for the server-owned recipe library.
 *
 * Run after a deploy (`pnpm --filter @kitchenpal/backend seed:recipes`) so a
 * fresh environment has real candidates for suggestions and meal-plan auto-fill.
 * Unlike the admin dev tools this is production-safe: the seeder is additive and
 * idempotent, so re-running it converges rather than duplicating.
 *
 * Boots an application CONTEXT (no HTTP listener, no socket gateway) — it only
 * needs the Mongo connection and the seeder provider.
 */
async function main(): Promise<void> {
  const logger = new Logger("seed-system-recipes");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const result = await app.get(SystemRecipeSeederService).seed();
    logger.log(
      `Done — created ${result.created}, updated ${result.updated}, unchanged ${result.skipped} of ${result.total}.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  // A failed seed must not look like a success in CI or a deploy pipeline.
  new Logger("seed-system-recipes").error(error);
  process.exitCode = 1;
});

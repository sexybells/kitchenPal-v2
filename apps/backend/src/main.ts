import { isAbsolute, resolve } from "node:path";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AppLogger } from "./common/logging/app-logger.service";
import { AuthenticatedIoAdapter } from "./common/socket/authenticated-io.adapter";
import { APP_CONFIG, AppConfig } from "./config/env.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(AppLogger));
  app.use(helmet());
  app.enableShutdownHooks();

  // Realtime chat/notification gateway: CORS is pinned to an allowlist (no
  // wildcard) and, in production, events fan across instances through Redis.
  app.useWebSocketAdapter(new AuthenticatedIoAdapter(app));

  const config = app.get<AppConfig>(APP_CONFIG);

  // Serve locally-stored uploads (dev). Production uses an S3-backed adapter and
  // its own CDN/bucket URL, so this static mount is only relevant for local disk
  // — and must be SKIPPED for s3: UPLOAD_PUBLIC_BASE_URL is then an absolute
  // object URL, which Express cannot parse as a route prefix and which crashes
  // the app during bootstrap.
  if (config.STORAGE_PROVIDER === "local") {
    const uploadDir = isAbsolute(config.UPLOAD_DIR)
      ? config.UPLOAD_DIR
      : resolve(process.cwd(), config.UPLOAD_DIR);
    app.useStaticAssets(uploadDir, {
      prefix: config.UPLOAD_PUBLIC_BASE_URL,
    });
  }

  if (config.SWAGGER_ENABLED) {
    const docConfig = new DocumentBuilder()
      .setTitle("KitchenPal API")
      .setDescription("KitchenPal backend core platform")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(config.PORT);
  app.get(AppLogger).log(`Backend listening on port ${config.PORT}`, "Bootstrap");
}

void bootstrap();

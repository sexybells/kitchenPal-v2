import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AppLogger } from "./common/logging/app-logger.service";
import { APP_CONFIG, AppConfig } from "./config/env.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(AppLogger));
  app.use(helmet());
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);

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

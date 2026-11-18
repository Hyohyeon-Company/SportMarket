import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

/**
 * Liveness-only entry point for the scaffold.
 *
 * Database connections, migrations, authentication and the `/media` static
 * route are deliberately absent: they arrive with the feature cards that own
 * those contracts.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

  await app.listen(port);
}

void bootstrap();

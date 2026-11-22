import "reflect-metadata";

import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

/**
 * API entry point.
 *
 * The contract's servers entry is `/api/v1` (`api-spec-v1.yaml`), so every contract
 * route lives under that prefix. `GET /health` is excluded on purpose: it is an
 * operational liveness probe rather than a contract resource, and keeping its path
 * stable means the container gate and any existing probe configuration keep working.
 *
 * Database connections, migrations and `/media` stay absent: they belong to the
 * cards that own those contracts.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  app.enableShutdownHooks();

  const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

  await app.listen(port);
}

void bootstrap();

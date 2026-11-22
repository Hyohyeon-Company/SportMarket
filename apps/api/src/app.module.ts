import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { AuthModule } from "./auth/auth.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { HealthController } from "./health.controller";

/**
 * Application module.
 *
 * `ApiExceptionFilter` is registered globally so every route — including routes a
 * later card adds — answers with the contract's single error envelope instead of
 * Nest's default `{statusCode, message}`.
 */
@Module({
  imports: [AuthModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}

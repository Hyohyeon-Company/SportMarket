/**
 * Injection tokens for the auth ports.
 *
 * NestJS needs a runtime value to inject by, and a string literal duplicated
 * across module and service is easy to mistype, so every port has exactly one
 * exported token here.
 */
export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
export const ONE_TIME_TOKEN_REPOSITORY = Symbol("ONE_TIME_TOKEN_REPOSITORY");
export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
export const TOKEN_GENERATOR = Symbol("TOKEN_GENERATOR");
export const CLOCK = Symbol("CLOCK");
export const RATE_LIMITER = Symbol("RATE_LIMITER");
export const AUTH_MAILER = Symbol("AUTH_MAILER");

/** One bundle so the service constructor stays a single dependency. */
export const AUTH_DEPENDENCIES = Symbol("AUTH_DEPENDENCIES");

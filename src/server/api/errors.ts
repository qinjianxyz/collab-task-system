import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  ConcurrencyConflictError,
  DomainError,
} from "../domain/errors";
import { RateLimitError } from "../realtime/rate-limiter";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status, headers },
  );
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof BadRequestError) {
    return jsonError(400, "bad_request", error.message);
  }

  if (error instanceof SyntaxError) {
    return jsonError(400, "invalid_json", "request body must be valid JSON");
  }

  if (error instanceof ConcurrencyConflictError) {
    return jsonError(409, "concurrency_conflict", error.message);
  }

  if (error instanceof RateLimitError) {
    return jsonError(
      429,
      "rate_limited",
      error.message,
      {
        "retry-after": String(Math.ceil(error.retryAfterMs / 1_000)),
      },
    );
  }

  if (error instanceof ZodError) {
    return jsonError(422, "validation_error", error.issues[0]?.message ?? "validation failed");
  }

  if (error instanceof DomainError) {
    return jsonError(422, "domain_error", error.message);
  }

  console.error(error);
  return jsonError(500, "internal_error", "internal server error");
}

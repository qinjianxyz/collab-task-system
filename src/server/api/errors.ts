import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  ConcurrencyConflictError,
  DependencyCycleError,
  DomainError,
  InvalidStatusTransitionError,
} from "../domain/errors";

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
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
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

  if (error instanceof ZodError) {
    return jsonError(422, "validation_error", error.issues[0]?.message ?? "validation failed");
  }

  if (error instanceof InvalidStatusTransitionError) {
    return jsonError(422, "invalid_status_transition", error.message);
  }

  if (error instanceof DependencyCycleError) {
    return jsonError(422, "dependency_cycle", error.message);
  }

  if (error instanceof DomainError) {
    return jsonError(422, "domain_error", error.message);
  }

  console.error(error);
  return jsonError(500, "internal_error", "internal server error");
}

import type { ZodType } from "zod";

import { BadRequestError } from "./errors";

export async function readJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw error;
    }

    throw new BadRequestError("request body must be valid JSON");
  }

  return schema.parse(payload);
}

export function readSinceQuery(request: Request): number {
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");

  if (sinceParam === null || sinceParam.length === 0) {
    return 0;
  }

  const since = Number(sinceParam);
  if (!Number.isInteger(since) || since < 0) {
    throw new BadRequestError("since must be a non-negative integer");
  }

  return since;
}

export function readLimitQuery(
  request: Request,
  {
    defaultValue,
    paramName = "limit",
    maxValue = 250,
  }: {
    defaultValue: number;
    paramName?: string;
    maxValue?: number;
  },
): number {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get(paramName);

  if (limitParam === null || limitParam.length === 0) {
    return defaultValue;
  }

  const limit = Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxValue) {
    throw new BadRequestError(
      `${paramName} must be an integer between 1 and ${maxValue}`,
    );
  }

  return limit;
}

export function readCursorQuery(
  request: Request,
  paramName = "after",
): string | null {
  const url = new URL(request.url);
  const cursorParam = url.searchParams.get(paramName);

  if (cursorParam === null || cursorParam.length === 0) {
    return null;
  }

  return cursorParam;
}

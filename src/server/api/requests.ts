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

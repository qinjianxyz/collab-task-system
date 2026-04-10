import { getDatabasePool } from "../db/client";

export async function getFirstProjectId(): Promise<string | null> {
  const result = await getDatabasePool().query<{ id: string }>(
    `select id
      from projects
      order by created_at asc
      limit 1`,
  );

  return result.rows[0]?.id ?? null;
}

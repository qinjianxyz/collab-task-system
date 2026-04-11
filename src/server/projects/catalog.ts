import type { Project } from "../../shared/types";
import { getDatabasePool } from "../db/client";

export type ProjectCatalogEntry = Pick<
  Project,
  "id" | "name" | "description" | "currentVersion" | "updatedAt"
>;

type ProjectCatalogRow = {
  id: string;
  name: string;
  description: string | null;
  current_version: number;
  updated_at: Date | string;
};

function toTimestampMs(value: Date | string): number {
  return new Date(value).getTime();
}

export async function listRecentProjects(limit = 12): Promise<ProjectCatalogEntry[]> {
  const result = await getDatabasePool().query<ProjectCatalogRow>(
    `select id, name, description, current_version, updated_at
      from projects
      order by updated_at desc, created_at desc
      limit $1`,
    [limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    currentVersion: row.current_version,
    updatedAt: toTimestampMs(row.updated_at),
  }));
}

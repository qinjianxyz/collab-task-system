import { getDatabasePool } from "../db/client";

export type ProjectCatalogEntry = {
  currentVersion: number;
  description: string | null;
  id: string;
  name: string;
  taskCount: number;
  updatedAt: number;
};

export async function getFirstProjectId(): Promise<string | null> {
  const result = await getDatabasePool().query<{ id: string }>(
    `select id
      from projects
      order by created_at asc
      limit 1`,
  );

  return result.rows[0]?.id ?? null;
}

export async function listProjects(): Promise<ProjectCatalogEntry[]> {
  const result = await getDatabasePool().query<{
    current_version: number;
    description: string | null;
    id: string;
    name: string;
    task_count: string;
    updated_at: Date | string;
  }>(
    `select
        projects.id,
        projects.name,
        projects.description,
        projects.current_version,
        projects.updated_at,
        count(tasks.id)::text as task_count
      from projects
      left join tasks on tasks.project_id = projects.id
      group by projects.id
      order by projects.updated_at desc, projects.name asc`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    currentVersion: row.current_version,
    taskCount: Number(row.task_count),
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

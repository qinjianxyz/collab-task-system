import type { Project, ProjectSnapshot } from "../../shared/types";
import type { ProjectTaskPageResponse } from "../../shared/api";
import { DomainError } from "../domain/errors";
import { withTransaction } from "../db/client";
import { readProjectTaskPage } from "./task-pagination";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  current_version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

export type WorkspaceBootstrap = {
  initialTaskPage: ProjectTaskPageResponse["page"];
  snapshot: ProjectSnapshot;
};

function toTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export async function getWorkspaceBootstrap(
  projectId: string,
  taskLimit: number,
): Promise<WorkspaceBootstrap> {
  return withTransaction(async (client) => {
    const result = await client.query<ProjectRow>(
      `select
          id,
          name,
          description,
          metadata,
          current_version,
          created_at,
          updated_at
        from projects
        where id = $1`,
      [projectId],
    );

    const projectRow = result.rows[0];
    if (!projectRow) {
      throw new DomainError(`project ${projectId} does not exist`);
    }

    const project: Project = {
      id: projectRow.id,
      name: projectRow.name,
      description: projectRow.description ?? undefined,
      metadata: projectRow.metadata ?? {},
      currentVersion: projectRow.current_version,
      createdAt: toTimestampMs(projectRow.created_at),
      updatedAt: toTimestampMs(projectRow.updated_at),
    };

    const initialTaskPage = (await readProjectTaskPage(client, projectId, {
      limit: taskLimit,
    })) as ProjectTaskPageResponse["page"];

    return {
      initialTaskPage,
      snapshot: {
        project,
        tasks: initialTaskPage.tasks,
        comments: initialTaskPage.comments,
        version: project.currentVersion,
      },
    };
  });
}

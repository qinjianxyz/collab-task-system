import { ProjectWorkspace } from "../../../src/client/components/project-workspace";
import { getWorkspaceBootstrap } from "../../../src/server/projects/workspace-bootstrap";

export const dynamic = "force-dynamic";

const INITIAL_TASK_PAGE_SIZE = 32;

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const bootstrap = await getWorkspaceBootstrap(projectId, INITIAL_TASK_PAGE_SIZE);

  return (
    <ProjectWorkspace
      initialSnapshot={bootstrap.snapshot}
      initialTaskPage={bootstrap.initialTaskPage}
      projectId={projectId}
    />
  );
}

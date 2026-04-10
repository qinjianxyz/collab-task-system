import { ProjectWorkspace } from "../../../src/client/components/project-workspace";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  return <ProjectWorkspace projectId={projectId} />;
}

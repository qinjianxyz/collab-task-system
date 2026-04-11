import { CreateProjectPage } from "../src/client/components/create-project-page";
import { listRecentProjects } from "../src/server/projects/catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const recentProjects = await listRecentProjects();
  return <CreateProjectPage recentProjects={recentProjects} />;
}

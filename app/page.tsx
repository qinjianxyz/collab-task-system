import { CreateProjectPage } from "../src/client/components/create-project-page";
import { listProjects } from "../src/server/projects/catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await listProjects();

  return <CreateProjectPage existingProjects={projects} />;
}

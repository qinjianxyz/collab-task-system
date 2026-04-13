import { redirect } from "next/navigation";

import { CreateProjectPage } from "../src/client/components/create-project-page";
import { getFirstProjectId } from "../src/server/projects/catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const firstProjectId = await getFirstProjectId();
  if (firstProjectId) {
    redirect(`/projects/${firstProjectId}`);
  }

  return <CreateProjectPage />;
}

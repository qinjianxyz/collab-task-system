"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

import { createProject } from "../api";
import { getOrCreateClientId, getStoredDisplayName, setStoredDisplayName } from "../identity";
import type { ProjectCatalogEntry } from "../../server/projects/catalog";

type CreateProjectPageProps = {
  existingProjects?: ProjectCatalogEntry[];
};

function formatRelativeUpdatedAt(timestamp: number): string {
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));

  if (elapsedMinutes < 1) {
    return "Updated just now";
  }

  if (elapsedMinutes < 60) {
    return `Updated ${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Updated ${elapsedHours}h ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return `Updated ${elapsedDays}d ago`;
}

export function CreateProjectPage({ existingProjects = [] }: CreateProjectPageProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startNavigation] = useTransition();

  useEffect(() => {
    setDisplayName(getStoredDisplayName());
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const normalizedDisplayName = displayName.trim();
    const normalizedProjectName = projectName.trim();
    if (!normalizedDisplayName || !normalizedProjectName) {
      setError("display name and project name are required");
      return;
    }

    try {
      setStoredDisplayName(normalizedDisplayName);
      const response = await createProject({
        name: normalizedProjectName,
        clientId: getOrCreateClientId(),
        userId: normalizedDisplayName,
      });

      startNavigation(() => {
        router.push(`/projects/${response.projectId}`);
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "failed to create project");
    }
  }

  return (
    <main className="landing-shell">
      <section className="landing-card">
        <p className="eyebrow">Phase 2 Demo</p>
        <h1>Event-sourced collaborative task management</h1>
        <p className="intro-copy">
          Create a project, reopen it in another browser context, and watch the event
          stream converge in real time over SSE without reloading the whole dataset.
        </p>

        <form className="stack-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Display name</span>
            <input
              autoComplete="nickname"
              className="text-input"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="alice"
              value={displayName}
            />
          </label>

          <label className="field">
            <span>Project name</span>
            <input
              className="text-input"
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Ship Collab Task System"
              value={projectName}
            />
          </label>

          <button className="primary-button" disabled={isPending} type="submit">
            {isPending ? "Creating project..." : "Create project"}
          </button>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      <section className="landing-card project-catalog-card">
        <div className="catalog-header">
          <div>
            <p className="eyebrow">Projects</p>
            <h2>Open an existing workspace</h2>
          </div>
          <p className="subtle-copy">
            {existingProjects.length} project{existingProjects.length === 1 ? "" : "s"} ready for
            live collaboration.
          </p>
        </div>

        {existingProjects.length > 0 ? (
          <div className="project-catalog">
            {existingProjects.map((project) => (
              <Link className="project-catalog-item" href={`/projects/${project.id}`} key={project.id}>
                <div className="project-catalog-copy">
                  <strong>{project.name}</strong>
                  {project.description ? (
                    <p>{project.description}</p>
                  ) : (
                    <p>No description yet.</p>
                  )}
                </div>

                <div className="project-catalog-meta">
                  <span>{project.taskCount} tasks</span>
                  <span>Version {project.currentVersion}</span>
                  <span>{formatRelativeUpdatedAt(project.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="subtle-copy">
            No projects yet. Create one above, then open it in two browser contexts to
            demo real-time convergence.
          </p>
        )}
      </section>
    </main>
  );
}

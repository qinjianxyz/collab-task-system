"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

import type { Project } from "../../shared/types";
import { createProject } from "../api";
import { getOrCreateClientId, getStoredDisplayName, setStoredDisplayName } from "../identity";
import { formatProjectUpdatedAt } from "../project-catalog";

type ProjectCatalogEntry = Pick<
  Project,
  "id" | "name" | "description" | "currentVersion" | "updatedAt"
>;

type CreateProjectPageProps = {
  recentProjects?: ProjectCatalogEntry[];
};

export function CreateProjectPage({
  recentProjects = [],
}: CreateProjectPageProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [projectName, setProjectName] = useState("Demo Project");
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
      <section className="landing-grid">
        <article className="landing-card">
          <p className="eyebrow">Launch Demo</p>
          <h1>Event-sourced collaborative task management</h1>
          <p className="intro-copy">
            Create a project, open it in two tabs, and watch task, comment, undo, and
            presence updates converge over the same ordered event stream.
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
                placeholder="Demo Project"
                value={projectName}
              />
            </label>

            <button className="primary-button" disabled={isPending} type="submit">
              {isPending ? "Creating project..." : "Create project"}
            </button>
          </form>

          {error ? <p className="error-banner">{error}</p> : null}
        </article>

        <article className="landing-card recent-projects-card">
          <p className="eyebrow">Project Catalog</p>
          <h2>Recent projects</h2>
          <p className="intro-copy">
            Open an existing workspace directly or create a fresh one from the form.
          </p>

          {recentProjects.length > 0 ? (
            <div className="recent-project-list">
              {recentProjects.map((project) => (
                <Link
                  aria-label={`Open ${project.name}`}
                  className="recent-project-item"
                  href={`/projects/${project.id}`}
                  key={project.id}
                >
                  <div className="recent-project-copy">
                    <strong>{project.name}</strong>
                    <span>
                      {project.description?.trim()
                        ? project.description
                        : `Version ${project.currentVersion}`}
                    </span>
                  </div>
                  <div className="recent-project-meta">
                    <span>{formatProjectUpdatedAt(project.updatedAt)}</span>
                    <span className="recent-project-action">Open workspace</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="subtle-copy">
              No projects yet. Create one, then reopen this page to see the workspace
              catalog.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}

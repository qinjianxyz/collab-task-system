"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";

import { createProject } from "../api";
import { getOrCreateClientId, getStoredDisplayName, setStoredDisplayName } from "../identity";

export function CreateProjectPage() {
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
      <section className="landing-card">
        <p className="eyebrow">Phase 2 Demo</p>
        <h1>Event-sourced collaborative task management</h1>
        <p className="intro-copy">
          Create one project, open the same URL in two tabs, and the task stream should
          converge in real time over SSE.
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
      </section>
    </main>
  );
}

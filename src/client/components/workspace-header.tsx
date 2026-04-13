"use client";

import type { Project, PresenceViewer } from "../../shared/types";
import type { WorkspaceStatusViewModel } from "./workspace-status";

type WorkspaceHeaderProps = {
  canRedo: boolean;
  canUndo: boolean;
  displayName: string;
  onDisplayNameBlur: () => void;
  onDisplayNameChange: (value: string) => void;
  onRedo: () => void;
  onRefresh: () => void;
  onUndo: () => void;
  project: Project | null;
  status: WorkspaceStatusViewModel;
  taskInventoryCopy: string;
  viewers: PresenceViewer[];
};

export function WorkspaceHeader({
  canRedo,
  canUndo,
  displayName,
  onDisplayNameBlur,
  onDisplayNameChange,
  onRedo,
  onRefresh,
  onUndo,
  project,
  status,
  taskInventoryCopy,
  viewers,
}: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="header-stack">
        <p className="eyebrow">Project</p>
        <h1>{project?.name ?? "Loading project..."}</h1>
        <p className="subtle-copy">{taskInventoryCopy}</p>
        {project?.description ? (
          <p className="project-description">{project.description}</p>
        ) : null}

        <div className="presence-summary">
          <span className="subtle-copy">Viewing now</span>
          <div className="viewer-list">
            {viewers.length > 0 ? (
              viewers.map((viewer) => (
                <span className="viewer-chip" key={viewer.clientId}>
                  {viewer.userId}
                </span>
              ))
            ) : (
              <span className="subtle-copy">Waiting for viewers...</span>
            )}
          </div>
        </div>
      </div>

      <div className="header-controls">
        <label className="field compact-field">
          <span>Display name</span>
          <input
            className="text-input"
            onBlur={onDisplayNameBlur}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder="alice"
            value={displayName}
          />
        </label>

        <div className="status-stack">
          <div aria-live="polite" className={`status-pill status-${status.tone}`}>
            {status.label}
          </div>
          <p className="status-detail">{status.detail}</p>
          {status.showRetry ? (
            <button
              className="secondary-button"
              onClick={onRefresh}
              type="button"
            >
              Retry sync
            </button>
          ) : null}
        </div>

        <div className="history-controls">
          <button
            className="secondary-button"
            disabled={!canUndo}
            onClick={onUndo}
            type="button"
          >
            Undo
          </button>

          <button
            className="secondary-button"
            disabled={!canRedo}
            onClick={onRedo}
            type="button"
          >
            Redo
          </button>
        </div>
      </div>
    </header>
  );
}

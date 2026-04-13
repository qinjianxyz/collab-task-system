"use client";

type WorkspaceShortcutsProps = {
  onClose: () => void;
  open: boolean;
};

export function WorkspaceShortcuts({
  onClose,
  open,
}: WorkspaceShortcutsProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      aria-label="Keyboard shortcuts"
      className="shortcut-overlay"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="shortcut-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <p className="eyebrow">Keyboard shortcuts</p>
        <h2>Keyboard shortcuts</h2>
        <div className="shortcut-list">
          <p>
            <strong>Ctrl+Z / Cmd+Z</strong>
            <span>Undo the latest local event</span>
          </p>
          <p>
            <strong>Ctrl+Shift+Z / Cmd+Shift+Z</strong>
            <span>Redo the last undone event</span>
          </p>
          <p>
            <strong>N</strong>
            <span>Focus the new-task input</span>
          </p>
          <p>
            <strong>Escape</strong>
            <span>Close this overlay</span>
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </section>
    </div>
  );
}

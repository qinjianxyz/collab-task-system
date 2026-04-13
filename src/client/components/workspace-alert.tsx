"use client";

type WorkspaceAlertProps = {
  message: string | null;
  onRetry?: () => void;
};

export function WorkspaceAlert({
  message,
  onRetry,
}: WorkspaceAlertProps) {
  if (!message) {
    return null;
  }

  return (
    <div aria-live="polite" className="error-banner">
      <p>{message}</p>
      {onRetry ? (
        <button
          className="secondary-button danger-button"
          onClick={onRetry}
          type="button"
        >
          Retry sync
        </button>
      ) : null}
    </div>
  );
}

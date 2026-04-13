type ConnectionStatus = "loading" | "connected" | "reconnecting";

type BuildWorkspaceStatusInput = {
  connectionStatus: ConnectionStatus;
  error: string | null;
  isMutating: boolean;
};

type WorkspaceStatusViewModel = {
  detail: string;
  label: string;
  showRetry: boolean;
  tone: "neutral" | "positive" | "warning";
};

export function buildWorkspaceStatusViewModel(
  input: BuildWorkspaceStatusInput,
): WorkspaceStatusViewModel {
  if (input.connectionStatus === "loading") {
    return {
      detail: "Fetching the latest snapshot and opening the live stream.",
      label: "Loading",
      showRetry: false,
      tone: "neutral",
    };
  }

  if (input.connectionStatus === "reconnecting") {
    return {
      detail: "Trying to restore the live stream. Missed events will catch up automatically.",
      label: "Reconnecting",
      showRetry: true,
      tone: "warning",
    };
  }

  if (input.isMutating) {
    return {
      detail: "Saving the latest change to the event stream.",
      label: "Syncing",
      showRetry: false,
      tone: "neutral",
    };
  }

  return {
    detail: "Changes sync in real time over the committed event stream.",
    label: "Live",
    showRetry: false,
    tone: "positive",
  };
}

export type { WorkspaceStatusViewModel };

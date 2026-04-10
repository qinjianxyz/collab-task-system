const CLIENT_ID_KEY = "collab-task-system.client-id";
const DISPLAY_NAME_KEY = "collab-task-system.display-name";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value);
}

export function getOrCreateClientId(): string {
  const existingClientId = readStorage(CLIENT_ID_KEY);
  if (existingClientId) {
    return existingClientId;
  }

  const clientId = crypto.randomUUID();
  writeStorage(CLIENT_ID_KEY, clientId);
  return clientId;
}

export function getStoredDisplayName(): string {
  return readStorage(DISPLAY_NAME_KEY) ?? "";
}

export function setStoredDisplayName(displayName: string): void {
  writeStorage(DISPLAY_NAME_KEY, displayName);
}

const projectUpdatedAtFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatProjectUpdatedAt(timestamp: number): string {
  return `${projectUpdatedAtFormatter.format(timestamp)} UTC`;
}

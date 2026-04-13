const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ITERATIONS = Number(process.env.ITERATIONS ?? "50");

type MeasurementSummary = {
  averageMs: number;
  maxMs: number;
  minMs: number;
  p95Ms: number;
};

function percentile(values: number[], percentage: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1),
  );

  return sorted[index] ?? 0;
}

function summarizeDurations(values: number[]): MeasurementSummary {
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    averageMs: Number((total / values.length).toFixed(2)),
    maxMs: Number(Math.max(...values).toFixed(2)),
    minMs: Number(Math.min(...values).toFixed(2)),
    p95Ms: Number(percentile(values, 95).toFixed(2)),
  };
}

async function createProject(): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "Load Probe Project",
      clientId: "load_probe",
      userId: "load-bot",
    }),
  });

  if (!response.ok) {
    throw new Error(`failed to create project: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { projectId: string };
  return payload.projectId;
}

async function appendTask(projectId: string, iteration: number, expectedVersion: number) {
  const response = await fetch(`${BASE_URL}/api/projects/${projectId}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      entityId: crypto.randomUUID(),
      clientId: "load_probe",
      userId: "load-bot",
      timestamp: Date.now(),
      expectedVersion,
      action: {
        type: "task.create",
        data: {
          title: `Load Task ${String(iteration + 1).padStart(3, "0")}`,
          status: "todo",
          projectId,
        },
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`append failed with ${response.status}: ${payload}`);
  }
}

async function main() {
  const projectId = await createProject();
  const durations: number[] = [];

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const startedAt = performance.now();
    await appendTask(projectId, iteration, iteration + 1);
    durations.push(performance.now() - startedAt);
  }

  const summary = summarizeDurations(durations);

  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        iterations: ITERATIONS,
        projectId,
        summary,
      },
      null,
      2,
    ),
  );
}

await main();

export {};

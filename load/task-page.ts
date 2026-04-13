import { seedScaleProject } from "../src/server/demo-seeds";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const PAGE_LIMIT = Number(process.env.PAGE_LIMIT ?? "32");
const TASK_COUNT = Number(process.env.TASK_COUNT ?? "256");
const REPETITIONS = Number(process.env.REPETITIONS ?? "8");

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

async function timedFetch(url: string): Promise<number> {
  const startedAt = performance.now();
  const response = await fetch(url, {
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`request failed with ${response.status}: ${payload}`);
  }
  await response.json();
  return performance.now() - startedAt;
}

async function main() {
  const seeded = await seedScaleProject({
    baseUrl: BASE_URL,
    taskCount: TASK_COUNT,
  });

  const firstPageDurations: number[] = [];

  for (let index = 0; index < REPETITIONS; index += 1) {
    firstPageDurations.push(
      await timedFetch(`${BASE_URL}/api/projects/${seeded.projectId}/tasks?limit=${PAGE_LIMIT}`),
    );
  }

  const firstPageResponse = await fetch(
    `${BASE_URL}/api/projects/${seeded.projectId}/tasks?limit=${PAGE_LIMIT}`,
    {
      cache: "no-store",
    },
  );
  if (!firstPageResponse.ok) {
    throw new Error(`failed to fetch first page: ${firstPageResponse.status}`);
  }

  const firstPagePayload = (await firstPageResponse.json()) as {
    page: {
      nextCursor: string | null;
    };
  };

  const followUpDurations: number[] = [];
  if (firstPagePayload.page.nextCursor) {
    const encodedCursor = encodeURIComponent(firstPagePayload.page.nextCursor);

    for (let index = 0; index < REPETITIONS; index += 1) {
      followUpDurations.push(
        await timedFetch(
          `${BASE_URL}/api/projects/${seeded.projectId}/tasks?limit=${PAGE_LIMIT}&after=${encodedCursor}`,
        ),
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        firstPage: summarizeDurations(firstPageDurations),
        followUpPage:
          followUpDurations.length > 0 ? summarizeDurations(followUpDurations) : null,
        pageLimit: PAGE_LIMIT,
        projectId: seeded.projectId,
        taskCount: TASK_COUNT,
      },
      null,
      2,
    ),
  );
}

await main();

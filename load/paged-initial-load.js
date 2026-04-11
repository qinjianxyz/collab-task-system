import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_ID = __ENV.PROJECT_ID;
const TASK_LIMIT = Number(__ENV.TASK_LIMIT ?? "100");

if (!PROJECT_ID) {
  throw new Error("PROJECT_ID is required");
}

export const options = {
  vus: Number(__ENV.VUS ?? "20"),
  iterations: Number(__ENV.ITERATIONS ?? "200"),
  thresholds: {
    http_req_duration: ["p(95)<250"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const snapshotResponse = http.get(
    `${BASE_URL}/api/projects/${PROJECT_ID}/snapshot?taskLimit=${TASK_LIMIT}`,
  );

  check(snapshotResponse, {
    "snapshot served": (result) => result.status === 200,
  });

  const snapshotPayload = snapshotResponse.json();
  const snapshot = snapshotPayload.snapshot;

  check(snapshot, {
    "snapshot includes page metadata": (value) =>
      value &&
      value.taskPage &&
      value.taskPage.totalCount >= TASK_LIMIT &&
      value.taskPage.tasks.length <= TASK_LIMIT,
  });

  if (snapshot.taskPage.hasMore && snapshot.taskPage.nextCursor) {
    const nextPageResponse = http.get(
      `${BASE_URL}/api/projects/${PROJECT_ID}/tasks?after=${encodeURIComponent(snapshot.taskPage.nextCursor)}&limit=${TASK_LIMIT}`,
    );

    check(nextPageResponse, {
      "next task page served": (result) => result.status === 200,
    });
  }
}

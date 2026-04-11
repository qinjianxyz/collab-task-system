import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_ID = __ENV.PROJECT_ID;
const CATCHUP_WINDOW = Number(__ENV.CATCHUP_WINDOW ?? "250");

if (!PROJECT_ID) {
  throw new Error("PROJECT_ID is required");
}

export const options = {
  vus: Number(__ENV.VUS ?? "30"),
  iterations: Number(__ENV.ITERATIONS ?? "300"),
  thresholds: {
    http_req_duration: ["p(95)<220"],
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  const snapshotResponse = http.get(
    `${BASE_URL}/api/projects/${PROJECT_ID}/snapshot?taskLimit=1`,
  );

  check(snapshotResponse, {
    "snapshot for reconnect setup served": (result) => result.status === 200,
  });

  const snapshotPayload = snapshotResponse.json();

  return {
    version: snapshotPayload.snapshot.version,
  };
}

export default function (data) {
  const versionGap = (__ITER % CATCHUP_WINDOW) + 1;
  const since = Math.max(0, data.version - versionGap);
  const response = http.get(
    `${BASE_URL}/api/projects/${PROJECT_ID}/events?since=${since}`,
  );

  check(response, {
    "catch-up request served": (result) => result.status === 200,
  });

  const payload = response.json();
  check(payload, {
    "returns ordered events": (value) =>
      Array.isArray(value.events) &&
      value.events.every((event, index, events) => {
        if (index === 0) {
          return event.version > since;
        }

        return event.version > events[index - 1].version;
      }),
  });
}

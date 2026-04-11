import http from "k6/http";
import { Counter } from "k6/metrics";
import { check } from "k6";

const appendSuccess = new Counter("append_success");
const BASE_URL = __ENV.BASE_URL ?? "http://127.0.0.1:3000";
const VUS = Number(__ENV.VUS ?? "8");
const HEADERS = {
  headers: {
    "content-type": "application/json",
  },
};

export const options = {
  vus: VUS,
  duration: __ENV.DURATION ?? "20s",
  thresholds: {
    append_success: ["count>0"],
    http_req_duration: ["p(95)<400"],
    http_req_failed: ["rate<0.01"],
  },
};

function createProject(slot) {
  const response = http.post(
    `${BASE_URL}/api/projects`,
    JSON.stringify({
      clientId: `load_setup_${slot}`,
      name: `Append Load ${slot}`,
      userId: "loadbot",
    }),
    HEADERS,
  );

  check(response, {
    "project created": (result) => result.status === 201,
  });

  return response.json("projectId");
}

export function setup() {
  const projects = [];

  for (let slot = 0; slot < VUS; slot += 1) {
    projects.push(createProject(slot));
  }

  return {
    projects,
  };
}

export default function (data) {
  const projectId = data.projects[(__VU - 1) % data.projects.length];
  const response = http.post(
    `${BASE_URL}/api/projects/${projectId}/events`,
    JSON.stringify({
      action: {
        type: "task.create",
        data: {
          title: `Load task ${__VU}-${__ITER}`,
          status: "todo",
          projectId,
          position: __ITER + 1,
        },
      },
      clientId: `append_vu_${__VU}_${__ITER}`,
      entityId: `load_task_${projectId}_${__VU}_${__ITER}`,
      expectedVersion: __ITER + 1,
      id: `evt_append_${projectId}_${__VU}_${__ITER}`,
      timestamp: Date.now(),
      userId: `vu-${__VU}`,
    }),
    HEADERS,
  );

  check(response, {
    "append accepted": (result) => result.status === 201,
  });

  if (response.status === 201) {
    appendSuccess.add(1);
  }
}

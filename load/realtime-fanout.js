const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const LISTENERS = Number(process.env.LISTENERS ?? "25");
const EVENT_COUNT = Number(process.env.EVENT_COUNT ?? "5");

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio));
  return sorted[index];
}

async function createProject() {
  const response = await fetch(`${BASE_URL}/api/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientId: "fanout_setup",
      name: "Realtime Fanout Probe",
      userId: "loadbot",
    }),
  });

  if (!response.ok) {
    throw new Error(`project creation failed with status ${response.status}`);
  }

  return response.json();
}

async function openStream(projectId, listenerIndex) {
  const controller = new AbortController();
  const response = await fetch(
    `${BASE_URL}/api/projects/${projectId}/stream?clientId=listener_${listenerIndex}&userId=listener_${listenerIndex}&location=load`,
    {
      signal: controller.signal,
    },
  );

  if (!response.ok || !response.body) {
    throw new Error(`stream open failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  async function nextEvent() {
    while (true) {
      const delimiterIndex = buffer.indexOf("\n\n");
      if (delimiterIndex !== -1) {
        const rawEvent = buffer.slice(0, delimiterIndex);
        buffer = buffer.slice(delimiterIndex + 2);

        const lines = rawEvent.split("\n");
        const eventName = lines
          .find((line) => line.startsWith("event:"))
          ?.slice("event:".length)
          .trim();
        const data = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice("data:".length).trim())
          .join("\n");

        return {
          event: eventName,
          data: data ? JSON.parse(data) : null,
        };
      }

      const { done, value } = await reader.read();
      if (done || !value) {
        throw new Error("stream closed before emitting the expected event");
      }

      buffer += decoder.decode(value, {
        stream: true,
      });
    }
  }

  return {
    close() {
      controller.abort();
      void reader.cancel().catch(() => undefined);
    },
    nextEvent,
  };
}

async function appendTaskEvent(projectId, expectedVersion, index) {
  const eventId = `evt_fanout_${index}_${crypto.randomUUID()}`;
  const response = await fetch(`${BASE_URL}/api/projects/${projectId}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: {
        type: "task.create",
        data: {
          title: `Fanout task ${index}`,
          status: "todo",
          projectId,
          position: index,
        },
      },
      clientId: `fanout_writer_${index}`,
      entityId: `fanout_task_${index}`,
      expectedVersion,
      id: eventId,
      timestamp: Date.now(),
      userId: "loadbot",
    }),
  });

  if (!response.ok) {
    throw new Error(`append failed with status ${response.status}`);
  }

  return response.json();
}

async function main() {
  const { projectId } = await createProject();
  const listeners = await Promise.all(
    Array.from({ length: LISTENERS }, (_, index) => openStream(projectId, index + 1)),
  );

  for (const listener of listeners) {
    await listener.nextEvent();
  }

  const latencies = [];

  for (let index = 0; index < EVENT_COUNT; index += 1) {
    const startedAt = performance.now();
    const { event } = await appendTaskEvent(projectId, index + 1, index + 1);
    const deliveries = await Promise.all(
      listeners.map(async (listener) => {
        while (true) {
          const next = await listener.nextEvent();
          if (next.event !== "project-event") {
            continue;
          }

          if (next.data?.event?.id === event.id) {
            return performance.now() - startedAt;
          }
        }
      }),
    );

    latencies.push(...deliveries);
  }

  for (const listener of listeners) {
    listener.close();
  }

  const summary = {
    eventCount: EVENT_COUNT,
    listeners: LISTENERS,
    maxLatencyMs: Math.max(...latencies),
    meanLatencyMs:
      latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length),
    p95LatencyMs: percentile(latencies, 0.95),
    projectId,
  };

  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

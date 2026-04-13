import { seedScaleProject } from "../src/server/demo-seeds";

const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.APP_PORT ?? "3000"}`;
const taskCount = process.env.TASK_COUNT ? Number(process.env.TASK_COUNT) : undefined;

seedScaleProject({ baseUrl, taskCount })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

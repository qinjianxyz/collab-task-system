import { spawnSync } from "node:child_process";

function main(): void {
  const args = [
    "playwright",
    "install",
    ...(process.platform === "linux" ? ["--with-deps"] : []),
    "chromium",
  ];

  const result = spawnSync("bunx", args, {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main();

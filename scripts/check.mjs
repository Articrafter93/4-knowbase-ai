import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false, ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("python", ["-c", "import compileall, sys; sys.exit(0 if compileall.compile_dir('backend/app', quiet=1) else 1)"]);

if (existsSync("frontend/node_modules")) {
  run("npm", ["--prefix", "frontend", "run", "lint"]);
} else {
  console.log("Skipping frontend lint because frontend/node_modules is missing.");
}

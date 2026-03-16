import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const spawnOptions = { stdio: "inherit", shell: false, ...options };
  let result;

  if (process.platform === "win32" && command === "npm") {
    result = spawnSync("cmd.exe", ["/d", "/s", "/c", command, ...args], spawnOptions);
  } else {
    result = spawnSync(command, args, spawnOptions);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPythonCompileCheck() {
  const candidates = [
    ["python", ["-c", "import compileall, sys; sys.exit(0 if compileall.compile_dir('backend/app', quiet=1) else 1)"]],
    ["py", ["-3", "-c", "import compileall, sys; sys.exit(0 if compileall.compile_dir('backend/app', quiet=1) else 1)"]],
    ["python3", ["-c", "import compileall, sys; sys.exit(0 if compileall.compile_dir('backend/app', quiet=1) else 1)"]],
  ];

  for (const [command, args] of candidates) {
    const result = spawnSync(command, args, { stdio: "inherit", shell: false });
    if (result.status === 0) {
      return;
    }
    if (result.error?.code !== "ENOENT") {
      process.exit(result.status ?? 1);
    }
  }

  console.error("Unable to find a Python executable (python, py, python3) to run backend compile checks.");
  process.exit(1);
}

runPythonCompileCheck();

if (existsSync("frontend/node_modules")) {
  run("npm", ["--prefix", "frontend", "run", "lint"]);
} else {
  console.log("Skipping frontend lint because frontend/node_modules is missing.");
}

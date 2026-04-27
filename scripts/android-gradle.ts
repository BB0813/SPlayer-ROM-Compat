import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const androidDir = path.resolve(import.meta.dirname, "../android");
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

const result =
  process.platform === "win32"
    ? spawnSync("cmd.exe", ["/c", "gradlew.bat", ...args], {
        cwd: androidDir,
        stdio: "inherit",
        shell: false,
      })
    : spawnSync(path.join(androidDir, "gradlew"), args, {
        cwd: androidDir,
        stdio: "inherit",
        shell: false,
      });

if (result.error) {
  console.error("[android-gradle] 执行失败", result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);

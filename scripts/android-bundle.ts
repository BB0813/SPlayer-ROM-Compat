import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const outputsDir = path.join(rootDir, "android", "app", "build", "outputs", "bundle", "release");
const archiveDir = path.join(rootDir, "android", "dist", "bundle", "release");

const runCommand = (command: string) => {
  execSync(command, {
    cwd: rootDir,
    stdio: "inherit",
  });
};

const bundleFiles = () => {
  if (!fs.existsSync(outputsDir)) return [] as string[];

  return fs
    .readdirSync(outputsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(outputsDir, entry.name))
    .filter((file) => file.endsWith(".aab"));
};

fs.mkdirSync(archiveDir, { recursive: true });
for (const file of bundleFiles()) {
  fs.rmSync(file, { force: true });
}
for (const file of fs.existsSync(archiveDir)
  ? fs.readdirSync(archiveDir).map((name) => path.join(archiveDir, name))
  : []) {
  if (fs.statSync(file).isFile()) {
    fs.rmSync(file, { force: true });
  }
}

runCommand("pnpm android:prepareWeb");
runCommand("pnpm android:gradle -- bundleRelease");

const artifacts = bundleFiles();
if (artifacts.length === 0) {
  console.error("[android-bundle] 未找到 AAB 产物");
  process.exit(1);
}

for (const sourceFile of artifacts) {
  const targetFile = path.join(archiveDir, path.basename(sourceFile));
  fs.copyFileSync(sourceFile, targetFile);
  console.log(`[android-bundle] 已归档 ${path.relative(rootDir, targetFile)}`);
}

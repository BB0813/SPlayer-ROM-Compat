import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const [, , buildTypeArg, abiArg] = process.argv;

const buildType =
  buildTypeArg === "debug" ? "debug" : buildTypeArg === "release" ? "release" : null;
const supportedAbis = ["arm64-v8a", "armeabi-v7a", "x86_64"] as const;
const abi = abiArg ?? null;
const isAllAbiBuild = abi === "all";
const targetAbis = isAllAbiBuild
  ? [...supportedAbis]
  : supportedAbis.includes(abi as (typeof supportedAbis)[number])
    ? [abi as (typeof supportedAbis)[number]]
    : [];

if (!buildType || targetAbis.length === 0) {
  console.error("[android-apk] 用法：tsx scripts/android-apk.ts <debug|release> <all|abi>");
  process.exit(1);
}

const rootDir = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")) as {
  productName?: string;
  version?: string;
};
const productName = packageJson.productName ?? "SPlayer-ROM-Compat";
const version = packageJson.version ?? "0.0.0";
const outputsDir = path.join(rootDir, "android", "app", "build", "outputs", "apk", buildType);
const archiveDir = path.join(rootDir, "android", "dist", "apk", buildType);
const gradleTask = buildType === "release" ? "assembleRelease" : "assembleDebug";
const filePattern = new RegExp(`-(${targetAbis.join("|")})-${buildType}.*[.]apk$`);
const baselineDir = path.join(outputsDir, "baselineProfiles");

const runCommand = (command: string) => {
  execSync(command, {
    cwd: rootDir,
    stdio: "inherit",
  });
};

const collectFiles = (dir: string, matcher: (file: string) => boolean) => {
  if (!fs.existsSync(dir)) return [] as string[];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .filter(matcher);
};

const resolveAbiFromFile = (file: string) => {
  const baseName = path.basename(file);
  return targetAbis.find((targetAbi) => baseName.includes(`-${targetAbi}-${buildType}`));
};

fs.mkdirSync(archiveDir, { recursive: true });

for (const targetAbi of targetAbis) {
  const archivePattern = new RegExp(`-${targetAbi}-${buildType}`);
  for (const file of collectFiles(archiveDir, (currentFile) =>
    archivePattern.test(path.basename(currentFile)),
  )) {
    fs.rmSync(file, { force: true });
  }
}

runCommand("pnpm android:prepareWeb");
runCommand(
  isAllAbiBuild
    ? `pnpm android:gradle -- ${gradleTask}`
    : `pnpm android:gradle -- ${gradleTask} -PtargetAbi=${targetAbis[0]}`,
);

const apkFiles = collectFiles(outputsDir, (file) => filePattern.test(path.basename(file)));

if (apkFiles.length === 0) {
  console.error(`[android-apk] 未找到 ${buildType}/${targetAbis.join(",")} 对应的 APK`);
  process.exit(1);
}

for (const sourceFile of apkFiles) {
  const matchedAbi = resolveAbiFromFile(sourceFile);
  if (!matchedAbi) continue;

  const targetFile = path.join(archiveDir, path.basename(sourceFile));
  const versionedTargetFile = path.join(
    archiveDir,
    `${productName}-v${version}-${matchedAbi}-${buildType}.apk`,
  );
  fs.copyFileSync(sourceFile, targetFile);
  fs.copyFileSync(sourceFile, versionedTargetFile);
  console.log(`[android-apk] 已复制 ${path.relative(rootDir, targetFile)}`);
  console.log(`[android-apk] 已复制 ${path.relative(rootDir, versionedTargetFile)}`);
}

if (fs.existsSync(baselineDir)) {
  const profileTargets = fs
    .readdirSync(baselineDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const currentDir = path.join(baselineDir, entry.name);
      return collectFiles(currentDir, (file) =>
        filePattern.test(path.basename(file).replace(/\.dm$/, ".apk")),
      );
    });

  for (const sourceFile of profileTargets) {
    const parentName = path.basename(path.dirname(sourceFile));
    const extName = path.extname(sourceFile);
    const baseName = path.basename(sourceFile, extName);
    const targetName = `${baseName}-profile-${parentName}${extName}`;
    const targetFile = path.join(archiveDir, targetName);
    fs.copyFileSync(sourceFile, targetFile);
    console.log(`[android-apk] 已复制 ${path.relative(rootDir, targetFile)}`);
  }
}

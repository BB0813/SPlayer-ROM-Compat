import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const rootDir = path.resolve(import.meta.dirname, "..");
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const defaultSource = "public/icons/favicon.png";
const explicitSource = process.env.SPLAYER_ANDROID_ICON_SOURCE;

const densities = [
  { name: "mdpi", launcher: 48, foreground: 108 },
  { name: "hdpi", launcher: 72, foreground: 162 },
  { name: "xhdpi", launcher: 96, foreground: 216 },
  { name: "xxhdpi", launcher: 144, foreground: 324 },
  { name: "xxxhdpi", launcher: 192, foreground: 432 },
] as const;

const publicIcons = [
  { file: "public/icons/logo-icon.png", size: 512 },
  { file: "public/icons/logo-icon-1024x1024.png", size: 1024 },
  { file: "public/icons/favicon.png", size: 512 },
  { file: "public/icons/favicon-16x16.png", size: 16 },
  { file: "public/icons/favicon-32x32.png", size: 32 },
  { file: "public/icons/favicon-96x96.png", size: 96 },
  { file: "public/icons/favicon-192x192.png", size: 192 },
  { file: "public/icons/favicon-256x256.png", size: 256 },
  { file: "public/icons/favicon-512x512.png", size: 512 },
] as const;

const resolveCandidatePath = (candidate: string) =>
  path.isAbsolute(candidate) ? candidate : path.join(rootDir, candidate);

const isSamePath = (left: string, right: string) => path.resolve(left) === path.resolve(right);

const resolveSourceIcon = () => {
  const sourceCandidate = explicitSource || defaultSource;
  const sourcePath = resolveCandidatePath(sourceCandidate);

  if (!fs.existsSync(sourcePath)) throw new Error(`图标源文件不存在：${sourceCandidate}`);

  return sourcePath;
};

const renderPng = async (
  sourceBuffer: Buffer,
  targetPath: string,
  canvasSize: number,
  contentScale = 1,
) => {
  const contentSize = Math.max(1, Math.round(canvasSize * contentScale));
  const iconBuffer = await sharp(sourceBuffer)
    .ensureAlpha()
    .resize(contentSize, contentSize, {
      fit: "contain",
      background: transparent,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: transparent,
    },
  })
    .composite([{ input: iconBuffer, gravity: "center" }])
    .png()
    .toFile(targetPath);
};

const syncAndroidIcons = async (sourceBuffer: Buffer) => {
  for (const density of densities) {
    const mipmapDir = path.join(
      rootDir,
      "android",
      "app",
      "src",
      "main",
      "res",
      `mipmap-${density.name}`,
    );
    await renderPng(sourceBuffer, path.join(mipmapDir, "ic_launcher.png"), density.launcher, 0.86);
    await renderPng(
      sourceBuffer,
      path.join(mipmapDir, "ic_launcher_round.png"),
      density.launcher,
      0.86,
    );
    await renderPng(
      sourceBuffer,
      path.join(mipmapDir, "ic_launcher_foreground.png"),
      density.foreground,
      0.67,
    );
  }
};

const syncPublicIcons = async (sourceBuffer: Buffer, sourcePath: string) => {
  for (const icon of publicIcons) {
    const targetPath = path.join(rootDir, icon.file);
    if (isSamePath(sourcePath, targetPath)) continue;
    await renderPng(sourceBuffer, targetPath, icon.size);
  }
};

const main = async () => {
  const sourcePath = resolveSourceIcon();
  const sourceBuffer = fs.readFileSync(sourcePath);

  await syncPublicIcons(sourceBuffer, sourcePath);
  await syncAndroidIcons(sourceBuffer);

  console.log(
    `[android-sync-icons] 已从 ${path.relative(rootDir, sourcePath)} 刷新 Android 与公共图标`,
  );
};

main().catch((error) => {
  console.error("[android-sync-icons] 图标同步失败", error);
  process.exit(1);
});

/** 是否为开发环境 */
export const isDev = import.meta.env.MODE === "development" || import.meta.env.DEV;

/** 系统判断 */
export const userAgent = typeof window !== "undefined" ? window.navigator.userAgent : "";

/** 是否为 Windows 系统 */
export const isWin = userAgent.includes("Windows");
/** 是否为 macOS 系统 */
export const isMac = userAgent.includes("Macintosh");
/** 是否为 Linux 系统 */
export const isLinux = userAgent.includes("Linux");
/** 是否为 Android 设备 */
export const isAndroidDevice = /Android/i.test(userAgent);

const getWindowRecord = (): Record<string, unknown> | null => {
  return typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
};

const hasAndroidBridgeObject = (): boolean => {
  const win = getWindowRecord();
  if (!win) return false;

  return [
    "splayerAndroid",
    "splayerAndroidStore",
    "splayerAndroidApi",
    "splayerAndroidPlayer",
    "splayerAndroidSystem",
    "splayerAndroidMedia",
  ].some((key) => typeof win[key] !== "undefined");
};

const isAndroidWebView = (): boolean => {
  if (!isAndroidDevice || typeof window === "undefined") return false;

  const { hostname, protocol, pathname } = window.location;
  return (
    hostname === "appassets.androidplatform.net" ||
    protocol === "file:" ||
    pathname.startsWith("/assets/www/") ||
    /; wv\)/i.test(userAgent) ||
    /Version\/[\d.]+.*Chrome/i.test(userAgent)
  );
};

/** 是否为 Android 容器 */
export const isAndroidApp =
  typeof window !== "undefined" && (hasAndroidBridgeObject() || isAndroidWebView());
/** 是否为 Electron 环境 */
export const isElectron =
  !isAndroidApp &&
  (userAgent.includes("Electron") ||
    (typeof window !== "undefined" && typeof window.electron !== "undefined"));

/** 是否为移动端 */
export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  userAgent,
);

/** 是否为 DEV 构建 */
export const isDevBuild = import.meta.env.VITE_BUILD_TYPE === "dev";

/** 检查环境是否支持隔离 */
export const checkIsolationSupport = (): boolean => {
  const scope =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof self !== "undefined"
        ? self
        : typeof window !== "undefined"
          ? window
          : undefined;

  if (!scope) {
    return false;
  }

  const isSecure = !!scope.isSecureContext;
  const isIsolated = !!scope.crossOriginIsolated;
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";

  return isSecure && isIsolated && hasSharedArrayBuffer;
};

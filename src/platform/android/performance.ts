import {
  clearAndroidNativeDiagnosticsReport,
  getAndroidNativeDiagnosticsReport,
  recordAndroidNativeDiagnosticEvent,
} from "@/platform/bridge/android";
import { isAndroidApp } from "@/utils/env";

const FLUSH_INTERVAL_MS = 10000;
const MAX_EVENTS = 240;
const LONG_TASK_THRESHOLD_MS = 120;
const LAYOUT_OVERFLOW_THRESHOLD_PX = 2;
const LAYOUT_PROBE_MIN_INTERVAL_MS = 1200;

interface AndroidDiagnosticEvent {
  time: string;
  source: string;
  message: string;
  detail?: Record<string, unknown>;
}

interface AndroidDiagnosticsSnapshotExtra {
  [key: string]: unknown;
}

interface AndroidLayoutProbeEntry {
  selector: string;
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
  overflowX: string;
  width: number;
  left: number;
  right: number;
  delta: number;
}

interface AndroidLayoutSnapshot {
  reason: string;
  capturedAt: string;
  viewportWidth: number;
  viewportHeight: number;
  documentScrollWidth: number;
  documentClientWidth: number;
  bodyScrollWidth: number;
  bodyClientWidth: number;
  rootScrollLeft: number;
  bodyScrollLeft: number;
  hasOverflow: boolean;
  overflowing: AndroidLayoutProbeEntry[];
}

const counters = new Map<string, number>();
const events: AndroidDiagnosticEvent[] = [];
let diagnosticsEnabled = false;
let flushTimer: number | null = null;
let listenersInstalled = false;
let longTaskObserver: PerformanceObserver | null = null;
let frameSamplerId: number | null = null;
let frameSamplerStartedAt = 0;
let frameSamplerCount = 0;
let lastLayoutProbeAt = 0;

const now = () => new Date().toISOString();

const appendAndroidDiagnosticEvent = (
  source: string,
  message: string,
  detail?: Record<string, unknown>,
  syncNative = false,
) => {
  if (!isAndroidApp) return;

  events.push({ time: now(), source, message, detail });
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  if (syncNative) {
    recordAndroidNativeDiagnosticEvent(source, message, detail);
  }
};

const layoutProbeSelectors = [
  "html",
  "body",
  "#app",
  "#app-layout",
  "#main",
  "#main-layout",
  "#main-content",
  "#main-content .n-layout-scroll-container",
  ".router-view",
  ".home",
  ".home-online",
  ".list-detail",
  ".song-list",
  ".setting",
  ".main-setting",
  ".main-player",
  ".mobile-tabbar",
];

const normalizeUnknown = (value: unknown): Record<string, unknown> => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return { value: String(value) };
};

const roundLayoutValue = (value: number) => Math.round(value * 10) / 10;

const readLayoutProbeEntry = (selector: string): AndroidLayoutProbeEntry | null => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  const scrollWidth = Math.round(element.scrollWidth);
  const clientWidth = Math.round(element.clientWidth);
  const delta = Math.max(0, scrollWidth - clientWidth);

  if (delta <= LAYOUT_OVERFLOW_THRESHOLD_PX && Math.abs(element.scrollLeft) <= 0) return null;

  return {
    selector,
    scrollWidth,
    clientWidth,
    scrollLeft: Math.round(element.scrollLeft),
    overflowX: styles.overflowX,
    width: roundLayoutValue(rect.width),
    left: roundLayoutValue(rect.left),
    right: roundLayoutValue(rect.right),
    delta,
  };
};

export const collectAndroidLayoutSnapshot = (reason = "manual"): AndroidLayoutSnapshot | null => {
  if (!isAndroidApp) return null;

  const documentElement = document.documentElement;
  const body = document.body;
  const overflowing = layoutProbeSelectors
    .map((selector) => readLayoutProbeEntry(selector))
    .filter((entry): entry is AndroidLayoutProbeEntry => Boolean(entry));
  const documentDelta = Math.max(
    0,
    Math.round(documentElement.scrollWidth - documentElement.clientWidth),
  );
  const bodyDelta = body ? Math.max(0, Math.round(body.scrollWidth - body.clientWidth)) : 0;
  const hasRootScroll =
    Math.abs(documentElement.scrollLeft) > 0 || (body ? Math.abs(body.scrollLeft) > 0 : false);
  const hasOverflow =
    overflowing.length > 0 ||
    documentDelta > LAYOUT_OVERFLOW_THRESHOLD_PX ||
    bodyDelta > LAYOUT_OVERFLOW_THRESHOLD_PX ||
    hasRootScroll;

  return {
    reason,
    capturedAt: now(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentScrollWidth: documentElement.scrollWidth,
    documentClientWidth: documentElement.clientWidth,
    bodyScrollWidth: body?.scrollWidth ?? 0,
    bodyClientWidth: body?.clientWidth ?? 0,
    rootScrollLeft: Math.round(documentElement.scrollLeft),
    bodyScrollLeft: Math.round(body?.scrollLeft ?? 0),
    hasOverflow,
    overflowing,
  };
};

export const recordAndroidLayoutProbe = (reason: string, force = false): void => {
  if (!isAndroidApp) return;

  const currentTime = Date.now();
  if (!force && currentTime - lastLayoutProbeAt < LAYOUT_PROBE_MIN_INTERVAL_MS) return;
  lastLayoutProbeAt = currentTime;

  const snapshot = collectAndroidLayoutSnapshot(reason);
  if (!snapshot) return;

  document.documentElement.classList.toggle(
    "android-layout-overflow-detected",
    snapshot.hasOverflow,
  );

  if (!snapshot.hasOverflow && !force) return;

  appendAndroidDiagnosticEvent(
    "web:layout",
    snapshot.hasOverflow ? "检测到 Android 布局溢出" : "Android 布局正常",
    snapshot as unknown as Record<string, unknown>,
    snapshot.hasOverflow,
  );
};

const stopFlushTimer = () => {
  if (flushTimer === null) return;
  window.clearInterval(flushTimer);
  flushTimer = null;
};

const readPerformanceMemory = () => {
  const memory = (performance as Performance & { memory?: Record<string, number> }).memory;
  if (!memory) return null;

  return {
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    totalJSHeapSize: memory.totalJSHeapSize,
    usedJSHeapSize: memory.usedJSHeapSize,
  };
};

const flushAndroidPerformanceCounters = (force = false) => {
  if ((!diagnosticsEnabled && !force) || counters.size === 0) return;

  const summary = Array.from(counters.entries())
    .map(([name, count]) => `${name}=${count}`)
    .join(" ");
  const detail = Object.fromEntries(counters.entries());
  counters.clear();

  console.info(`[SPlayer Android 性能] ${FLUSH_INTERVAL_MS / 1000}s 统计 ${summary}`);
  appendAndroidDiagnosticEvent("web:counter", "播放期事件统计", detail, true);
};

const ensureFlushTimer = () => {
  if (!isAndroidApp || !diagnosticsEnabled || flushTimer !== null) return;
  flushTimer = window.setInterval(flushAndroidPerformanceCounters, FLUSH_INTERVAL_MS);
};

const stopLongTaskObserver = () => {
  longTaskObserver?.disconnect();
  longTaskObserver = null;
};

const startLongTaskObserver = () => {
  if (!isAndroidApp || !diagnosticsEnabled || longTaskObserver) return;
  if (!("PerformanceObserver" in window)) return;

  try {
    longTaskObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration < LONG_TASK_THRESHOLD_MS) return;
        appendAndroidDiagnosticEvent(
          "web:longtask",
          "检测到 WebView 主线程长任务",
          {
            name: entry.name,
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          },
          true,
        );
      });
    });
    longTaskObserver.observe({ entryTypes: ["longtask"] });
  } catch (error) {
    appendAndroidDiagnosticEvent("web:longtask", "长任务监听不可用", normalizeUnknown(error), true);
  }
};

const stopFrameSampler = () => {
  if (frameSamplerId !== null) {
    window.cancelAnimationFrame(frameSamplerId);
    frameSamplerId = null;
  }
  frameSamplerStartedAt = 0;
  frameSamplerCount = 0;
};

const sampleFrame = (timestamp: number) => {
  if (!diagnosticsEnabled) {
    stopFrameSampler();
    return;
  }

  if (frameSamplerStartedAt === 0) {
    frameSamplerStartedAt = timestamp;
  }
  frameSamplerCount += 1;

  const duration = timestamp - frameSamplerStartedAt;
  if (duration >= FLUSH_INTERVAL_MS) {
    const fps = Math.round((frameSamplerCount * 1000 * 10) / duration) / 10;
    appendAndroidDiagnosticEvent(
      "web:frame",
      "播放期帧率采样",
      {
        fps,
        frames: frameSamplerCount,
        duration: Math.round(duration),
        visibilityState: document.visibilityState,
      },
      true,
    );
    frameSamplerStartedAt = timestamp;
    frameSamplerCount = 0;
  }

  frameSamplerId = window.requestAnimationFrame(sampleFrame);
};

const startFrameSampler = () => {
  if (!isAndroidApp || !diagnosticsEnabled || frameSamplerId !== null) return;
  frameSamplerId = window.requestAnimationFrame(sampleFrame);
};

const installAndroidDiagnosticsListeners = () => {
  if (!isAndroidApp || listenersInstalled) return;
  listenersInstalled = true;

  window.addEventListener("error", (event) => {
    appendAndroidDiagnosticEvent(
      "web:error",
      "捕获到页面错误",
      {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error ? normalizeUnknown(event.error) : undefined,
      },
      true,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    appendAndroidDiagnosticEvent(
      "web:promise",
      "捕获到未处理 Promise 异常",
      normalizeUnknown(event.reason),
      true,
    );
  });

  document.addEventListener("visibilitychange", () => {
    appendAndroidDiagnosticEvent("web:lifecycle", "页面可见性变化", {
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener("pagehide", () => {
    appendAndroidDiagnosticEvent("web:lifecycle", "页面进入隐藏或卸载", {
      persisted: false,
    });
    flushAndroidPerformanceCounters(true);
  });

  window.addEventListener("pageshow", (event) => {
    appendAndroidDiagnosticEvent("web:lifecycle", "页面恢复显示", {
      persisted: event.persisted,
    });
  });
};

const ensureDiagnosticsRuntime = () => {
  installAndroidDiagnosticsListeners();
  ensureFlushTimer();
  startLongTaskObserver();
  startFrameSampler();
};

export const initializeAndroidPerformanceDiagnostics = (): void => {
  if (!isAndroidApp) return;
  installAndroidDiagnosticsListeners();
  appendAndroidDiagnosticEvent("web:lifecycle", "Android 诊断监听已初始化", {
    href: window.location.href,
    userAgent: navigator.userAgent,
  });
};

export const setAndroidPerformanceDiagnosticsEnabled = (enabled: boolean): void => {
  diagnosticsEnabled = isAndroidApp && enabled;

  if (diagnosticsEnabled) {
    appendAndroidDiagnosticEvent("web:diagnostics", "Android 性能诊断已开启", undefined, true);
    ensureDiagnosticsRuntime();
    return;
  }

  flushAndroidPerformanceCounters(true);
  counters.clear();
  stopFlushTimer();
  stopLongTaskObserver();
  stopFrameSampler();
};

export const recordAndroidPerformanceEvent = (name: string): void => {
  if (!isAndroidApp || !diagnosticsEnabled) return;

  counters.set(name, (counters.get(name) ?? 0) + 1);
  ensureDiagnosticsRuntime();
};

export const recordAndroidDiagnosticEvent = (
  source: string,
  message: string,
  detail?: Record<string, unknown>,
): void => {
  appendAndroidDiagnosticEvent(source, message, detail, true);
};

const getStorageEstimate = async () => {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
};

const parseNativeDiagnostics = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

export const buildAndroidPerformanceDiagnosticsReport = async (
  extra: AndroidDiagnosticsSnapshotExtra = {},
): Promise<string> => {
  flushAndroidPerformanceCounters(true);

  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const report = {
    generatedAt: now(),
    web: {
      href: window.location.href,
      userAgent: navigator.userAgent,
      language: navigator.language,
      visibilityState: document.visibilityState,
      online: navigator.onLine,
      devicePixelRatio: window.devicePixelRatio,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      htmlClasses: Array.from(document.documentElement.classList),
      memory: readPerformanceMemory(),
      storage: await getStorageEstimate(),
      navigation: navigation
        ? {
            type: navigation.type,
            duration: Math.round(navigation.duration),
            domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
            loadEventEnd: Math.round(navigation.loadEventEnd),
          }
        : null,
      counters: Object.fromEntries(counters.entries()),
      layout: collectAndroidLayoutSnapshot("report"),
      recentEvents: events.slice(-MAX_EVENTS),
    },
    native: parseNativeDiagnostics(getAndroidNativeDiagnosticsReport()),
    extra,
  };

  return JSON.stringify(report, null, 2);
};

export const clearAndroidPerformanceDiagnostics = (): void => {
  counters.clear();
  events.splice(0, events.length);
  clearAndroidNativeDiagnosticsReport();
  appendAndroidDiagnosticEvent("web:diagnostics", "Android 诊断缓存已清空", undefined, true);
};

import { isAndroidApp } from "@/utils/env";

const FLUSH_INTERVAL_MS = 10000;

const counters = new Map<string, number>();
let diagnosticsEnabled = false;
let flushTimer: number | null = null;

const stopFlushTimer = () => {
  if (flushTimer === null) return;
  window.clearInterval(flushTimer);
  flushTimer = null;
};

const flushAndroidPerformanceCounters = (force = false) => {
  if ((!diagnosticsEnabled && !force) || counters.size === 0) return;

  const summary = Array.from(counters.entries())
    .map(([name, count]) => `${name}=${count}`)
    .join(" ");
  counters.clear();
  console.info(`[SPlayer Android 性能] ${FLUSH_INTERVAL_MS / 1000}s 统计 ${summary}`);
};

const ensureFlushTimer = () => {
  if (!isAndroidApp || !diagnosticsEnabled || flushTimer !== null) return;
  flushTimer = window.setInterval(flushAndroidPerformanceCounters, FLUSH_INTERVAL_MS);
};

export const setAndroidPerformanceDiagnosticsEnabled = (enabled: boolean): void => {
  diagnosticsEnabled = isAndroidApp && enabled;

  if (diagnosticsEnabled) {
    ensureFlushTimer();
    return;
  }

  flushAndroidPerformanceCounters(true);
  counters.clear();
  stopFlushTimer();
};

export const recordAndroidPerformanceEvent = (name: string): void => {
  if (!isAndroidApp || !diagnosticsEnabled) return;

  counters.set(name, (counters.get(name) ?? 0) + 1);
  ensureFlushTimer();
};

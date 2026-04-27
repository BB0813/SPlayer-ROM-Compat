import {
  deleteBridgeStoreKey,
  emitAndroidPlayerEvent,
  hasBridgeStoreKey,
  isAndroidBridgeAvailable,
  readBridgeStore,
  resetBridgeStoreKeys,
  writeBridgeStore,
} from "./android";
import type { AndroidPlayerEventPayload } from "./types";

const createLocalStoreBridge = () => ({
  get: async (key: string) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  },
  set: async (key: string, value: unknown) => {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  },
  has: async (key: string) => localStorage.getItem(key) !== null,
  delete: async (key: string) => {
    localStorage.removeItem(key);
    return true;
  },
  reset: async (keys?: string[]) => {
    if (keys?.length) {
      keys.forEach((key) => localStorage.removeItem(key));
    } else {
      localStorage.clear();
    }
    return true;
  },
  export: async (data: unknown) => ({ success: true, data }),
  import: async () => ({ success: true, data: null }),
});

export const installPlatformBridge = (): void => {
  if (!window.api) {
    window.api = {
      store: isAndroidBridgeAvailable()
        ? {
            get: readBridgeStore,
            set: writeBridgeStore,
            has: hasBridgeStoreKey,
            delete: deleteBridgeStoreKey,
            reset: resetBridgeStoreKeys,
            export: async (data: unknown) => ({ success: true, data }),
            import: async () => ({ success: true, data: null }),
          }
        : createLocalStoreBridge(),
    };
  }

  if (!window.logger) {
    window.logger = {
      info: (message: string, ...args: unknown[]) => console.info(message, ...args),
      warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
      error: (message: string, ...args: unknown[]) => console.error(message, ...args),
      debug: (message: string, ...args: unknown[]) => console.debug(message, ...args),
    };
  }

  window.__SPLAYER_ANDROID__ = {
    emitPlayerEvent: (type: string, detailJson?: string) => {
      let detail: AndroidPlayerEventPayload["detail"] = {};

      if (detailJson) {
        try {
          detail = JSON.parse(detailJson) as AndroidPlayerEventPayload["detail"];
        } catch {
          detail = { raw: detailJson };
        }
      }

      emitAndroidPlayerEvent({ type, detail });
    },
  };
};

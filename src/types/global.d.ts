import { DialogApi, LoadingBarApi, MessageApi, ModalApi, NotificationApi } from "naive-ui";
import type {
  AndroidApiBridge,
  AndroidBridge,
  AndroidMediaBridge,
  AndroidPlayerBridge,
  AndroidStoreBridge,
  AndroidSystemBridge,
} from "@/platform/bridge/types";

declare global {
  interface Window {
    $message: MessageApi;
    $dialog: DialogApi;
    $notification: NotificationApi;
    $loadingBar: LoadingBarApi;
    $modal: ModalApi;
    api: {
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: unknown) => Promise<boolean>;
        has: (key: string) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        reset: (keys?: string[]) => Promise<boolean>;
        export: (
          data: any,
        ) => Promise<{ success: boolean; path?: string; error?: string; data?: any }>;
        import: () => Promise<{ success: boolean; data?: any; error?: string }>;
      };
    };
    logger: {
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
      debug: (message: string, ...args: unknown[]) => void;
    };
    splayerAndroid?: AndroidBridge;
    splayerAndroidStore?: AndroidStoreBridge;
    splayerAndroidApi?: AndroidApiBridge;
    splayerAndroidPlayer?: AndroidPlayerBridge;
    splayerAndroidMedia?: AndroidMediaBridge;
    splayerAndroidSystem?: AndroidSystemBridge;
    __SPLAYER_ANDROID__?: {
      emitPlayerEvent: (type: string, detailJson?: string) => void;
    };
  }
}

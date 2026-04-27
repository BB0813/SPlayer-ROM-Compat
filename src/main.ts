import { createApp } from "vue";
import App from "./App.vue";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import router from "@/router";
import { debounceDirective, throttleDirective, visibleDirective } from "@/utils/instruction";
import initIpc from "@/utils/initIpc";
import { useSettingStore } from "@/stores";
import { sendRegisterProtocol } from "@/utils/protocol";
import { installPlatformBridge } from "@/platform/bridge/install";
import "@/style/main.scss";
import "@/style/animate.scss";
import "github-markdown-css/github-markdown.css";
import { isElectron } from "./utils/env";

installPlatformBridge();

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
app.use(pinia);
app.use(router);
app.directive("debounce", debounceDirective);
app.directive("throttle", throttleDirective);
app.directive("visible", visibleDirective);
app.config.errorHandler = (err, _instance, info) => {
  const error = err as Error & { isAxiosError?: boolean; code?: string };
  const message = error?.message || "";
  const nonCriticalKeywords = [
    "timeout",
    "Network Error",
    "网络",
    "超时",
    "ECONNABORTED",
    "ECONNREFUSED",
    "ENOTFOUND",
    "Failed to fetch",
    "Load failed",
  ];
  const isNonCritical =
    error?.isAxiosError ||
    error?.code === "ECONNABORTED" ||
    nonCriticalKeywords.some((kw) => message.includes(kw));

  if (isNonCritical) {
    console.warn("[Vue ErrorHandler] 已忽略非致命错误", err, info);
    return;
  }

  console.error("[Vue ErrorHandler] 致命错误", err, info);
};

app.mount("#app");

if (isElectron && !location.hash.includes("desktop-lyric")) initIpc();

if (isElectron && !location.hash.includes("desktop-lyric")) {
  const settings = useSettingStore();
  sendRegisterProtocol("orpheus", settings.registryProtocol.orpheus);
}

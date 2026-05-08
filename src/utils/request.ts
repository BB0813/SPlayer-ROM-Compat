import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import axiosRetry from "axios-retry";
import { getAndroidApiBridge } from "@/platform/bridge/android";
import { useSettingStore } from "@/stores";
import { isLogin } from "./auth";
import { buildCookieHeader, getCookie, setCookies } from "./cookie";
import { isAndroidApp, isDev } from "./env";

type SPlayerAxiosRequestConfig = AxiosRequestConfig & {
  /** 是否静默处理请求错误 */
  silentError?: boolean;
};

const baseURL: string = (() => {
  if (isAndroidApp) return "/api/netease";
  if (isDev) return "/api/netease";

  const envBaseURL = import.meta.env["VITE_API_URL"];
  if (typeof envBaseURL === "string" && envBaseURL.trim().length > 0) {
    return envBaseURL.trim();
  }

  console.warn("VITE_API_URL is missing, fallback to /api/netease");
  return "/api/netease";
})();

const server: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000,
});

axiosRetry(server, {
  retries: 3,
});

const normalizeHeaders = (headers: unknown): Record<string, string> => {
  if (!headers) return {};

  const source =
    headers instanceof AxiosHeaders
      ? headers.toJSON()
      : typeof headers === "object" &&
          headers !== null &&
          "toJSON" in headers &&
          typeof (headers as { toJSON: () => unknown }).toJSON === "function"
        ? (headers as { toJSON: () => unknown }).toJSON()
        : headers;

  return Object.entries(source as Record<string, unknown>).reduce<Record<string, string>>(
    (result, [key, value]) => {
      if (value === undefined || value === null) return result;
      result[key] = String(value);
      return result;
    },
    {},
  );
};

const appendQueryValue = (searchParams: URLSearchParams, key: string, value: unknown) => {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    value.forEach((item) => appendQueryValue(searchParams, key, item));
    return;
  }

  searchParams.append(key, String(value));
};

const buildApiPath = (config: SPlayerAxiosRequestConfig): string => {
  const currentBaseURL = String(config.baseURL ?? baseURL);
  const currentUrl = String(config.url ?? "");
  const normalizedBaseURL = currentBaseURL.endsWith("/")
    ? currentBaseURL.slice(0, -1)
    : currentBaseURL;
  const normalizedUrl = currentUrl.startsWith("/") ? currentUrl : `/${currentUrl}`;
  const url = new URL(
    `${normalizedBaseURL}${normalizedUrl}`,
    "https://appassets.androidplatform.net",
  );

  Object.entries(config.params ?? {}).forEach(([key, value]) => {
    appendQueryValue(url.searchParams, key, value);
  });

  return `${url.pathname}${url.search}`;
};

const prepareRequestConfig = (config: SPlayerAxiosRequestConfig): SPlayerAxiosRequestConfig => {
  const nextConfig: SPlayerAxiosRequestConfig = {
    ...config,
    params: {
      ...(config.params ?? {}),
    },
  };

  const settingStore = useSettingStore();
  if (!nextConfig.params) nextConfig.params = {};

  if (!nextConfig.params.noCookie && (isLogin() || getCookie("MUSIC_U") !== null)) {
    const cookieHeader = buildCookieHeader();
    if (cookieHeader) nextConfig.params.cookie = cookieHeader;
  }

  if (settingStore.useRealIP) {
    if (settingStore.realIP) {
      nextConfig.params.realIP = settingStore.realIP;
    } else {
      nextConfig.params.randomCNIP = true;
    }
  }

  if (settingStore.proxyProtocol !== "off") {
    const protocol = settingStore.proxyProtocol.toLowerCase();
    const proxyServer = settingStore.proxyServe;
    const proxyPort = settingStore.proxyPort;
    const proxy = `${protocol}://${proxyServer}:${proxyPort}`;
    if (proxy) nextConfig.params.proxy = proxy;
  }

  return nextConfig;
};

const handleResponseError = (error: AxiosError, silentError = false) => {
  if (silentError) {
    console.warn("请求失败，已按静默策略处理", error.message);
    return;
  }
  if (
    error.code === "ECONNABORTED" ||
    error.message.includes("timeout") ||
    error.message.includes("Network Error")
  ) {
    window.$message?.warning("网络请求超时，请检查网络连接");
    return;
  }

  const { response } = error;
  switch (response?.status) {
    case 400:
      console.warn("Client error:", response.status, response.statusText);
      break;
    case 401:
      console.warn("Unauthorized:", response.status, response.statusText);
      break;
    case 403:
      console.warn("Forbidden:", response.status, response.statusText);
      break;
    case 404:
      console.warn("Not found:", response.status, response.statusText);
      break;
    case 500:
      console.warn("Server error:", response.status, response.statusText);
      break;
    default:
      console.warn("Unhandled error:", error.message);
  }
};

server.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    handleResponseError(
      error,
      (error.config as SPlayerAxiosRequestConfig | undefined)?.silentError,
    );
    return Promise.reject(error);
  },
);

const shouldUseAndroidLocalApi = (config: SPlayerAxiosRequestConfig): boolean => {
  if (!isAndroidApp) return false;

  const currentBaseURL = String(config.baseURL ?? baseURL);
  if (currentBaseURL.startsWith("http://") || currentBaseURL.startsWith("https://")) {
    return false;
  }

  return currentBaseURL.startsWith("/api");
};

const toInternalAxiosConfig = (config: SPlayerAxiosRequestConfig): InternalAxiosRequestConfig => {
  return {
    ...config,
    headers: config.headers ?? {},
  } as InternalAxiosRequestConfig;
};

const parseBridgeBody = (contentType: string, body: string): unknown => {
  if (!body) return null;
  if (contentType.includes("application/json")) {
    return JSON.parse(body);
  }
  return body;
};

const splitSetCookieHeader = (value: string): string[] => {
  return value
    .split(/\n|,(?=\s*[^;,\s]+=)/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const findHeaderValue = (headers: Record<string, string>, name: string): string | undefined => {
  const targetName = name.toLowerCase();
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === targetName);
  return match?.[1];
};

const ANDROID_API_CACHE_PREFIX = "splayer:android-api-cache:v3:";
const ANDROID_API_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const ANDROID_API_CACHE_DENY_PATHS = [
  "/api/netease/login",
  "/api/netease/captcha",
  "/api/netease/logout",
  "/api/netease/song/url",
  "/api/netease/song/download",
  "/api/netease/resource/like",
  "/api/netease/playlist/subscribe",
  "/api/netease/playlist/tracks",
  "/api/netease/playlist/create",
  "/api/netease/playlist/delete",
  "/api/netease/playlist/update",
  "/api/netease/song/order/update",
  "/api/unblock",
  "/api/control",
];

type AndroidApiCacheEntry = {
  time: number;
  data: unknown;
};

const getAndroidApiCacheStorage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

const normalizeAndroidApiCachePath = (path: string): string => {
  const url = new URL(path, "https://appassets.androidplatform.net");
  ["timestamp", "_", "realIP", "randomCNIP"].forEach((key) => url.searchParams.delete(key));
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
};

const isAndroidApiCacheable = (config: SPlayerAxiosRequestConfig): boolean => {
  const method = String(config.method ?? "GET").toUpperCase();
  if (method !== "GET") return false;

  const path = buildApiPath(config);
  const normalizedPath = normalizeAndroidApiCachePath(path);
  return !ANDROID_API_CACHE_DENY_PATHS.some((denyPath) => normalizedPath.startsWith(denyPath));
};

const getAndroidApiCacheKey = (config: SPlayerAxiosRequestConfig): string | null => {
  if (!isAndroidApiCacheable(config)) return null;
  return `${ANDROID_API_CACHE_PREFIX}${normalizeAndroidApiCachePath(buildApiPath(config))}`;
};

const isCacheableAndroidApiData = (data: unknown): boolean => {
  if (data === null || data === undefined) return false;
  if (typeof data !== "object") return true;

  const code = (data as { code?: unknown }).code;
  if (code === undefined || code === null) return true;
  return Number(code) === 200 || Number(code) === 0;
};

const readAndroidApiCache = <T = any>(cacheKey: string | null): T | null => {
  if (!cacheKey) return null;

  const storage = getAndroidApiCacheStorage();
  if (!storage) return null;

  try {
    const rawValue = storage.getItem(cacheKey);
    if (!rawValue) return null;

    const cache = JSON.parse(rawValue) as AndroidApiCacheEntry;
    if (!cache || Date.now() - cache.time > ANDROID_API_CACHE_MAX_AGE) {
      storage.removeItem(cacheKey);
      return null;
    }

    return cache.data as T;
  } catch {
    storage.removeItem(cacheKey);
    return null;
  }
};

const writeAndroidApiCache = (cacheKey: string | null, data: unknown): void => {
  if (!cacheKey || !isCacheableAndroidApiData(data)) return;

  const storage = getAndroidApiCacheStorage();
  if (!storage) return;

  try {
    const cache: AndroidApiCacheEntry = {
      time: Date.now(),
      data,
    };
    storage.setItem(cacheKey, JSON.stringify(cache));
  } catch {
    void 0;
  }
};

const persistAndroidResponseCookies = (headers: Record<string, string>, data: unknown): void => {
  const cookieValues: string[] = [];
  const setCookieHeader = findHeaderValue(headers, "set-cookie");
  if (setCookieHeader) cookieValues.push(...splitSetCookieHeader(setCookieHeader));

  if (typeof data === "object" && data !== null && "cookie" in data) {
    const bodyCookie = (data as { cookie?: unknown }).cookie;
    if (typeof bodyCookie === "string" && bodyCookie.trim()) {
      cookieValues.push(bodyCookie);
    }
  }

  cookieValues.forEach((cookieValue) => {
    setCookies(cookieValue.replace(/\s*HTTPOnly/gi, ""));
  });
};

const requestByAndroidBridge = async <T = any>(config: SPlayerAxiosRequestConfig): Promise<T> => {
  const bridge = getAndroidApiBridge();
  const axiosConfig = toInternalAxiosConfig(config);
  if (!bridge) {
    throw new AxiosError("Android API bridge unavailable", "ERR_NETWORK", axiosConfig);
  }

  const body =
    config.data === undefined || config.data === null
      ? ""
      : typeof config.data === "string"
        ? config.data
        : JSON.stringify(config.data);
  const headers = normalizeHeaders(config.headers);
  if (body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json; charset=UTF-8";
  }

  const rawResponse = bridge.request(
    JSON.stringify({
      method: String(config.method ?? "GET").toUpperCase(),
      path: buildApiPath(config),
      headers,
      body,
      timeout: config.timeout ?? 15000,
    }),
  );
  const responsePayload = JSON.parse(rawResponse) as {
    status: number;
    statusText: string;
    headers?: Record<string, string>;
    body?: string;
  };
  const contentType =
    responsePayload.headers?.["Content-Type"] ?? responsePayload.headers?.["content-type"] ?? "";
  const responseHeaders = responsePayload.headers ?? {};
  const responseData = parseBridgeBody(contentType, responsePayload.body ?? "");
  persistAndroidResponseCookies(responseHeaders, responseData);

  const response: AxiosResponse = {
    data: responseData,
    status: responsePayload.status,
    statusText: responsePayload.statusText,
    headers: responseHeaders,
    config: axiosConfig,
    request: undefined,
  };

  if (response.status >= 400) {
    console.warn(
      "[AndroidBridge] request failed:",
      buildApiPath(config),
      response.status,
      response.statusText,
    );
    const error = new AxiosError(response.statusText, undefined, axiosConfig, undefined, response);
    handleResponseError(error, config.silentError);
    throw error;
  }

  return response.data as T;
};

const request = async <T = any>(config: SPlayerAxiosRequestConfig): Promise<T> => {
  const preparedConfig = prepareRequestConfig(config);

  if (shouldUseAndroidLocalApi(preparedConfig)) {
    const cacheKey = getAndroidApiCacheKey(preparedConfig);
    try {
      const data = await requestByAndroidBridge<T>(preparedConfig);
      writeAndroidApiCache(cacheKey, data);
      return data;
    } catch (error) {
      const cachedData = readAndroidApiCache<T>(cacheKey);
      if (cachedData !== null) {
        console.warn("Android 本地 API 请求失败，已使用缓存", buildApiPath(preparedConfig), error);
        return cachedData;
      }
      throw error;
    }
  }

  const { data } = await server.request(preparedConfig);
  return data as T;
};

export default request;

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
import { getCookie } from "./cookie";
import { isAndroidApp, isDev } from "./env";

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

const buildApiPath = (config: AxiosRequestConfig): string => {
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

const prepareRequestConfig = (config: AxiosRequestConfig): AxiosRequestConfig => {
  const nextConfig: AxiosRequestConfig = {
    ...config,
    params: {
      ...(config.params ?? {}),
    },
  };

  const settingStore = useSettingStore();
  if (!nextConfig.params) nextConfig.params = {};

  if (!nextConfig.params.noCookie && (isLogin() || getCookie("MUSIC_U") !== null)) {
    nextConfig.params.cookie = `MUSIC_U=${getCookie("MUSIC_U")};os=pc;`;
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

const handleResponseError = (error: AxiosError) => {
  if (
    error.code === "ECONNABORTED" ||
    error.message.includes("timeout") ||
    error.message.includes("Network Error")
  ) {
    window.$message?.warning("Network request timed out, please check your connection");
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
    handleResponseError(error);
    return Promise.reject(error);
  },
);

const shouldUseAndroidLocalApi = (config: AxiosRequestConfig): boolean => {
  if (!isAndroidApp) return false;

  const currentBaseURL = String(config.baseURL ?? baseURL);
  if (currentBaseURL.startsWith("http://") || currentBaseURL.startsWith("https://")) {
    return false;
  }

  return currentBaseURL.startsWith("/api");
};

const toInternalAxiosConfig = (config: AxiosRequestConfig): InternalAxiosRequestConfig => {
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

const requestByAndroidBridge = async <T = any>(config: AxiosRequestConfig): Promise<T> => {
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
  const response: AxiosResponse = {
    data: parseBridgeBody(contentType, responsePayload.body ?? ""),
    status: responsePayload.status,
    statusText: responsePayload.statusText,
    headers: responsePayload.headers ?? {},
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
    handleResponseError(error);
    throw error;
  }

  return response.data as T;
};

const request = async <T = any>(config: AxiosRequestConfig): Promise<T> => {
  const preparedConfig = prepareRequestConfig(config);

  if (shouldUseAndroidLocalApi(preparedConfig)) {
    return requestByAndroidBridge<T>(preparedConfig);
  }

  const { data } = await server.request(preparedConfig);
  return data as T;
};

export default request;

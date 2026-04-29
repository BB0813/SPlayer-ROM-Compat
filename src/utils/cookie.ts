import Cookies from "js-cookie";

const COOKIE_ATTRIBUTE_NAMES = new Set([
  "domain",
  "expires",
  "httponly",
  "max-age",
  "path",
  "samesite",
  "secure",
]);

const COOKIE_SNAPSHOT_KEYS = [
  "MUSIC_U",
  "MUSIC_A",
  "__csrf",
  "NMTID",
  "__remember_me",
  "NTES_P_UTID",
  "WEVNSM",
];

// 获取 Cookie
export const getCookie = (key: string) => {
  return Cookies.get(key) ?? localStorage.getItem(`cookie-${key}`);
};

// 移除 Cookie
export const removeCookie = (key: string) => {
  Cookies.remove(key);
  localStorage.removeItem(`cookie-${key}`);
};

// 设置 Cookie
export const setCookies = (cookieValue: string) => {
  let decodedCookie = cookieValue;
  try {
    if (cookieValue.includes("%")) {
      decodedCookie = decodeURIComponent(cookieValue);
    }
  } catch (error) {
    console.warn("Cookie URL 解码失败，使用原始值：", error);
  }

  if (!decodedCookie.endsWith(";")) decodedCookie += ";";
  const cookies = decodedCookie.split(";");
  const date = new Date();
  date.setFullYear(date.getFullYear() + 50);
  const expires = `expires=${date.toUTCString()}`;

  cookies.forEach((cookie) => {
    const trimmedCookie = cookie.trim();
    if (!trimmedCookie) return;

    const separatorIndex = trimmedCookie.indexOf("=");
    const name =
      separatorIndex > 0 ? trimmedCookie.substring(0, separatorIndex).trim() : trimmedCookie;
    const normalizedName = name.toLowerCase();
    if (!name || COOKIE_ATTRIBUTE_NAMES.has(normalizedName)) return;

    const value = separatorIndex > 0 ? trimmedCookie.substring(separatorIndex + 1).trim() : "";
    if (!value) return;

    document.cookie = `${name}=${value}; ${expires}; path=/`;
    localStorage.setItem(`cookie-${name}`, value);
  });
};

// 收集登录 Cookie 快照
export const collectCookieSnapshot = () => {
  const cookieMap: Record<string, string> = {};

  if (typeof document !== "undefined" && document.cookie) {
    document.cookie.split(";").forEach((cookieItem) => {
      const [rawName, ...rawValue] = cookieItem.split("=");
      const name = rawName?.trim();
      const value = rawValue.join("=").trim();
      if (!name || !value || COOKIE_ATTRIBUTE_NAMES.has(name.toLowerCase())) return;
      cookieMap[name] = value;
    });
  }

  if (typeof localStorage !== "undefined") {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("cookie-")) continue;
      const cookieName = key.replace(/^cookie-/, "");
      const cookieValue = localStorage.getItem(key);
      if (cookieName && cookieValue && !COOKIE_ATTRIBUTE_NAMES.has(cookieName.toLowerCase())) {
        cookieMap[cookieName] = cookieValue;
      }
    }
  }

  COOKIE_SNAPSHOT_KEYS.forEach((key) => {
    const value = getCookie(key);
    if (value) cookieMap[key] = value;
  });

  return cookieMap;
};

// 生成接口请求 Cookie 头
export const buildCookieHeader = () => {
  const cookieMap = collectCookieSnapshot();
  if (!cookieMap.os) cookieMap.os = "pc";

  return Object.entries(cookieMap)
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `${key}=${value}`)
    .join(";");
};

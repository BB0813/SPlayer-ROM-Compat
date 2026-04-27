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

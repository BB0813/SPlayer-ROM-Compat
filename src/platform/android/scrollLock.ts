const horizontalAllowSelector = [
  ".n-slider",
  ".n-tabs",
  ".n-carousel",
  ".swiper",
  "[data-allow-horizontal-pan]",
].join(", ");

const inputAllowSelector = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[data-android-touch-free]",
].join(", ");

const touchFreeSelector = [
  ".main-player",
  ".full-player",
  ".full-player-mobile",
  ".player-lyric",
  ".lyric-page",
  ".lyric-main",
  ".lyric-scroll-container",
  ".amll-lyric-player",
  ".lyric-player",
  ".lyric-container",
  "[data-android-touch-free]",
].join(", ");

const clampTargetsSelector = [
  ".n-layout-scroll-container",
  ".n-scrollbar-container",
  ".n-scrollbar-content",
  ".router-view",
  "#app",
  "#app-layout",
  "#main",
  "#main-layout",
  "#main-content",
].join(", ");

let touchStartX = 0;
let touchStartY = 0;
let touchLastY = 0;
let activeScrollable: HTMLElement | null = null;
let clampFrame = 0;
let cleanupScrollLock: (() => void) | null = null;

const isElement = (value: EventTarget | null): value is Element => value instanceof Element;

const isInputTarget = (target: EventTarget | null) => {
  return isElement(target) && Boolean(target.closest(inputAllowSelector));
};

const isTouchFreeTarget = (target: EventTarget | null) => {
  return isElement(target) && Boolean(target.closest(touchFreeSelector));
};

const isHorizontalAllowedTarget = (target: EventTarget | null) => {
  return isElement(target) && Boolean(target.closest(horizontalAllowSelector));
};

const getScrollableRange = (element: HTMLElement) => {
  return Math.max(0, element.scrollHeight - element.clientHeight);
};

const isScrollableElement = (element: HTMLElement) => {
  if (getScrollableRange(element) <= 1) return false;
  const overflowY = window.getComputedStyle(element).overflowY;
  return overflowY !== "hidden" && overflowY !== "clip";
};

const findScrollableElement = (target: EventTarget | null): HTMLElement | null => {
  if (!isElement(target)) return null;

  let element: Element | null = target;
  while (element && element !== document.body && element !== document.documentElement) {
    if (element instanceof HTMLElement && isScrollableElement(element)) return element;
    element = element.parentElement;
  }

  const mainScroller = document.querySelector<HTMLElement>(
    "#main-content .n-layout-scroll-container",
  );
  if (mainScroller && isScrollableElement(mainScroller)) return mainScroller;
  return null;
};

const canScrollByTouchMove = (element: HTMLElement, moveY: number) => {
  const range = getScrollableRange(element);
  if (range <= 1) return false;
  const scrollTop = element.scrollTop;
  if (moveY > 0) return scrollTop > 0;
  if (moveY < 0) return scrollTop < range - 1;
  return true;
};

const clampElementScroll = (element: Element | null | undefined) => {
  if (!(element instanceof HTMLElement)) return;
  if (element.scrollLeft !== 0) element.scrollLeft = 0;
  if (element === document.body || element === document.documentElement) {
    if (element.scrollTop !== 0) element.scrollTop = 0;
  }
};

const clampAndroidViewportScroll = () => {
  clampElementScroll(document.scrollingElement);
  clampElementScroll(document.documentElement);
  clampElementScroll(document.body);
  document.querySelectorAll<HTMLElement>(clampTargetsSelector).forEach(clampElementScroll);
};

const scheduleClamp = () => {
  if (clampFrame) return;
  clampFrame = window.requestAnimationFrame(() => {
    clampFrame = 0;
    clampAndroidViewportScroll();
  });
};

const preventViewportMove = (event: TouchEvent) => {
  if (event.cancelable) event.preventDefault();
  scheduleClamp();
};

const handleTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0];
  if (!touch || event.touches.length !== 1) return;
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchLastY = touch.clientY;
  activeScrollable = findScrollableElement(event.target);
};

const handleTouchMove = (event: TouchEvent) => {
  const touch = event.touches[0];
  if (!touch || event.touches.length !== 1) {
    preventViewportMove(event);
    return;
  }

  if (isTouchFreeTarget(event.target)) {
    touchLastY = touch.clientY;
    scheduleClamp();
    return;
  }

  if (isInputTarget(event.target)) {
    touchLastY = touch.clientY;
    return;
  }

  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  const moveY = touch.clientY - touchLastY;
  const horizontalPan = Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY) * 1.05;

  touchLastY = touch.clientY;

  if (horizontalPan) {
    if (isHorizontalAllowedTarget(event.target)) {
      scheduleClamp();
      return;
    }
    preventViewportMove(event);
    return;
  }

  if (Math.abs(moveY) < 1) {
    scheduleClamp();
    return;
  }

  const scrollable = activeScrollable ?? findScrollableElement(event.target);
  if (!scrollable || !canScrollByTouchMove(scrollable, moveY)) {
    preventViewportMove(event);
    return;
  }

  scheduleClamp();
};

const handleTouchEnd = () => {
  activeScrollable = null;
  scheduleClamp();
};

const handleScroll = () => scheduleClamp();

export const setupAndroidScrollLock = () => {
  if (cleanupScrollLock) return cleanupScrollLock;

  document.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
  document.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
  document.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });
  document.addEventListener("touchcancel", handleTouchEnd, { capture: true, passive: true });
  document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
  window.addEventListener("scroll", handleScroll, { passive: true });

  cleanupScrollLock = () => {
    document.removeEventListener("touchstart", handleTouchStart, { capture: true });
    document.removeEventListener("touchmove", handleTouchMove, { capture: true });
    document.removeEventListener("touchend", handleTouchEnd, { capture: true });
    document.removeEventListener("touchcancel", handleTouchEnd, { capture: true });
    document.removeEventListener("scroll", handleScroll, { capture: true });
    window.removeEventListener("scroll", handleScroll);
    if (clampFrame) window.cancelAnimationFrame(clampFrame);
    clampFrame = 0;
    activeScrollable = null;
    cleanupScrollLock = null;
  };

  scheduleClamp();
  return cleanupScrollLock;
};

export const cleanupAndroidScrollLock = () => cleanupScrollLock?.();

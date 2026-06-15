<template>
  <div
    :class="['full-player-mobile', { 'landscape-fit': isLandscapeFit }]"
    ref="mobileStart"
    :style="mobileViewportStyle"
    data-allow-horizontal-pan
    data-android-touch-free
    :data-page-index="pageIndex"
    @pointerdown.capture="onPointerDown"
    @pointermove.capture="onPointerMove"
    @pointerup.capture="onPointerUp"
    @pointercancel.capture="onPointerCancel"
    @touchstart.capture="onTouchStart"
    @touchmove.capture="onTouchMove"
    @touchend.capture="onTouchEnd"
    @touchcancel.capture="resetTouchState"
  >
    <div class="top-bar">
      <div class="btn" role="button" tabindex="0" aria-label="收起播放器" @click.stop="statusStore.showFullPlayer = false">
        <SvgIcon name="Down" :size="26" />
      </div>
    </div>

    <div
      :class="['mobile-content', { swiping: isSwipingX }]"
      :style="{ transform: contentTransform }"
      @click.stop
    >
      <div class="page info-page">
        <div class="cover-section">
          <PlayerCover :no-lyric="true" />
        </div>

        <div class="info-group">
          <div class="song-info-bar">
            <div class="info-section">
              <PlayerData :center="false" :light="false" class="mobile-data" />
            </div>
            <div class="info-actions">
              <div
                v-if="musicStore.playSong.type !== 'radio'"
                class="action-btn"
                role="button"
                tabindex="0"
                :aria-label="isCurrentSongLiked ? '取消收藏' : '收藏'"
                @click="
                  haptic.medium();
                  toLikeSong(musicStore.playSong, !isCurrentSongLiked)
                "
              >
                <SvgIcon
                  :name="
                    isCurrentSongLiked ? 'Favorite' : 'FavoriteBorder'
                  "
                  :size="26"
                  :class="{ liked: isCurrentSongLiked }"
                />
              </div>

              <div
                class="action-btn"
                role="button"
                tabindex="0"
                aria-label="添加到歌单"
                @click.stop="openPlaylistAdd([musicStore.playSong], !!musicStore.playSong.path)"
              >
                <SvgIcon name="AddList" :size="26" />
              </div>
            </div>
          </div>

          <div class="progress-section">
            <span class="time" role="button" tabindex="0" aria-label="切换时间格式" @click="toggleTimeFormat">{{ timeDisplay[0] }}</span>
            <PlayerSlider class="player" :show-tooltip="false" />
            <span class="time" role="button" tabindex="0" aria-label="切换时间格式" @click="toggleTimeFormat">{{ timeDisplay[1] }}</span>
          </div>

          <div class="control-section">
            <template v-if="musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode">
              <div class="mode-btn" role="button" tabindex="0" :aria-label="statusStore.shuffleMode === 'off' ? '开启随机播放' : '关闭随机播放'" @click.stop="haptic.light(); player.toggleShuffle()">
                <SvgIcon
                  :name="statusStore.shuffleIcon"
                  :size="24"
                  :depth="statusStore.shuffleMode === 'off' ? 3 : 1"
                />
              </div>
            </template>
            <div v-else class="placeholder"></div>

            <div class="ctrl-btn" role="button" tabindex="0" aria-label="上一首" v-debounce="() => { haptic.light(); player.nextOrPrev('prev') }">
              <SvgIcon name="SkipPrev" :size="36" />
            </div>

            <n-button
              :loading="statusStore.playLoading"
              class="play-btn"
              type="primary"
              strong
              secondary
              circle
              :aria-label="statusStore.playStatus ? '暂停' : '播放'"
              @click.stop="haptic.playPause(); player.playOrPause()"
            >
              <template #icon>
                <Transition name="fade" mode="out-in">
                  <SvgIcon
                    :key="statusStore.playStatus ? 'Pause' : 'Play'"
                    :name="statusStore.playStatus ? 'Pause' : 'Play'"
                    :size="40"
                  />
                </Transition>
              </template>
            </n-button>

            <div class="ctrl-btn" role="button" tabindex="0" aria-label="下一首" v-debounce="() => { haptic.light(); player.nextOrPrev('next') }">
              <SvgIcon name="SkipNext" :size="36" />
            </div>

            <template v-if="musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode">
              <div class="mode-btn" role="button" tabindex="0" :aria-label="statusStore.repeatMode === 'off' ? '开启循环播放' : '关闭循环播放'" @click.stop="haptic.light(); player.toggleRepeat()">
                <SvgIcon
                  :name="statusStore.repeatIcon"
                  :size="24"
                  :depth="statusStore.repeatMode === 'off' ? 3 : 1"
                />
              </div>
            </template>
            <div v-else class="placeholder"></div>
          </div>
        </div>
      </div>

      <div class="page lyric-page">
        <div class="lyric-header">
          <s-image :src="musicStore.getSongCover('s')" class="lyric-cover" />
          <div class="lyric-info">
            <div class="name text-hidden">
              {{
                settingStore.hideBracketedContent
                  ? removeBrackets(musicStore.playSong.name)
                  : musicStore.playSong.name
              }}
            </div>
            <div class="artist text-hidden">{{ artistName }}</div>
          </div>

          <div
            v-if="musicStore.playSong.type !== 'radio'"
            class="action-btn"
            @click.stop="
              haptic.medium();
              toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id))
            "
          >
            <SvgIcon
              :name="dataStore.isLikeSong(musicStore.playSong.id) ? 'Favorite' : 'FavoriteBorder'"
              :size="24"
              :class="{ liked: dataStore.isLikeSong(musicStore.playSong.id) }"
            />
          </div>
        </div>
        <div class="lyric-main">
          <PlayerLyric />
        </div>
      </div>
    </div>

    <n-text v-if="canOpenLyricPage" class="page-tip" depth="3">
      {{ pageTipText }}
    </n-text>

    <Transition name="fade">
      <div class="pagination" v-if="canOpenLyricPage">
        <div
          v-for="i in 2"
          :key="i"
          :class="['dot', { active: pageIndex === i - 1 }]"
          @click="pageIndex = i - 1"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useMusicStore, useStatusStore, useDataStore, useSettingStore } from "@/stores";
import { usePlayerController } from "@/core/player/PlayerController";
import { useTimeFormat } from "@/composables/useTimeFormat";
import { useHaptic } from "@/composables/useHaptic";
import { toLikeSong } from "@/utils/auth";
import { openPlaylistAdd } from "@/utils/modal";
import { removeBrackets } from "@/utils/format";

const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();
const dataStore = useDataStore();
const player = usePlayerController();
const { timeDisplay, toggleTimeFormat } = useTimeFormat();
const haptic = useHaptic();

const mobileStart = ref<HTMLElement | null>(null);
const pageIndex = ref(0);

const viewportSize = ref({ width: 0, height: 0 });

const readViewportSize = () => {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  const visualViewport = window.visualViewport;
  return {
    width: Math.round(visualViewport?.width || window.innerWidth || 0),
    height: Math.round(visualViewport?.height || window.innerHeight || 0),
  };
};

const updateViewportSize = () => {
  viewportSize.value = readViewportSize();
};

const isLandscapeFit = computed(() => {
  const { width, height } = viewportSize.value;
  return width > 0 && height > 0 && width > height;
});

const mobileViewportStyle = computed<Record<string, string>>(() => {
  const height = viewportSize.value.height;
  return {
    "--player-mobile-viewport-height": height > 0 ? `${height}px` : "100dvh",
  };
});

const isCurrentSongLiked = computed(() => dataStore.isLikeSong(musicStore.playSong.id));
const canOpenLyricPage = computed(() => musicStore.playSong.type !== "radio");
const pageTipText = computed(() =>
  pageIndex.value === 0
    ? "\u5de6\u6ed1\u67e5\u770b\u6b4c\u8bcd"
    : "\u53f3\u6ed1\u8fd4\u56de\u64ad\u653e\u9875",
);

const artistName = computed(() => {
  const artists = musicStore.playSong.artists;
  if (Array.isArray(artists)) {
    return artists.map((artist) => artist.name).join(" / ");
  }
  return artists || "\u672a\u77e5\u827a\u672f\u5bb6";
});

watch(canOpenLyricPage, (value) => {
  if (!value) {
    pageIndex.value = 0;
  }
});

onMounted(() => {
  updateViewportSize();
  window.addEventListener("resize", updateViewportSize, { passive: true });
  window.addEventListener("orientationchange", updateViewportSize, { passive: true });
  window.visualViewport?.addEventListener("resize", updateViewportSize, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewportSize);
  window.removeEventListener("orientationchange", updateViewportSize);
  window.visualViewport?.removeEventListener("resize", updateViewportSize);
});

type SwipeAxis = "x" | "y";

const axisLock = ref<SwipeAxis | null>(null);
const isSwiping = ref(false);
const lengthX = ref(0);

const gestureIgnoreSelector = [
  ".top-bar",
  ".progress-section",
  ".control-section",
  ".info-actions",
  ".action-btn",
  ".mode-btn",
  ".ctrl-btn",
  ".play-btn",
  ".pagination",
  ".n-slider",
  ".n-button",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[data-player-gesture-ignore]",
].join(", ");

const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;

let gestureStartX = 0;
let gestureStartY = 0;
let gestureStartedAt = 0;
let gestureLastDeltaX = 0;
let activePointerId: number | null = null;
let activePointerTarget: HTMLElement | null = null;
let pointerCaptured = false;
let touchFallbackActive = false;

const isElement = (target: EventTarget | null): target is Element => target instanceof Element;

const isGestureIgnoredTarget = (target: EventTarget | null) => {
  return isElement(target) && Boolean(target.closest(gestureIgnoreSelector));
};

const getViewportWidth = () => {
  return Math.max(320, window.visualViewport?.width || window.innerWidth || 360);
};

const getSwipeThreshold = () => {
  return Math.min(120, Math.max(56, getViewportWidth() * 0.12));
};

const getFastSwipeThreshold = () => {
  return Math.min(72, Math.max(36, getViewportWidth() * 0.06));
};

const getLimitedSwipeOffset = (deltaX: number) => {
  const limit = Math.min(240, getViewportWidth() * 0.45);
  return Math.max(-limit, Math.min(limit, deltaX));
};

const stopGestureEvent = (event: Event) => {
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
};

const resetTouchState = () => {
  isSwiping.value = false;
  axisLock.value = null;
  lengthX.value = 0;
  gestureLastDeltaX = 0;
  activePointerId = null;
  activePointerTarget = null;
  pointerCaptured = false;
  touchFallbackActive = false;
};

const beginSwipe = (clientX: number, clientY: number) => {
  gestureStartX = clientX;
  gestureStartY = clientY;
  gestureStartedAt = performance.now();
  gestureLastDeltaX = 0;
  axisLock.value = null;
  isSwiping.value = true;
  lengthX.value = 0;
};

const resolveSwipeAxis = (deltaX: number, deltaY: number): SwipeAxis | null => {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX < 8 && absY < 8) return null;
  if (absX > absY * 1.12) return "x";
  if (absY > absX * 1.12) return "y";
  return null;
};

const updateSwipe = (clientX: number, clientY: number): SwipeAxis | null => {
  if (!isSwiping.value) return null;

  const deltaX = gestureStartX - clientX;
  const deltaY = gestureStartY - clientY;

  if (axisLock.value === null) {
    axisLock.value = resolveSwipeAxis(deltaX, deltaY);
    if (axisLock.value === "y") {
      lengthX.value = 0;
    }
  }

  if (axisLock.value !== "x") return axisLock.value;

  gestureLastDeltaX = deltaX;
  lengthX.value = getLimitedSwipeOffset(deltaX);
  return "x";
};

const finishSwipe = (clientX: number) => {
  if (axisLock.value === "x") {
    const finalLengthX = gestureStartX - clientX || gestureLastDeltaX;
    const elapsed = Math.max(1, performance.now() - gestureStartedAt);
    const velocity = Math.abs(finalLengthX) / elapsed;
    const shouldSwitchPage =
      Math.abs(finalLengthX) > getSwipeThreshold() ||
      (Math.abs(finalLengthX) > getFastSwipeThreshold() && velocity > 0.45);

    if (shouldSwitchPage && finalLengthX > 0 && pageIndex.value === 0) {
      pageIndex.value = 1;
      haptic.swipe();
    } else if (shouldSwitchPage && finalLengthX < 0 && pageIndex.value === 1) {
      pageIndex.value = 0;
      haptic.swipe();
    }
  }

  resetTouchState();
};

const capturePointer = (event: PointerEvent) => {
  if (pointerCaptured || activePointerTarget === null) return;

  try {
    activePointerTarget.setPointerCapture(event.pointerId);
    pointerCaptured = true;
  } catch {
    pointerCaptured = false;
  }
};

const releasePointer = (target: HTMLElement | null, pointerId: number | null) => {
  if (!target || pointerId === null) return;

  try {
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  } catch {
    pointerCaptured = false;
  }
};

const onPointerDown = (event: PointerEvent) => {
  if (!canOpenLyricPage.value || !event.isPrimary || isGestureIgnoredTarget(event.target)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  activePointerId = event.pointerId;
  activePointerTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  beginSwipe(event.clientX, event.clientY);
};

const onPointerMove = (event: PointerEvent) => {
  if (!canOpenLyricPage.value || activePointerId !== event.pointerId) return;

  const axis = updateSwipe(event.clientX, event.clientY);
  if (axis !== "x") return;

  capturePointer(event);
  stopGestureEvent(event);
};

const onPointerUp = (event: PointerEvent) => {
  if (activePointerId !== event.pointerId) return;

  const shouldStop = axisLock.value === "x";
  const target = activePointerTarget;
  const pointerId = activePointerId;

  finishSwipe(event.clientX);
  releasePointer(target, pointerId);

  if (shouldStop) stopGestureEvent(event);
};

const onPointerCancel = (event: PointerEvent) => {
  if (activePointerId !== event.pointerId) return;

  const target = activePointerTarget;
  const pointerId = activePointerId;
  resetTouchState();
  releasePointer(target, pointerId);
};

const shouldUseTouchFallback = () => !supportsPointerEvents;

const onTouchStart = (event: TouchEvent) => {
  if (!shouldUseTouchFallback() || !canOpenLyricPage.value) return;
  if (event.touches.length !== 1 || isGestureIgnoredTarget(event.target)) return;

  const touch = event.touches[0];
  touchFallbackActive = true;
  beginSwipe(touch.clientX, touch.clientY);
};

const onTouchMove = (event: TouchEvent) => {
  if (!shouldUseTouchFallback() || !touchFallbackActive || event.touches.length !== 1) return;

  const touch = event.touches[0];
  const axis = updateSwipe(touch.clientX, touch.clientY);
  if (axis !== "x") return;

  stopGestureEvent(event);
};

const onTouchEnd = (event: TouchEvent) => {
  if (!shouldUseTouchFallback()) return;
  if (!touchFallbackActive || event.changedTouches.length === 0) {
    resetTouchState();
    return;
  }

  const shouldStop = axisLock.value === "x";
  finishSwipe(event.changedTouches[0].clientX);
  if (shouldStop) stopGestureEvent(event);
};

const isSwipingX = computed(() => isSwiping.value && axisLock.value === "x");

const contentTransform = computed(() => {
  const baseOffset = pageIndex.value * 50;

  if (!isSwipingX.value || !canOpenLyricPage.value) {
    return `translateX(-${baseOffset}%)`;
  }

  let pixelOffset = lengthX.value;
  if (pageIndex.value === 0 && pixelOffset < 0) {
    pixelOffset *= 0.3;
  }
  if (pageIndex.value === 1 && pixelOffset > 0) {
    pixelOffset *= 0.3;
  }

  return `translateX(calc(-${baseOffset}% - ${pixelOffset}px))`;
});
</script>

<style lang="scss" scoped>
.full-player-mobile {
  width: 100%;
  touch-action: pan-y;
  overscroll-behavior: none;
  height: 100dvh;
  min-height: 100svh;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  .top-bar {
    position: absolute;
    width: 100%;
    height: calc(60px + env(safe-area-inset-top, 0px));
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: env(safe-area-inset-top, 0px) 24px 0;
    z-index: 10;
    .btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 0.2s;
      flex-shrink: 0;
      &:active {
        background-color: rgba(255, 255, 255, 0.1);
      }
      .n-icon {
        color: rgb(var(--main-cover-color));
        opacity: 0.8;
      }
    }
  }
  .mobile-content {
    flex: 1;
    display: flex;
    width: 200%;
    height: 100%;
    transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
    will-change: transform;
    &.swiping {
      transition: none;
    }
    .page {
      width: 50%;
      height: 100%;
      flex-shrink: 0;
      position: relative;
      overflow-x: hidden;
      overscroll-behavior: none;
      touch-action: pan-y;
    }
    .info-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 24px 0;
      overflow: hidden;
      overscroll-behavior: none;
      touch-action: none;
      .cover-section {
        flex: 1;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: 36px;
        margin-bottom: 12px;
        :deep(.player-cover) {
          width: min(78vw, 42svh, 360px);
          &.record {
            width: min(72vw, 38svh, 340px);
            .cover-img {
              width: min(72vw, 38svh, 340px);
              height: min(72vw, 38svh, 340px);
              min-width: min(72vw, 38svh, 340px);
            }
            .pointer {
              width: min(18vw, 9.5svh, 84px);
              top: max(-86px, -9svh);
            }
            @media (max-width: 512px) {
              width: min(76vw, 36svh, 320px);
              .cover-img {
                width: min(76vw, 36svh, 320px);
                height: min(76vw, 36svh, 320px);
                min-width: min(76vw, 36svh, 320px);
              }
            }
          }
        }
      }
      .info-group {
        width: 100%;
        max-height: 42svh;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        .song-info-bar {
          width: 100%;
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          .info-section {
            flex: 1;
            min-width: 0;
            margin-right: 16px;
            :deep(.mobile-data) {
              width: 100%;
              max-width: 100%;
              .name {
                margin-left: 0;
                font-size: max(18px, calc(20px * var(--android-ui-scale, 1)));
              }
              .alia,
              .artist {
                font-size: max(13px, calc(14px * var(--android-ui-scale, 1)));
              }
            }
          }
          .info-actions {
            display: flex;
            padding-top: 12px;
            gap: 16px;
            flex-shrink: 0;
            .action-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 40px;
              height: 40px;
              border-radius: 50%;
              cursor: pointer;
              transition: background-color 0.2s;
              &:active {
                background-color: rgba(255, 255, 255, 0.1);
              }
              .n-icon {
                color: rgb(var(--main-cover-color));
                opacity: 0.6;
                transition:
                  opacity 0.2s,
                  transform 0.2s;
                &.liked {
                  fill: rgb(var(--main-cover-color));
                  opacity: 1;
                }
              }
            }
          }
        }
        .progress-section {
          display: flex;
          align-items: center;
          width: 100%;
          margin: 0 0 4px;
          .time {
            min-width: 42px;
            opacity: 0.6;
            color: rgb(var(--main-cover-color));
            font-variant-numeric: tabular-nums;
            font-size: 12px;
            line-height: 1;
            &:first-child {
              text-align: left;
            }
            &:last-child {
              text-align: right;
            }
          }
          .n-slider {
            flex: 1;
            min-width: 0;
            margin: 0 8px;
          }
        }
        .control-section {
          width: 100%;
          max-width: 400px;
          margin: 0 auto 100px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px;
          .placeholder {
            width: 24px;
          }
          .mode-btn {
            opacity: 0.8;
            cursor: pointer;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            .n-icon {
              color: rgb(var(--main-cover-color));
            }
          }
          .ctrl-btn {
            cursor: pointer;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            .n-icon {
              color: rgb(var(--main-cover-color));
            }
          }
          .play-btn {
            width: 60px;
            height: 60px;
            min-height: 60px;
            font-size: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s;
            background-color: rgba(var(--main-cover-color), 0.2);
            color: rgb(var(--main-cover-color));
            &.n-button--primary-type {
              --n-color: rgba(var(--main-cover-color), 0.14);
              --n-color-hover: rgba(var(--main-cover-color), 0.2);
              --n-color-focus: rgba(var(--main-cover-color), 0.2);
              --n-color-pressed: rgba(var(--main-cover-color), 0.12);
            }
            &:active {
              transform: scale(0.95);
            }
          }
        }
      }
    }
    .lyric-page {
      padding: env(safe-area-inset-top, 0px) 24px 0;
      padding-top: calc(60px + env(safe-area-inset-top, 0px));
      display: flex;
      flex-direction: column;
      .lyric-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 20px;
        flex-shrink: 0;
        padding: 10px 20px 0;
        .lyric-cover {
          width: 50px;
          height: 50px;
          flex-shrink: 0;
          :deep(img) {
            border-radius: 6px;
            width: 100%;
            height: 100%;
          }
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .lyric-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          .name {
            font-size: max(19px, calc(20px * var(--android-ui-scale, 1)));
            font-weight: bold;
            margin-bottom: 2px;
          }
          .artist {
            font-size: max(14px, calc(14px * var(--android-ui-scale, 1)));
            opacity: 0.6;
          }
        }
        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          transition: background-color 0.2s;
          margin-left: 4px;
          &:active {
            background-color: rgba(255, 255, 255, 0.1);
          }
          .n-icon {
            color: rgb(var(--main-cover-color));
            opacity: 0.6;
            transition: all 0.2s;
            &.liked {
              fill: rgb(var(--main-cover-color));
              opacity: 1;
            }
          }
        }
      }
      .lyric-main {
        flex: 1;
        min-height: 0;
        position: relative;
        touch-action: pan-y;
        overscroll-behavior: contain;
      }
    }
  }
  .page-tip {
    position: absolute;
    left: 50%;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 3;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    color: rgba(var(--main-cover-color), 0.62);
    background-color: rgba(var(--main-cover-color), 0.08);
    pointer-events: none;
  }

  .pagination {
    position: absolute;
    bottom: calc(6px + env(safe-area-inset-bottom, 0px));
    left: 0;
    width: 100%;
    display: flex;
    justify-content: center;
    gap: 8px;
    pointer-events: none;
    .dot {
      pointer-events: auto;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.2);
      transition: all 0.3s;
      &.active {
        background-color: rgb(var(--main-cover-color));
        width: 16px;
        border-radius: 4px;
        opacity: 0.8;
      }
    }
  }
}

@media (max-height: 700px) {
  .full-player-mobile {
    .mobile-content {
      .info-page {
        .cover-section {
          margin-top: 34px;
          margin-bottom: 10px;
        }

        .info-group {
          .song-info-bar {
            margin-bottom: 10px;
          }

          .progress-section {
            margin-bottom: 16px;
          }

          .control-section {
            margin-bottom: 14px;
          }
        }
      }
    }
  }
}

@media (max-height: 620px) {
  .full-player-mobile {
    .mobile-content {
      .info-page {
        .cover-section {
          margin-top: 24px;
          margin-bottom: 8px;

          :deep(.player-cover.record) {
            width: min(68vw, 32svh, 280px);

            .cover-img {
              width: min(68vw, 32svh, 280px);
              height: min(68vw, 32svh, 280px);
              min-width: min(68vw, 32svh, 280px);
            }
          }
        }
      }
    }
  }
}
</style>

<style lang="scss" scoped>
@media (max-width: 768px) {
  .full-player-mobile {
    .top-bar {
      height: calc(56px + env(safe-area-inset-top, 0px));
      padding: env(safe-area-inset-top, 0px) 16px 0;
    }

    .mobile-content {
      .info-page {
        padding: 0 16px calc(24px + env(safe-area-inset-bottom, 0px)) 16px;

        .cover-section {
          margin-top: 48px;
          margin-bottom: 14px;
        }

        .info-group {
          .song-info-bar {
            margin-bottom: 14px;

            .info-section {
              margin-right: 12px;
            }

            .info-actions {
              padding-top: 12px;
              gap: 8px;
            }
          }

          .progress-section {
            margin: 0 0 24px;
          }

          .control-section {
            margin: 0 auto 22px;
            padding: 0 6px;
          }
        }
      }

      .lyric-page {
        padding: env(safe-area-inset-top, 0px) 16px 0;
        padding-top: calc(56px + env(safe-area-inset-top, 0px));

        .lyric-header {
          gap: 10px;
          margin-bottom: 18px;
          padding: 8px 0 0;
        }
      }
    }

    .page-tip {
      bottom: calc(34px + env(safe-area-inset-bottom, 0px));
    }

    .pagination {
      bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    }
  }
}

@media (max-width: 420px) {
  .full-player-mobile {
    .top-bar {
      height: calc(52px + env(safe-area-inset-top, 0px));
      padding: env(safe-area-inset-top, 0px) 12px 0;
    }

    .mobile-content {
      .info-page {
        padding: 0 12px calc(16px + env(safe-area-inset-bottom, 0px)) 12px;

        .cover-section {
          margin-top: 44px;
          margin-bottom: 12px;
        }

        .info-group {
          .song-info-bar {
            margin-bottom: 12px;

            .info-section {
              margin-right: 10px;
            }

            .info-actions {
              padding-top: 10px;
              gap: 6px;
            }
          }

          .progress-section {
            margin: 0 0 22px;
          }

          .control-section {
            margin: 0 auto 20px;
            padding: 0 4px;

            .ctrl-btn {
              width: 46px;
              height: 46px;
            }

            .play-btn {
              width: 56px;
              height: 56px;
              min-height: 56px;
            }
          }
        }
      }

      .lyric-page {
        padding: env(safe-area-inset-top, 0px) 12px 0;
        padding-top: calc(56px + env(safe-area-inset-top, 0px));

        .lyric-header {
          gap: 10px;
          margin-bottom: 16px;
          padding: 8px 0 0;
        }
      }
    }
  }
}
</style>

<style lang="scss" scoped>
:global(.android-tablet-layout) {
  .full-player-mobile {
    .mobile-content {
      .info-page {
        padding-left: max(32px, 7vw);
        padding-right: max(32px, 7vw);

        .cover-section {
          :deep(.player-cover) {
            width: min(54vw, 42svh, 460px);
          }
        }

        .info-group {
          max-width: 640px;
        }
      }

      .lyric-page {
        padding-left: max(40px, 8vw);
        padding-right: max(40px, 8vw);
      }
    }
  }
}
</style>

<style lang="scss" scoped>
:global(.android-app.android-landscape),
:global(.android-app.android-tablet-landscape) {
  .full-player-mobile {
    .top-bar {
      height: calc(52px + env(safe-area-inset-top, 0px));
      padding: env(safe-area-inset-top, 0px) 28px 0;
    }

    .mobile-content {
      .info-page {
        display: grid;
        grid-template-columns: minmax(280px, 42%) minmax(0, 1fr);
        grid-template-rows: 1fr;
        align-items: center;
        column-gap: clamp(28px, 5vw, 72px);
        padding: calc(48px + env(safe-area-inset-top, 0px)) clamp(34px, 6vw, 86px)
          calc(52px + env(safe-area-inset-bottom, 0px));
        overflow: hidden;

        .cover-section {
          grid-column: 1;
          grid-row: 1;
          height: 100%;
          margin: 0;
          align-items: center;
          justify-content: center;

          :deep(.player-cover) {
            width: min(34vw, 58svh, 360px);

            &.record {
              width: min(32vw, 54svh, 340px);

              .cover-img {
                width: min(32vw, 54svh, 340px);
                height: min(32vw, 54svh, 340px);
                min-width: min(32vw, 54svh, 340px);
              }

              .pointer {
                width: min(10vw, 14svh, 82px);
                top: max(-80px, -12svh);
              }
            }
          }
        }

        .info-group {
          grid-column: 2;
          grid-row: 1;
          width: min(100%, 660px);
          max-width: 660px;
          align-self: center;
          justify-self: stretch;

          .song-info-bar {
            margin-bottom: clamp(14px, 2.4svh, 22px);

            .info-actions {
              padding-top: 4px;
            }
          }

          .progress-section {
            margin-bottom: clamp(18px, 4svh, 30px);
          }

          .control-section {
            max-width: min(440px, 100%);
            margin-bottom: 0;
          }
        }
      }
    }

    .page-tip {
      bottom: calc(58px + env(safe-area-inset-bottom, 0px));
    }

    .pagination {
      bottom: calc(32px + env(safe-area-inset-bottom, 0px));
    }
  }
}

:global(.android-app:not(.android-landscape):not(.android-tablet-landscape)) {
  .full-player-mobile {
    .page-tip {
      bottom: calc(108px + env(safe-area-inset-bottom, 0px));
      font-size: 12px;
      background-color: rgba(var(--main-cover-color), 0.1);
      backdrop-filter: blur(10px);
    }

    .pagination {
      bottom: calc(82px + env(safe-area-inset-bottom, 0px));
    }
  }
}

.full-player-mobile.landscape-fit {
  .top-bar {
    height: calc(48px + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) 24px 0;
  }

  .mobile-content {
    .info-page {
      display: grid;
      grid-template-columns: minmax(220px, 40%) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      align-items: center;
      column-gap: clamp(22px, 4vw, 58px);
      padding: calc(44px + env(safe-area-inset-top, 0px)) clamp(28px, 5vw, 72px)
        calc(34px + env(safe-area-inset-bottom, 0px));
      overflow: hidden;

      .cover-section {
        grid-column: 1;
        grid-row: 1;
        width: 100%;
        height: 100%;
        min-height: 0;
        margin: 0;
        align-items: center;
        justify-content: center;

        :deep(.player-cover) {
          width: min(30vw, 48svh, 320px);

          &.record {
            width: min(28vw, 46svh, 300px);

            .cover-img {
              width: min(28vw, 46svh, 300px);
              height: min(28vw, 46svh, 300px);
              min-width: min(28vw, 46svh, 300px);
            }

            .pointer {
              width: min(9vw, 12svh, 72px);
              top: max(-72px, -11svh);
            }
          }
        }
      }

      .info-group {
        grid-column: 2;
        grid-row: 1;
        width: min(100%, 640px);
        max-width: 640px;
        max-height: none;
        align-self: center;
        justify-self: stretch;
        gap: 0;

        .song-info-bar {
          margin-bottom: clamp(10px, 2svh, 18px);

          .info-actions {
            padding-top: 2px;
          }
        }

        .progress-section {
          margin-bottom: clamp(12px, 3svh, 22px);
        }

        .control-section {
          max-width: min(420px, 100%);
          margin-bottom: 0;
          padding-inline: 4px;

          .mode-btn {
            width: 36px;
            height: 36px;
          }

          .ctrl-btn {
            width: 44px;
            height: 44px;
          }

          .play-btn {
            width: 54px;
            height: 54px;
            min-height: 54px;
          }
        }
      }
    }
  }

  .page-tip {
    bottom: calc(52px + env(safe-area-inset-bottom, 0px));
  }

  .pagination {
    bottom: calc(28px + env(safe-area-inset-bottom, 0px));
  }
}

@media (orientation: portrait), (max-aspect-ratio: 1/1) {
  .full-player-mobile:not(.landscape-fit) {
    .mobile-content {
      .info-page {
        justify-content: flex-start;
        padding: 0 clamp(20px, 5vw, 28px) calc(22px + env(safe-area-inset-bottom, 0px));

        .cover-section {
          flex: 0 0 auto;
          min-height: 0;
          margin-top: clamp(50px, 7svh, 68px);
          margin-bottom: clamp(18px, 3svh, 28px);

          :deep(.player-cover) {
            width: min(66vw, 34svh, 300px);

            &.record {
              width: min(62vw, 32svh, 288px);

              .cover-img {
                width: min(62vw, 32svh, 288px);
                height: min(62vw, 32svh, 288px);
                min-width: min(62vw, 32svh, 288px);
              }

              .pointer {
                width: min(15vw, 8svh, 68px);
                top: max(-70px, -8svh);
              }
            }
          }
        }

        .info-group {
          max-height: none;

          .song-info-bar {
            margin-bottom: clamp(12px, 2.4svh, 18px);

            .info-actions {
              padding-top: clamp(8px, 1.8svh, 14px);
              gap: 14px;
            }
          }

          .progress-section {
            margin-bottom: clamp(12px, 2.4svh, 18px);
          }

          .control-section {
            max-width: min(390px, 100%);
            margin: clamp(8px, 2svh, 16px) auto 0;
          }
        }
      }
    }

    .page-tip {
      bottom: calc(86px + env(safe-area-inset-bottom, 0px));
    }

    .pagination {
      bottom: calc(62px + env(safe-area-inset-bottom, 0px));
    }
  }
}

@media (max-height: 700px) and (orientation: portrait) {
  .full-player-mobile:not(.landscape-fit) {
    .mobile-content {
      .info-page {
        .cover-section {
          margin-top: 44px;
          margin-bottom: 14px;

          :deep(.player-cover.record) {
            width: min(56vw, 29svh, 248px);

            .cover-img {
              width: min(56vw, 29svh, 248px);
              height: min(56vw, 29svh, 248px);
              min-width: min(56vw, 29svh, 248px);
            }
          }
        }

        .info-group {
          .song-info-bar,
          .progress-section {
            margin-bottom: 10px;
          }

          .control-section {
            .mode-btn {
              width: 36px;
              height: 36px;
            }

            .ctrl-btn {
              width: 44px;
              height: 44px;
            }

            .play-btn {
              width: 54px;
              height: 54px;
              min-height: 54px;
            }
          }
        }
      }
    }
  }
}

@media (orientation: landscape) {
  :global(.android-app) {
    .full-player-mobile {
      .top-bar {
        height: calc(48px + env(safe-area-inset-top, 0px));
        padding: env(safe-area-inset-top, 0px) 24px 0;
      }

      .mobile-content {
        .info-page {
          display: grid;
          grid-template-columns: minmax(220px, 40%) minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr);
          align-items: center;
          column-gap: clamp(22px, 4vw, 58px);
          padding: calc(44px + env(safe-area-inset-top, 0px)) clamp(28px, 5vw, 72px)
            calc(34px + env(safe-area-inset-bottom, 0px));
          overflow: hidden;

          .cover-section {
            grid-column: 1;
            grid-row: 1;
            width: 100%;
            height: 100%;
            min-height: 0;
            margin: 0;
            align-items: center;
            justify-content: center;

            :deep(.player-cover) {
              width: min(30vw, 48svh, 320px);

              &.record {
                width: min(28vw, 46svh, 300px);

                .cover-img {
                  width: min(28vw, 46svh, 300px);
                  height: min(28vw, 46svh, 300px);
                  min-width: min(28vw, 46svh, 300px);
                }

                .pointer {
                  width: min(9vw, 12svh, 72px);
                  top: max(-72px, -11svh);
                }
              }
            }
          }

          .info-group {
            grid-column: 2;
            grid-row: 1;
            width: min(100%, 640px);
            max-width: 640px;
            max-height: none;
            align-self: center;
            justify-self: stretch;
            gap: 0;

            .song-info-bar {
              margin-bottom: clamp(10px, 2svh, 18px);

              .info-actions {
                padding-top: 2px;
              }
            }

            .progress-section {
              margin-bottom: clamp(12px, 3svh, 22px);
            }

            .control-section {
              max-width: min(420px, 100%);
              margin-bottom: 0;
              padding-inline: 4px;

              .mode-btn {
                width: 36px;
                height: 36px;
              }

              .ctrl-btn {
                width: 44px;
                height: 44px;
              }

              .play-btn {
                width: 54px;
                height: 54px;
                min-height: 54px;
              }
            }
          }
        }
      }

      .page-tip {
        bottom: calc(52px + env(safe-area-inset-bottom, 0px));
      }

      .pagination {
        bottom: calc(28px + env(safe-area-inset-bottom, 0px));
      }
    }
  }
}
@media (max-height: 680px) and (orientation: landscape) {
  :global(.android-app.android-landscape),
  :global(.android-app.android-tablet-landscape) {
    .full-player-mobile {
      .mobile-content {
        .info-page {
          padding-top: calc(42px + env(safe-area-inset-top, 0px));
          padding-bottom: calc(42px + env(safe-area-inset-bottom, 0px));
          column-gap: clamp(22px, 4vw, 56px);

          .cover-section {
            :deep(.player-cover.record) {
              width: min(30vw, 50svh, 300px);

              .cover-img {
                width: min(30vw, 50svh, 300px);
                height: min(30vw, 50svh, 300px);
                min-width: min(30vw, 50svh, 300px);
              }
            }
          }

          .info-group {
            .song-info-bar {
              margin-bottom: 12px;
            }

            .progress-section {
              margin-bottom: 16px;
            }
          }
        }
      }
    }
  }
}
</style>

<style lang="scss" scoped>
@media (orientation: portrait), (max-aspect-ratio: 1/1) {
  .full-player-mobile:not(.landscape-fit) {
    height: var(--player-mobile-viewport-height, 100dvh);
    min-height: var(--player-mobile-viewport-height, 100svh);
    max-height: var(--player-mobile-viewport-height, 100dvh);

    .mobile-content {
      height: var(--player-mobile-viewport-height, 100dvh);
      min-height: 0;

      .info-page {
        --player-mobile-top-space: clamp(36px, 5.2svh, 50px);
        --player-mobile-cover-size: min(70vw, 34svh, 318px);
        --player-mobile-pointer-size: min(15vw, 7.4svh, 68px);
        --player-mobile-section-gap: clamp(8px, 1.7svh, 14px);
        --player-mobile-bottom-space: calc(48px + env(safe-area-inset-bottom, 0px));
        display: flex;
        height: var(--player-mobile-viewport-height, 100dvh);
        min-height: 0;
        padding: var(--player-mobile-top-space) clamp(18px, 5vw, 26px)
          var(--player-mobile-bottom-space);
        box-sizing: border-box;
        justify-content: flex-start;
        overflow: hidden;

        .cover-section {
          flex: 0 0 auto;
          min-height: 0;
          margin: 0 0 var(--player-mobile-section-gap);

          :deep(.player-cover) {
            width: var(--player-mobile-cover-size);

            &.record {
              width: var(--player-mobile-cover-size);

              .cover-img {
                width: var(--player-mobile-cover-size);
                height: var(--player-mobile-cover-size);
                min-width: var(--player-mobile-cover-size);
              }

              .pointer {
                width: var(--player-mobile-pointer-size);
                top: calc(var(--player-mobile-pointer-size) * -1.03);
              }
            }
          }
        }

        .info-group {
          flex: 0 1 auto;
          min-height: 0;
          max-height: none;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;

          .song-info-bar {
            margin-bottom: var(--player-mobile-section-gap);

            .info-actions {
              padding-top: 6px;
              gap: 12px;
            }
          }

          .progress-section {
            margin: 0 0 var(--player-mobile-section-gap);
          }

          .control-section {
            max-width: min(392px, 100%);
            min-height: 54px;
            margin: clamp(8px, 2svh, 16px) auto 0;
            padding: 0 6px;

            .mode-btn,
            .placeholder {
              width: 38px;
              height: 38px;
            }

            .ctrl-btn {
              width: 46px;
              height: 46px;
            }

            .play-btn {
              width: 56px;
              height: 56px;
              min-height: 56px;
            }
          }
        }
      }
    }
  }
}

@media (max-height: 700px) and (orientation: portrait) {
  .full-player-mobile:not(.landscape-fit) {
    .mobile-content {
      .info-page {
        --player-mobile-top-space: clamp(34px, 5.2svh, 46px);
        --player-mobile-cover-size: min(54vw, 27svh, 242px);
        --player-mobile-pointer-size: min(13vw, 6.4svh, 54px);
        --player-mobile-section-gap: 9px;
        --player-mobile-bottom-space: calc(42px + env(safe-area-inset-bottom, 0px));
      }
    }
  }
}

@media (max-height: 620px) and (orientation: portrait) {
  .full-player-mobile:not(.landscape-fit) {
    .mobile-content {
      .info-page {
        --player-mobile-top-space: 30px;
        --player-mobile-cover-size: min(50vw, 24svh, 212px);
        --player-mobile-pointer-size: min(12vw, 5.8svh, 48px);
        --player-mobile-section-gap: 7px;
        --player-mobile-bottom-space: calc(34px + env(safe-area-inset-bottom, 0px));

        .info-group {
          .song-info-bar {
            margin-bottom: 7px;
          }

          .progress-section {
            margin-bottom: 7px;
          }

          .control-section {
            min-height: 50px;
            margin-top: 6px;

            .ctrl-btn {
              width: 42px;
              height: 42px;
            }

            .play-btn {
              width: 52px;
              height: 52px;
              min-height: 52px;
            }
          }
        }
      }
    }
  }
}
</style>

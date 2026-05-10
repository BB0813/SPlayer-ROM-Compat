<template>
  <div
    v-if="!useNativeMiniPlayerBar"
    ref="playerRef"
    :class="[
      'main-player',
      {
        show: musicStore.isHasPlayer && statusStore.showPlayBar,
        player: statusStore.showFullPlayer,
        'with-mobile-tabbar': isMobile,
        'android-playback-lite': isAndroidPlaybackLite,
      },
    ]"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
  >
    <PlayerSlider v-if="!useLitePlayerBar" />
    <div v-else class="android-lite-progress" aria-hidden="true">
      <span :style="{ width: androidLiteProgressWidth }" />
    </div>
    <!-- 播放信息 -->
    <div
      :class="['play-data', { 'hidden-cover': settingStore.hiddenCovers.player }]"
      @click.stop="openFullPlayerFromBar"
    >
      <Transition name="fade">
        <div
          v-if="!settingStore.hiddenCovers.player"
          :key="musicStore.playSong.cover"
          class="cover"
          @click.stop="statusStore.showFullPlayer = true"
        >
          <n-image
            :src="musicStore.songCover"
            :alt="musicStore.songCover"
            class="cover-img"
            preview-disabled
            @load="coverLoaded"
          >
            <template #placeholder>
              <div class="cover-loading">
                <img src="/images/song.jpg?asset" class="loading-img" alt="loading-img" />
              </div>
            </template>
          </n-image>

          <SvgIcon name="Expand" :size="30" />
        </div>
      </Transition>
      <!-- 歌曲信息 -->
      <Transition name="left-sm" mode="out-in">
        <div :key="musicStore.playSong.id" class="info">
          <div class="data">
            <!-- 歌名 -->
            <TextContainer
              v-if="!useLitePlayerBar"
              :key="musicStore.playSong.name"
              :text="displaySongName"
              :speed="0.2"
              class="name"
              style="cursor: pointer"
              @click.stop="settingStore.hiddenCovers.player && (statusStore.showFullPlayer = true)"
            />
            <span
              v-else
              class="name android-lite-name text-hidden"
              @click.stop="settingStore.hiddenCovers.player && (statusStore.showFullPlayer = true)"
            >
              {{ displaySongName }}
            </span>
            <!-- 播放速率 -->
            <n-tag
              v-if="statusStore.playRate !== 1"
              type="primary"
              size="small"
              round
              @click="openChangeRate"
            >
              {{ statusStore.playRate }}x
            </n-tag>
            <!-- 喜欢按钮 -->
            <SvgIcon
              v-if="musicStore.playSong.type !== 'radio'"
              :name="dataStore.isLikeSong(musicStore.playSong.id) ? 'Favorite' : 'FavoriteBorder'"
              :size="20"
              class="like"
              @click="
                toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id))
              "
            />
            <!-- 更多操作 -->
            <n-dropdown :options="songMoreOptions" trigger="click" placement="top-start">
              <SvgIcon name="FormatList" :size="20" :depth="2" class="more" />
            </n-dropdown>
          </div>
          <div v-if="shouldRenderBarLyric" class="lyric-container">
            <Transition
              :name="settingStore.lyricTransition === 'fade' ? 'fade' : 'lyric-slide'"
              :mode="settingStore.lyricTransition === 'fade' ? 'out-in' : undefined"
            >
              <TextContainer
                v-if="isShowLyrics && instantLyrics"
                :key="instantLyrics"
                :text="instantLyrics"
                :speed="0.5"
                :delay="500"
                class="lyric"
              />

              <div v-else class="artists">
                <TextContainer :speed="0.5" class="artists-container">
                  <n-text
                    v-if="musicStore.playSong.type === 'radio'"
                    class="ar-item"
                    @click="showCreatorTip"
                  >
                    {{ musicStore.playSong.dj?.creator || "未知创作者" }}
                  </n-text>
                  <template v-else-if="Array.isArray(musicStore.playSong.artists)">
                    <n-text
                      v-for="(item, index) in musicStore.playSong.artists"
                      :key="index"
                      class="ar-item"
                      @click="openJumpArtist(musicStore.playSong.artists, item.id)"
                    >
                      {{
                        settingStore.hideBracketedContent ? removeBrackets(item.name) : item.name
                      }}
                    </n-text>
                  </template>
                  <n-text
                    v-else
                    class="ar-item"
                    @click="openJumpArtist(musicStore.playSong.artists)"
                  >
                    {{
                      settingStore.hideBracketedContent
                        ? removeBrackets(musicStore.playSong.artists)
                        : musicStore.playSong.artists || "未知艺术家"
                    }}
                  </n-text>
                </TextContainer>
              </div>
            </Transition>
          </div>
        </div>
      </Transition>
    </div>
    <!-- 播放控制 -->
    <n-flex :size="8" align="center" justify="center" class="play-control">
      <template
        v-if="
          !useLitePlayerBar && musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode
        "
      >
        <div class="play-icon mode-icon" @click.stop="player.toggleShuffle()">
          <SvgIcon
            :name="statusStore.shuffleIcon"
            :size="20"
            :depth="statusStore.shuffleMode === 'off' ? 3 : 1"
          />
        </div>
      </template>
      <!-- 上一首 -->
      <div
        v-if="statusStore.personalFmMode"
        class="play-icon transport-icon"
        v-debounce="
          () =>
            songManager.personalFMTrash(musicStore.personalFMSong?.id, () =>
              player.nextOrPrev('next'),
            )
        "
      >
        <SvgIcon class="icon" :size="18" name="ThumbDown" />
      </div>
      <!-- 播放暂停 -->
      <div v-else class="play-icon transport-icon" v-debounce="() => player.nextOrPrev('prev')">
        <SvgIcon :size="26" name="SkipPrev" />
      </div>
      <!-- 播放参数 -->
      <n-button
        :loading="statusStore.playLoading"
        :focusable="false"
        :keyboard="false"
        class="play-pause"
        type="primary"
        strong
        secondary
        circle
        @click.stop="player.playOrPause()"
      >
        <template #icon>
          <Transition name="fade" mode="out-in">
            <SvgIcon
              :key="statusStore.playStatus ? 'Pause' : 'Play'"
              :name="statusStore.playStatus ? 'Pause' : 'Play'"
              :size="28"
            />
          </Transition>
        </template>
      </n-button>
      <!-- 下一首 -->
      <div class="play-icon transport-icon" v-debounce="() => player.nextOrPrev('next')">
        <SvgIcon :size="26" name="SkipNext" />
      </div>
      <!-- 播放模式 -->
      <template
        v-if="
          !useLitePlayerBar && musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode
        "
      >
        <div class="play-icon mode-icon" @click.stop="player.toggleRepeat()">
          <SvgIcon
            :name="statusStore.repeatIcon"
            :size="20"
            :depth="statusStore.repeatMode === 'off' ? 3 : 1"
          />
        </div>
      </template>
    </n-flex>
    <!-- 右侧菜单 -->
    <Transition v-if="!useLitePlayerBar" name="fade" mode="out-in">
      <n-flex
        :key="statusStore.personalFmMode ? 'fm' : 'normal'"
        :size="[8, 0]"
        class="play-menu"
        justify="end"
      >
        <!-- 音量控制 -->
        <Transition name="fade" mode="out-in">
          <n-flex
            :key="statusStore.autoClose.enable ? 'autoClose' : 'time'"
            :size="4"
            justify="center"
            class="time-container"
            vertical
          >
            <div class="time" @click="toggleTimeFormat">
              <n-text depth="2">{{ timeDisplay[0] }}</n-text>
              <n-text depth="2">{{ timeDisplay[1] }}</n-text>
            </div>

            <n-tag
              v-if="statusStore.autoClose.enable"
              size="small"
              type="primary"
              round
              @click="openAutoClose"
            >
              {{ convertSecondsToTime(statusStore.autoClose.remainTime) }}
              <template #icon>
                <SvgIcon name="TimeAuto" />
              </template>
            </n-tag>
          </n-flex>
        </Transition>
        <!-- 播放队列 -->
        <PlayerRightMenu />
      </n-flex>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { usePlayerController } from "@/core/player/PlayerController";
import { useSongManager } from "@/core/player/SongManager";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { toLikeSong } from "@/utils/auth";
import { useTimeFormat } from "@/composables/useTimeFormat";
import { useMobile } from "@/composables/useMobile";
import { useAndroidRoutePerformance } from "@/composables/useAndroidRoutePerformance";
import { copyData, coverLoaded, renderIcon, getShareUrl } from "@/utils/helper";
import {
  openAutoClose,
  openChangeRate,
  openCopySongInfo,
  openDownloadSong,
  openJumpArtist,
  openPlaylistAdd,
} from "@/utils/modal";
import { convertSecondsToTime } from "@/utils/time";
import { removeBrackets } from "@/utils/format";
import type { DropdownOption } from "naive-ui";

const router = useRouter();
const dataStore = useDataStore();
const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();
const { isMobile } = useMobile();
const { isAndroidPerformanceEnabled, isAndroidPlaybackLite } = useAndroidRoutePerformance();

const player = usePlayerController();
const songManager = useSongManager();
const { timeDisplay, toggleTimeFormat } = useTimeFormat();

const playerRef = ref<HTMLElement | null>(null);

const useLitePlayerBar = computed(() => isMobile.value && isAndroidPerformanceEnabled.value);
const useNativeMiniPlayerBar = computed(
  () =>
    useLitePlayerBar.value &&
    settingStore.androidNativeMiniPlayerBarEnabled &&
    musicStore.isHasPlayer &&
    statusStore.showPlayBar &&
    !statusStore.showFullPlayer,
);
const shouldRenderBarLyric = computed(() => !useLitePlayerBar.value);
const displaySongName = computed(() =>
  settingStore.hideBracketedContent
    ? removeBrackets(musicStore.playSong.name)
    : musicStore.playSong.name,
);
const androidLiteProgressWidth = computed(
  () => `${Math.min(100, Math.max(0, statusStore.progress || 0))}%`,
);

let dragOpenActive = false;
let dragOpenLocked: "h" | "v" | null = null;
let dragOpenParent: HTMLElement | null = null;
let dragOpenMain: HTMLElement | null = null;
let dragOpenRaf = 0;
let dragOpenPending = 0;
let dragStartX = 0;
let dragStartY = 0;
let dragStartTop = 0;
let dragLastDy = 0;
let dragOpenTravel = 0;
let dragOpenResetTimer = 0;
let dragOpenCloseTimer = 0;
let pointerId = -1;
let pointerActiveTarget: HTMLElement | null = null;
let horizontalSettled = false;
let horizontalDirection: "left" | "right" | null = null;
let suppressNextCardClick = false;

const OPEN_THRESHOLD = 100;

const isPhoneCardGestureEnabled = () => {
  if (!isMobile.value) return false;
  if (typeof document === "undefined") return false;
  return !document.documentElement.classList.contains("android-tablet-layout");
};

const setDragOpenFlag = (value: boolean) => {
  (window as unknown as { __splayerDragOpen?: boolean }).__splayerDragOpen = value;
};

const cancelDragOpenTimers = () => {
  if (dragOpenResetTimer) {
    window.clearTimeout(dragOpenResetTimer);
    dragOpenResetTimer = 0;
  }
  if (dragOpenCloseTimer) {
    window.clearTimeout(dragOpenCloseTimer);
    dragOpenCloseTimer = 0;
  }
};

const writeDragOpen = (dy: number) => {
  const progress = Math.max(0, Math.min(1, dy / dragOpenTravel));
  const translate = (1 - progress) * dragStartTop;
  const scale = 0.92 + 0.08 * progress;
  if (dragOpenParent) {
    dragOpenParent.style.transform = `translate3d(0, ${translate}px, 0) scale(${scale})`;
  }
  if (dragOpenMain) {
    dragOpenMain.style.opacity = String(1 - progress);
    dragOpenMain.style.transform = `scale(${1 - 0.1 * progress})`;
  }
};

const scheduleDragOpenFlush = (dy: number) => {
  dragOpenPending = dy;
  if (dragOpenRaf) return;
  dragOpenRaf = requestAnimationFrame(() => {
    dragOpenRaf = 0;
    writeDragOpen(dragOpenPending);
  });
};

const initDragOpen = () => {
  cancelDragOpenTimers();
  const parent = document.querySelector(".full-player") as HTMLElement | null;
  const main = document.getElementById("main");
  if (parent) {
    dragOpenParent = parent;
    parent.style.transformOrigin = "50% 0";
    parent.style.willChange = "transform";
    parent.style.transition = "none";
    parent.style.transform = `translate3d(0, ${dragStartTop}px, 0) scale(0.92)`;
    parent.style.borderRadius = "28px";
    parent.style.backfaceVisibility = "hidden";
    parent.style.backdropFilter = "blur(48px)";
    parent.style.contain = "paint";
    parent.style.pointerEvents = "none";
  }
  if (main) {
    dragOpenMain = main;
    main.style.transition = "none";
    main.style.willChange = "transform, opacity";
    main.style.opacity = "1";
    main.style.transform = "scale(1)";
  }
};

const resetDragOpen = () => {
  cancelDragOpenTimers();
  if (dragOpenRaf) {
    cancelAnimationFrame(dragOpenRaf);
    dragOpenRaf = 0;
  }
  if (dragOpenParent) {
    dragOpenParent.style.transformOrigin = "";
    dragOpenParent.style.willChange = "";
    dragOpenParent.style.transition = "";
    dragOpenParent.style.transform = "";
    dragOpenParent.style.borderRadius = "";
    dragOpenParent.style.backfaceVisibility = "";
    dragOpenParent.style.backdropFilter = "";
    dragOpenParent.style.contain = "";
    dragOpenParent.style.pointerEvents = "";
  }
  if (dragOpenMain) {
    dragOpenMain.style.transition = "";
    dragOpenMain.style.transform = "";
    dragOpenMain.style.opacity = "";
    dragOpenMain.style.willChange = "";
  }
  dragOpenParent = null;
  dragOpenMain = null;
  dragOpenActive = false;
  dragOpenLocked = null;
  setDragOpenFlag(false);
};

const finishDragOpen = (dy: number) => {
  const shouldOpen = dy > OPEN_THRESHOLD;
  suppressNextCardClick = true;
  if (dragOpenRaf) {
    cancelAnimationFrame(dragOpenRaf);
    dragOpenRaf = 0;
  }
  if (shouldOpen) {
    if (dragOpenParent) {
      dragOpenParent.style.transition = "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)";
      dragOpenParent.style.transform = "";
    }
    if (dragOpenMain) {
      dragOpenMain.style.transition =
        "opacity 0.28s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)";
      dragOpenMain.style.opacity = "";
      dragOpenMain.style.transform = "";
    }
    dragOpenResetTimer = window.setTimeout(() => {
      dragOpenResetTimer = 0;
      resetDragOpen();
    }, 320);
  } else {
    if (dragOpenParent) {
      dragOpenParent.style.transition = "transform 0.24s cubic-bezier(0.4, 0, 1, 1)";
      dragOpenParent.style.transform = `translate3d(0, ${dragStartTop}px, 0) scale(0.92)`;
    }
    if (dragOpenMain) {
      dragOpenMain.style.transition =
        "opacity 0.24s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)";
      dragOpenMain.style.opacity = "1";
      dragOpenMain.style.transform = "scale(1)";
    }
    dragOpenCloseTimer = window.setTimeout(() => {
      dragOpenCloseTimer = 0;
      statusStore.showFullPlayer = false;
      dragOpenResetTimer = window.setTimeout(() => {
        dragOpenResetTimer = 0;
        resetDragOpen();
      }, 360);
    }, 240);
  }
  window.setTimeout(() => {
    suppressNextCardClick = false;
  }, 360);
};

const onPointerDown = (event: PointerEvent) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  cancelDragOpenTimers();
  pointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragLastDy = 0;
  dragOpenActive = false;
  dragOpenLocked = null;
  horizontalSettled = false;
  horizontalDirection = null;
  pointerActiveTarget = event.currentTarget as HTMLElement;
};

const onPointerMove = (event: PointerEvent) => {
  if (event.pointerId !== pointerId) return;
  const dx = event.clientX - dragStartX;
  const dy = dragStartY - event.clientY;
  dragLastDy = dy;
  if (!isPhoneCardGestureEnabled() || (statusStore.showFullPlayer && !dragOpenActive)) return;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (!dragOpenLocked) {
    if (Math.max(absX, absY) < 8) return;
    if (absY > absX) {
      if (dy <= 0) {
        dragOpenLocked = "h";
        return;
      }
      dragOpenLocked = "v";
      pointerActiveTarget?.setPointerCapture?.(event.pointerId);
      const rect = playerRef.value?.getBoundingClientRect();
      dragStartTop = rect ? rect.top : window.innerHeight - 80;
      dragOpenTravel = Math.max(window.innerHeight * 0.55, 360);
      setDragOpenFlag(true);
      dragOpenActive = true;
      statusStore.showFullPlayer = true;
      requestAnimationFrame(() => {
        if (!dragOpenActive) return;
        initDragOpen();
        writeDragOpen(Math.max(dy, 0));
      });
      return;
    }
    dragOpenLocked = "h";
    horizontalDirection = dx > 0 ? "right" : "left";
    return;
  }
  if (dragOpenLocked === "h") {
    horizontalDirection = dx > 0 ? "right" : "left";
    horizontalSettled = absX > 50;
    return;
  }
  if (dragOpenActive) scheduleDragOpenFlush(Math.max(dy, 0));
};

const onPointerEnd = (event: PointerEvent) => {
  if (event.pointerId !== pointerId) return;
  pointerId = -1;
  if (pointerActiveTarget) {
    pointerActiveTarget.releasePointerCapture?.(event.pointerId);
    pointerActiveTarget = null;
  }
  if (dragOpenActive) {
    finishDragOpen(Math.max(dragLastDy, 0));
    return;
  }
  if (dragOpenLocked === "h" && horizontalSettled && horizontalDirection) {
    suppressNextCardClick = true;
    if (horizontalDirection === "left") player.nextOrPrev("next");
    else player.nextOrPrev("prev");
    window.setTimeout(() => {
      suppressNextCardClick = false;
    }, 320);
  }
};

onBeforeUnmount(() => {
  resetDragOpen();
});

const songMoreOptions = computed<DropdownOption[]>(() => {
  const song = musicStore.playSong;
  const isHasMv = !!song?.mv && song.mv !== 0;
  const isSong = song.type === "song";
  const isLocal = !!song?.path;
  const itemLabel = song.type === "radio" ? "节目" : "歌曲";

  const moreChildren: DropdownOption[] = [
    {
      key: "code-name",
      label: `复制${itemLabel}名称`,
      props: {
        onClick: () => copyData(song.name),
      },
      icon: renderIcon("Copy", { size: 18 }),
    },
  ];

  if (!isLocal) {
    moreChildren.push(
      {
        key: "code-id",
        label: `复制${itemLabel} ID`,
        props: {
          onClick: () => copyData(song.id),
        },
        icon: renderIcon("Copy", { size: 18 }),
      },
      {
        key: "share",
        label: `分享${itemLabel}链接`,
        props: {
          onClick: () => copyData(getShareUrl(song.type, song.id), "已复制分享链接到剪贴板"),
        },
        icon: renderIcon("Share", { size: 18 }),
      },
    );
  }

  if (!isLocal && isSong) {
    moreChildren.splice(2, 0, {
      key: "copy-song-info",
      label: "复制更多信息",
      props: {
        onClick: () => openCopySongInfo(song.id),
      },
      icon: renderIcon("FormatList", { size: 18 }),
    });
  }

  const options: DropdownOption[] = [
    {
      key: "more",
      label: "更多操作",
      icon: renderIcon("Menu", { size: 18 }),
      children: moreChildren,
    },
  ];

  if (settingStore.useOnlineService) {
    options.push({
      key: "search",
      label: "同名搜索",
      props: {
        onClick: () => router.push({ name: "search", query: { keyword: song.name } }),
      },
      icon: renderIcon("Search"),
    });
  }

  options.push({
    key: "line",
    type: "divider",
  });

  options.push({
    key: "playlist-add",
    label: "添加到歌单",
    props: {
      onClick: () => openPlaylistAdd([song], isLocal),
    },
    icon: renderIcon("AddList"),
  });

  if (isSong && isHasMv) {
    options.push({
      key: "mv",
      label: "观看 MV",
      props: {
        onClick: () => router.push({ name: "video", query: { id: song.mv, type: "mv" } }),
      },
      icon: renderIcon("Video", { size: 18 }),
    });
  }

  if (statusStore.isDeveloperMode && !isLocal && isSong) {
    options.push({
      key: "download",
      label: "下载歌曲",
      props: {
        onClick: () => openDownloadSong(song),
      },
      icon: renderIcon("Download"),
    });
  }

  if (!isLocal && isSong) {
    options.push({
      key: "wiki",
      label: "音乐百科",
      props: {
        onClick: () => router.push({ name: "song-wiki", query: { id: song.id } }),
      },
      icon: renderIcon("Info"),
    });
  }

  if (!isLocal) {
    options.push({
      key: "comment",
      label: "查看评论",
      props: {
        onClick: () => {
          const id = song.id;
          const type = song.type === "radio" ? 4 : 0;
          router.push({ name: "comment", query: { id, type } });
        },
      },
      icon: renderIcon("Message"),
    });
  }

  return options;
});

const isShowLyrics = computed(() => {
  const isHasLrc = musicStore.isHasLrc;
  return (
    isHasLrc &&
    !statusStore.lyricLoading &&
    settingStore.barLyricShow &&
    musicStore.playSong.type !== "radio" &&
    statusStore.playStatus &&
    statusStore.lyricIndex !== -1
  );
});

const instantLyrics = computed(() => {
  const isYrc = !!musicStore.songLyric.yrcData?.length && settingStore.showWordLyrics;
  const content = isYrc
    ? musicStore.songLyric.yrcData[statusStore.lyricIndex]
    : musicStore.songLyric.lrcData[statusStore.lyricIndex];
  const contentStr = content?.words?.map((item) => item.word).join("") || "";
  return content?.translatedLyric && settingStore.showTran
    ? `${contentStr} - ${content.translatedLyric}`
    : contentStr;
});

const openFullPlayerFromBar = () => {
  if (!isMobile.value || suppressNextCardClick) return;
  statusStore.showFullPlayer = true;
};

const showCreatorTip = () => window.$message.info("电台创作者暂不支持跳转");
</script>

<style lang="scss" scoped>
.main-player {
  position: fixed;
  left: 0;
  bottom: calc(-90px - var(--safe-area-bottom, 0px));
  height: calc(var(--player-bar-height, 80px) + var(--safe-area-bottom, 0px));
  padding: 0
    var(--android-content-padding-right, max(12px, calc(15px * var(--android-ui-scale, 1))))
    var(--safe-area-bottom, 0px)
    var(--android-content-padding-left, max(12px, calc(15px * var(--android-ui-scale, 1))));
  --main-player-cover-size: 56px;
  --main-player-name-size: 16px;
  width: 100%;
  background-color: var(--surface-container-hex);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  transition: bottom 0.3s;
  z-index: 10;
  touch-action: pan-x;
  &.show {
    bottom: 0;
  }
  .player-slider {
    position: absolute;
    width: 100%;
    height: 16px;
    top: -8px;
    left: 0;
    margin: 0;
    --n-rail-height: 3px;
    --n-handle-size: 14px;
  }
  .android-lite-progress {
    position: absolute;
    width: 100%;
    height: 16px;
    top: -8px;
    left: 0;
    margin: 0;
    pointer-events: none;
    display: flex;
    align-items: center;
    overflow: hidden;

    &::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      height: 3px;
      border-radius: 999px;
      background-color: rgba(var(--primary), 0.16);
    }

    span {
      position: relative;
      display: block;
      height: 3px;
      border-radius: 999px;
      background-color: var(--primary-hex);
      transition: width 0.35s linear;
    }
  }
  .play-data {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    overflow: hidden;
    height: 100%;
    max-width: 640px;
    padding-left: calc(var(--main-player-cover-size) + 12px);
    .cover {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      left: 0;
      width: var(--main-player-cover-size);
      height: var(--main-player-cover-size);
      min-width: var(--main-player-cover-size);
      border-radius: 8px;
      overflow: hidden;
      margin-right: 12px;
      transition: opacity 0.2s;
      cursor: pointer;
      :deep(img) {
        width: var(--main-player-cover-size);
        height: var(--main-player-cover-size);
        opacity: 0;
        transition:
          transform 0.3s,
          opacity 0.3s,
          filter 0.3s;
      }
      .n-icon {
        position: absolute;
        color: #eee;
        opacity: 0;
        transform: scale(0.6);
        transition:
          opacity 0.3s,
          transform 0.3s;
      }
      &:hover {
        :deep(img) {
          transform: scale(1.2);
          filter: brightness(0.6) blur(2px);
        }
        .n-icon {
          opacity: 1;
          transform: scale(1);
        }
      }
      &:active {
        .n-icon {
          transform: scale(1.2);
        }
      }
    }
    .info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      .data {
        display: flex;
        align-items: center;
        .name {
          font-weight: bold;
          font-size: var(--main-player-name-size);
          flex: 0 1 auto;
          width: auto;
          min-width: 0;
          transition: color 0.3s;
        }
        .n-tag {
          margin-left: 8px;
          flex-shrink: 0;
        }
        .like {
          color: var(--primary-hex);
          margin-left: 8px;
          transition: transform 0.3s;
          cursor: pointer;
          flex-shrink: 0;
          &:hover {
            transform: scale(1.15);
          }
          &:active {
            transform: scale(1);
          }
        }
        .more {
          margin-left: 8px;
          cursor: pointer;
          flex-shrink: 0;
        }
      }
      .lyric-container {
        position: relative;
        height: 22px;
        margin-top: 2px;
        overflow: hidden;
        .lyric,
        .artists {
          margin-top: 0;
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
        }
      }
      .artists {
        width: 100%;
        overflow: hidden;

        .artists-container {
          .ar-item {
            display: inline-flex;
            transition: color 0.3s;
            cursor: pointer;
            white-space: nowrap;

            &::after {
              content: "/";
              margin: 0 6px;
              opacity: 0.6;
              transition: none;
            }
            &:last-child {
              &::after {
                display: none;
              }
            }
            &:hover {
              color: var(--primary-hex);
              &::after {
                color: var(--n-close-icon-color);
              }
            }
          }
        }
      }
    }
    &.hidden-cover {
      padding-left: 0;
    }
  }
  .play-control {
    margin: 0 60px;
    .play-pause {
      --n-width: 44px;
      --n-height: 44px;
      margin: 0 4px;
      transition:
        background-color 0.3s,
        transform 0.3s;
      .n-icon {
        transition: opacity 0.1s ease-in-out;
      }
      &:hover {
        transform: scale(1.1);
      }
      &:active {
        transform: scale(1);
      }
    }
    .play-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      will-change: transform;
      transition:
        background-color 0.3s,
        transform 0.3s;
      cursor: pointer;
      margin: 0 2px;
      .n-icon {
        color: var(--primary-hex);
      }
      &:hover {
        transform: scale(1.1);
        background-color: rgba(var(--primary), 0.16);
      }
      &:active {
        transform: scale(1);
      }
    }
  }
  .play-menu {
    margin-left: auto;
    max-width: 640px;
    .time-container {
      margin-right: 8px;
      .n-tag {
        justify-content: center;
        font-size: 12px;
      }
    }
    .time {
      cursor: pointer;
      display: flex;
      align-items: center;
      font-size: 12px;
      .n-text {
        color: var(--primary-hex);
        opacity: 0.8;
        &:nth-of-type(1) {
          &::after {
            content: "/";
            margin: 0 4px;
          }
        }
      }
      &:hover {
        text-decoration: underline;
        text-decoration-color: var(--primary-hex);
      }
    }
  }
  @media (max-width: 1024px) {
    .play-menu {
      .time-container {
        display: none !important;
      }
    }
  }
  @media (max-width: 810px) {
    grid-template-columns: 1fr auto auto;
    .play-control {
      margin: 0 0 0 12px;
      .play-icon {
        display: none;
      }
    }
  }
}
</style>

<style lang="scss" scoped>
@media (max-width: 768px) {
  .main-player.with-mobile-tabbar.show {
    bottom: var(
      --mobile-player-bottom,
      calc(
        var(--mobile-tabbar-outer-height, 64px) + var(--mobile-tabbar-bottom-lift, 8px) +
          var(--mobile-dock-gap, 8px) + var(--safe-area-bottom, 0px)
      )
    );
  }

  .main-player {
    height: var(--player-bar-height, 82px);
    padding: 0
      var(--android-content-padding-right, max(10px, calc(14px * var(--android-ui-scale, 1)))) 0
      var(--android-content-padding-left, max(10px, calc(14px * var(--android-ui-scale, 1))));
    --main-player-cover-size: max(52px, calc(58px * var(--android-ui-scale, 1)));
    --main-player-name-size: max(15px, calc(16px * var(--android-ui-scale, 1)));
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 10px;

    .play-data {
      max-width: none;
      padding-left: calc(var(--main-player-cover-size) + 12px);

      .cover,
      .cover :deep(img) {
        width: var(--main-player-cover-size);
        height: var(--main-player-cover-size);
        min-width: var(--main-player-cover-size);
      }

      .info {
        justify-content: center;
      }

      .lyric-container,
      .data .n-tag,
      .data .like,
      .data .more {
        display: none;
      }

      .data .name {
        font-size: var(--main-player-name-size);
      }
    }

    .play-control {
      margin: 0;
      gap: 4px !important;

      .play-pause {
        --n-width: 48px;
        --n-height: 48px;
      }

      .play-icon {
        width: 42px;
        height: 42px;
        margin: 0;
      }
    }

    .play-menu {
      display: none !important;
    }
  }
}

@media (max-width: 420px) {
  .main-player {
    height: var(--player-bar-height, 78px);
    padding: 0
      var(--android-content-padding-right, max(8px, calc(10px * var(--android-ui-scale, 1)))) 0
      var(--android-content-padding-left, max(8px, calc(10px * var(--android-ui-scale, 1))));
    --main-player-cover-size: max(50px, calc(54px * var(--android-ui-scale, 1)));
    column-gap: 8px;

    .play-data {
      padding-left: calc(var(--main-player-cover-size) + 10px);

      .cover,
      .cover :deep(img) {
        width: var(--main-player-cover-size);
        height: var(--main-player-cover-size);
        min-width: var(--main-player-cover-size);
      }

      .data .name {
        font-size: var(--main-player-name-size);
      }
    }

    .play-control {
      gap: 2px !important;

      .play-icon {
        width: 38px;
        height: 38px;
      }

      .play-pause {
        --n-width: 46px;
        --n-height: 46px;
      }
    }
  }
}
</style>

<style lang="scss">
// Android Beta64 平板横屏播放栏修正
:root.android-app .main-player.with-mobile-tabbar {
  height: var(--player-bar-height, 82px);
  padding: 0
    var(--android-content-padding-right, max(10px, calc(14px * var(--android-ui-scale, 1)))) 0
    var(--android-content-padding-left, max(10px, calc(14px * var(--android-ui-scale, 1))));
}

:root.android-app .main-player.with-mobile-tabbar.show {
  bottom: var(
    --mobile-player-bottom,
    calc(
      var(--mobile-tabbar-outer-height, 64px) + var(--mobile-tabbar-bottom-lift, 8px) +
        var(--mobile-dock-gap, 8px) + var(--safe-area-bottom, 0px)
    )
  );
}

:root.android-app.android-tablet-layout.android-landscape .main-player.with-mobile-tabbar {
  --main-player-cover-size: max(52px, calc(58px * var(--android-ui-scale, 1)));
  --main-player-name-size: max(15px, calc(16px * var(--android-ui-scale, 1)));
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 12px;
}

:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-data {
  max-width: none;
  padding-left: calc(var(--main-player-cover-size) + 12px);
}

:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-data
  .cover,
:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-data
  .cover
  img {
  width: var(--main-player-cover-size);
  height: var(--main-player-cover-size);
  min-width: var(--main-player-cover-size);
}

:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-data
  .lyric-container,
:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-data
  .data
  .n-tag,
:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-data
  .data
  .like,
:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-data
  .data
  .more,
:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-menu {
  display: none !important;
}

:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-control {
  margin: 0;
  gap: 4px !important;
}

:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-control
  .play-pause {
  --n-width: 48px;
  --n-height: 48px;
}

:root.android-app.android-tablet-layout.android-landscape
  .main-player.with-mobile-tabbar
  .play-control
  .play-icon {
  width: 42px;
  height: 42px;
  margin: 0;
}

:root.android-app .main-player.with-mobile-tabbar {
  left: var(--android-content-padding-left, max(10px, calc(14px * var(--android-ui-scale, 1))));
  right: var(--android-content-padding-right, max(10px, calc(14px * var(--android-ui-scale, 1))));
  width: auto;
  height: var(--android-player-card-height, 76px);
  min-height: var(--android-player-card-height, 76px);
  padding: 0 max(10px, calc(12px * var(--android-ui-scale, 1)));
  border-radius: var(--android-radius-dock, 22px);
  background-color: color-mix(in srgb, var(--surface-container-hex) 92%, rgba(0, 0, 0, 0.08) 8%);
  border: 1px solid rgba(var(--primary), 0.12);
  box-shadow: var(--android-shadow-dock, 0 8px 24px rgba(0, 0, 0, 0.16));
  backdrop-filter: blur(18px);
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: max(8px, calc(10px * var(--android-ui-scale, 1)));
  overflow: hidden;
  z-index: 13;
}

:root.android-app .main-player.with-mobile-tabbar .player-slider,
:root.android-app .main-player.with-mobile-tabbar .android-lite-progress {
  left: 0;
  top: auto;
  bottom: 0;
  width: 100%;
  height: 3px;
  --n-rail-height: 2px;
  --n-handle-size: 0px;
}

:root.android-app .main-player.with-mobile-tabbar .android-lite-progress::before {
  display: none;
}

:root.android-app .main-player.with-mobile-tabbar .android-lite-progress span {
  height: 2px;
  border-radius: 0 999px 999px 0;
  background-color: rgba(var(--primary), 0.92);
  box-shadow: none;
}

:root.android-app .main-player.with-mobile-tabbar .player-slider .n-slider-rail {
  background-color: transparent !important;
}

:root.android-app .main-player.with-mobile-tabbar .player-slider .n-slider-rail__fill {
  height: 2px;
  border-radius: 0 999px 999px 0;
}

:root.android-app .main-player.with-mobile-tabbar .play-data {
  height: 100%;
  padding-top: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

:root.android-app .main-player.with-mobile-tabbar .play-data .cover {
  border-radius: var(--android-radius-control, 16px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
}

:root.android-app .main-player.with-mobile-tabbar .play-data .data .name {
  max-width: 100%;
}

:root.android-app .main-player.with-mobile-tabbar .play-data .data .android-lite-name {
  display: block;
  min-width: 0;
}

:root.android-app .main-player.with-mobile-tabbar .play-control .mode-icon {
  display: none !important;
}

:root.android-app .main-player.with-mobile-tabbar .play-control .transport-icon {
  display: flex !important;
}

:root.android-app .main-player.with-mobile-tabbar.android-playback-lite {
  backdrop-filter: none;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.1);
  contain: layout paint style;
}

:root.android-app .main-player.with-mobile-tabbar.android-playback-lite,
:root.android-app .main-player.with-mobile-tabbar.android-playback-lite * {
  transition: none !important;
}

:root.android-app
  .main-player.with-mobile-tabbar.android-playback-lite
  .android-lite-progress
  span {
  transition: width 0.6s linear !important;
}

@media (max-width: 420px) {
  :root.android-app .main-player.with-mobile-tabbar {
    height: var(--android-player-card-compact-height, 72px);
    min-height: var(--android-player-card-compact-height, 72px);
    padding: 0 max(10px, calc(12px * var(--android-ui-scale, 1)));
    border-radius: var(--android-radius-dock, 20px);
  }

  :root.android-app .main-player.with-mobile-tabbar .player-slider {
    left: 0;
    width: 100%;
  }
}
</style>

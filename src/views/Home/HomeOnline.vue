<template>
  <div :class="['home-online', { 'android-playback-lite': isAndroidPlaybackLite }]">
    <div v-if="isLogin()" class="main-rec">
      <div class="main-rec-grid">
        <n-flex :size="20" class="rec-list" justify="space-between" vertical>
          <SongListCard
            :data="musicStore.dailySongsData.list"
            :title="dailySongsTitle"
            :height="90"
            description="根据你的音乐口味 · 每日更新"
            size="small"
            :hiddenCover="settingStore.hiddenCovers.home"
            @click="router.push({ name: 'daily-songs' })"
          />
          <SongListCard
            :data="dataStore.likeSongsList.data"
            :height="90"
            title="我喜欢的音乐"
            description="发现你独特的音乐品味"
            size="small"
            :hiddenCover="settingStore.hiddenCovers.home"
            @click="router.push({ name: 'like-songs' })"
          />
        </n-flex>
        <PersonalFM />
      </div>
    </div>
    <div v-for="(item, index) in displayedRecData" :key="item.type" class="rec-public">
      <n-flex
        class="title"
        align="center"
        justify="space-between"
        @click="router.push({ path: item.path ?? undefined })"
      >
        <n-h3 prefix="bar">
          <n-text>{{ item.name }}</n-text>
          <SvgIcon v-if="item.path" :size="26" name="Right" />
        </n-h3>
      </n-flex>
      <AndroidLazySection
        :enabled="shouldUseSectionLazy"
        :eager="index < androidEagerSectionCount"
        :placeholder-height="getAndroidSectionPlaceholderHeight(item.type)"
      >
        <ArtistList
          v-if="item.type === 'artist'"
          :data="item.list"
          :loading="recListLoading"
          :hiddenCover="settingStore.hiddenCovers.home"
          :max-items="androidArtistMaxItems"
        />
        <CoverList
          v-else
          :data="item.list"
          :type="item.type"
          :loading="recListLoading"
          :loading-num="coverLoadingNum"
          :hiddenCover="settingStore.hiddenCovers.home"
          :max-items="androidCoverMaxItems"
          :disable-dynamic-play-state="isAndroidPlaybackLite"
        />
      </AndroidLazySection>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ArtistType, CoverType } from "@/types/main";
import { NText } from "naive-ui";
import { useDataStore, useMusicStore, useSettingStore } from "@/stores";
import { newAlbumsAll, personalized, radarPlaylist, topArtists } from "@/api/rec";
import { allMv } from "@/api/video";
import { radioRecommend } from "@/api/radio";
import { getCacheData } from "@/utils/cache";
import { formatArtistsList, formatCoverList } from "@/utils/format";
import { sleep } from "@/utils/helper";
import { useAndroidRoutePerformance } from "@/composables/useAndroidRoutePerformance";
import { isLogin } from "@/utils/auth";
import SvgIcon from "@/components/Global/SvgIcon.vue";
import AndroidLazySection from "@/components/UI/AndroidLazySection.vue";

interface RecItemTypeBase {
  name: string;
  path?: string;
}

interface RecItemArtist extends RecItemTypeBase {
  type: "artist";
  list: ArtistType[];
}

interface RecItemCover extends RecItemTypeBase {
  type: "playlist" | "video" | "radio" | "album";
  list: CoverType[];
}

interface RecDataType {
  playlist: RecItemCover;
  radar: RecItemCover;
  artist: RecItemArtist;
  video: RecItemCover;
  radio: RecItemCover;
  album: RecItemCover;
}

type RecSection = RecItemArtist | RecItemCover;
type RecSectionType = RecSection["type"];

const router = useRouter();
const dataStore = useDataStore();
const musicStore = useMusicStore();
const settingStore = useSettingStore();
const { isAndroidPlaybackLite, shouldStabilizeDynamicContent } = useAndroidRoutePerformance();

// 日推标题
const dailySongsTitle = computed(() => {
  if (settingStore.hiddenCovers.home) return "每日推荐";
  const day = new Date().getDate();
  return h("div", { class: "date" }, [
    h("div", { class: "date-icon" }, [
      h(SvgIcon, { name: "Calendar-Empty", size: 30, depth: 2 }),
      h(NText, null, () => day),
    ]),
    h(NText, { class: "name text-hidden" }, () => ["每日推荐"]),
  ]);
});

// 推荐数据
const recData = ref<RecDataType>({
  playlist: {
    name: isLogin() ? "专属歌单" : "推荐歌单",
    list: [] as CoverType[],
    type: "playlist",
    path: "/discover/playlists",
  },
  radar: {
    name: "雷达歌单",
    list: [] as CoverType[],
    type: "playlist",
  },
  artist: {
    name: "歌手推荐",
    list: [] as ArtistType[],
    type: "artist",
    path: "/discover/artists",
  },
  video: {
    name: "推荐 MV",
    list: [] as CoverType[],
    type: "video",
  },
  radio: {
    name: "推荐播客",
    list: [] as CoverType[],
    type: "radio",
  },
  album: {
    name: "新碟上架",
    list: [] as CoverType[],
    type: "album",
    path: "/discover/new",
  },
});

// 根据设置过滤和排序推荐数据
const sortedRecData = computed<RecSection[]>(() => {
  const configuredSections = Array.isArray(settingStore.homePageSections)
    ? settingStore.homePageSections
    : [];
  const visibleSections = configuredSections
    .slice()
    .filter((section) => section.visible)
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const key = section.key as keyof RecDataType;
      return recData.value[key];
    })
    .filter((item): item is RecSection => !!item);

  return visibleSections.length > 0 ? visibleSections : Object.values(recData.value);
});
const stableRecData = shallowRef<RecSection[]>([]);
const syncStableRecData = () => {
  stableRecData.value = sortedRecData.value.map(
    (item) => ({ ...item, list: item.list.slice() }) as RecSection,
  );
};
const displayedRecData = computed(() => {
  if (shouldStabilizeDynamicContent.value && stableRecData.value.length > 0) {
    return stableRecData.value;
  }
  return sortedRecData.value;
});

watch(
  [sortedRecData, shouldStabilizeDynamicContent],
  ([, isStabilized]) => {
    if (!isStabilized || stableRecData.value.length === 0) syncStableRecData();
  },
  { immediate: true },
);

const recListLoading = computed(() => isLoadingRecData.value || !hasRecData.value);
const shouldUseSectionLazy = computed(() => isAndroidPlaybackLite.value);
const androidEagerSectionCount = computed(() =>
  shouldUseSectionLazy.value ? 2 : Number.MAX_SAFE_INTEGER,
);
const androidCoverMaxItems = computed(() => (isAndroidPlaybackLite.value ? 6 : undefined));
const androidArtistMaxItems = computed(() => (isAndroidPlaybackLite.value ? 6 : undefined));
const coverLoadingNum = computed(() => {
  if (isAndroidPlaybackLite.value) return 6;
  return shouldStabilizeDynamicContent.value ? 9 : undefined;
});
const getAndroidSectionPlaceholderHeight = (type: RecSectionType) => {
  if (type === "artist") return 190;
  if (type === "video") return 180;
  return 220;
};
const isLoadingRecData = ref(false);
const hasRecData = computed(() => {
  return Object.values(recData.value).some((item) => item.list.length > 0);
});

// 获取全部推荐
const getAllRecData = async (force = false) => {
  if (isLoadingRecData.value) return;
  if (!force && shouldStabilizeDynamicContent.value && hasRecData.value) return;

  isLoadingRecData.value = true;

  try {
    // 延时
    await sleep(shouldStabilizeDynamicContent.value ? 800 : 300);

    try {
      const playlistRes = await getCacheData(
        personalized,
        { key: "playlistRec", time: 10 },
        "playlist",
        isLogin() ? 21 : 20,
      );
      const playlistList = Array.isArray(playlistRes?.result) ? playlistRes.result : [];
      recData.value.playlist.list = formatCoverList(
        playlistList.filter((playlist: any) => playlist && !playlist.name?.includes("私人雷达")),
      );
    } catch (error) {
      console.error("Error getting playlist:", error);
    }

    try {
      const radarRes = await getCacheData(radarPlaylist, { key: "radarRec", time: 30 });
      recData.value.radar.list = formatCoverList(Array.isArray(radarRes) ? radarRes : []);
    } catch (error) {
      console.error("Error getting radar:", error);
    }

    try {
      const artistRes = await getCacheData(topArtists, { key: "artistRec", time: 10 }, 6);
      recData.value.artist.list = formatArtistsList(
        Array.isArray(artistRes?.artists) ? artistRes.artists : [],
      );
    } catch (error) {
      console.error("Error getting artist:", error);
    }

    try {
      const videoRes = await getCacheData(allMv, { key: "videoRec", time: 10 });
      recData.value.video.list = formatCoverList(
        Array.isArray(videoRes?.data) ? videoRes.data : [],
      );
    } catch (error) {
      console.error("Error getting video:", error);
    }

    try {
      const radioRes = await getCacheData(radioRecommend, { key: "radioRec", time: 10 });
      recData.value.radio.list = formatCoverList(
        Array.isArray(radioRes?.djRadios) ? radioRes.djRadios : [],
      );
    } catch (error) {
      console.error("Error getting radio:", error);
    }

    try {
      const albumRes = await getCacheData(newAlbumsAll, { key: "albumRec", time: 10 });
      recData.value.album.list = formatCoverList(
        Array.isArray(albumRes?.albums) ? albumRes.albums : [],
      );
    } catch (error) {
      console.error("Error getting album:", error);
    }
  } catch (error) {
    window.$message.error("个性化推荐获取出错");
    console.error("Error getting personalized data:", error);
  } finally {
    isLoadingRecData.value = false;
  }
};

onActivated(() => {
  if (shouldStabilizeDynamicContent.value && hasRecData.value) return;
  void getAllRecData();
});

onMounted(() => {
  void getAllRecData(true);
});
</script>

<style lang="scss" scoped>
.home-online {
  display: flow-root;
  width: 100%;
  min-width: 0;
  min-height: max(420px, calc(100dvh - var(--mobile-stable-dock-content-height, 0px) - 96px));
  overflow-x: hidden;
  overflow-x: clip;
}

.rec-public {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-x: clip;
}

.main-rec {
  .main-rec-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
  .date {
    display: flex;
    align-items: center;
    margin-bottom: 4px;
    .date-icon {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 4px;
      .n-text {
        position: absolute;
        font-size: 12px;
        color: var(--primary-hex);
        line-height: normal;
        margin-top: 4px;
        transform: scale(0.8);
      }
    }
    .name {
      font-size: 18px;
      font-weight: bold;
    }
  }
  @media (max-width: 768px) {
    .main-rec-grid {
      grid-template-columns: repeat(1, 1fr);
    }
    .rec-list {
      display: grid !important;
      grid-template-columns: repeat(2, 1fr);
    }
  }
}
.title {
  margin-top: 28px;
  padding: 0 4px;
  width: max-content;
  .n-h {
    margin: 0;
    display: flex;
    align-items: center;
    cursor: pointer;
    .n-icon {
      opacity: 0;
      transform: translateX(4px);
      transition:
        opacity 0.3s,
        transform 0.3s;
    }
    &:hover {
      .n-icon {
        opacity: 1;
        transform: translateX(0);
      }
    }
  }
}
</style>

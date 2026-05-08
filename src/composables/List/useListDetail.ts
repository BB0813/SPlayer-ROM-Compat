import type { CoverType, SongType } from "@/types/main";
import { useStatusStore } from "@/stores";
import { useMobile } from "@/composables/useMobile";
import { isAndroidApp } from "@/utils/env";

/**
 * 列表详情逻辑
 */
export const useListDetail = () => {
  const statusStore = useStatusStore();
  const { isSmallScreen } = useMobile();
  const { width: viewportWidth, height: viewportHeight } = useWindowSize();

  const detailData = ref<CoverType | null>(null);
  const listData = shallowRef<SongType[]>([]);
  const loading = ref<boolean>(true);

  const getAndroidUiScale = () => {
    if (typeof window === "undefined") return 1;
    const rootScale = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--android-ui-scale"),
    );
    return Number.isFinite(rootScale) ? Math.min(1.1, Math.max(0.6, rootScale)) : 1;
  };

  const clampScaledHeight = (base: number, min: number, max: number, scale: number) => {
    return Math.min(max, Math.max(min, Math.round(base * scale)));
  };

  const getAndroidViewport = () => {
    const width = viewportWidth.value || (typeof window !== "undefined" ? window.innerWidth : 0);
    const height = viewportHeight.value || (typeof window !== "undefined" ? window.innerHeight : 0);
    return {
      width,
      height,
      shortEdge: Math.min(width, height),
      isLandscape: width > height,
    };
  };

  const resolveListHeight = (detailHeight: number) => {
    return Math.max(180, statusStore.mainContentHeight - detailHeight);
  };

  /**
   * 计算列表高度
   */
  const getSongListHeight = (listScrolling: boolean) => {
    if (isAndroidApp) {
      const layoutScale = getAndroidUiScale();
      const viewport = getAndroidViewport();
      const isTabletLayout = viewport.shortEdge >= 600;
      const isNarrowScreen = viewport.width > 0 && viewport.width <= 480;

      if (isTabletLayout && viewport.isLandscape) {
        const normalHeight = clampScaledHeight(140, 128, 154, layoutScale);
        const smallHeight = clampScaledHeight(92, 82, 104, layoutScale);
        return resolveListHeight(listScrolling ? smallHeight : normalHeight);
      }

      if (isTabletLayout) {
        const normalHeight = clampScaledHeight(164, 150, 178, layoutScale);
        const smallHeight = clampScaledHeight(104, 92, 116, layoutScale);
        return resolveListHeight(listScrolling ? smallHeight : normalHeight);
      }

      if (isSmallScreen.value) {
        const normalHeight = isNarrowScreen
          ? Math.min(164, Math.max(124, Math.round(154 * layoutScale)))
          : Math.min(176, Math.max(132, Math.round(168 * layoutScale)));
        const smallHeight = Math.min(120, Math.max(84, Math.round(118 * layoutScale)));
        return resolveListHeight(listScrolling ? smallHeight : normalHeight);
      }
    }

    const normalHeight = isSmallScreen.value ? 360 : 240;
    const smallHeight = isSmallScreen.value ? 132 : 120;
    return resolveListHeight(listScrolling ? smallHeight : normalHeight);
  };

  /**
   * 重置数据
   */
  const resetData = (resetList: boolean = true) => {
    detailData.value = null;
    if (resetList) {
      listData.value = [];
    }
  };

  /**
   * 设置详情数据
   */
  const setDetailData = (data: CoverType | null) => {
    detailData.value = data;
  };

  /**
   * 设置列表数据
   */
  const setListData = (data: SongType[]) => {
    listData.value = data;
  };

  /**
   * 追加列表数据
   */
  const appendListData = (data: SongType[]) => {
    listData.value = [...listData.value, ...data];
  };

  /**
   * 设置加载状态
   */
  const setLoading = (value: boolean) => {
    loading.value = value;
  };

  return {
    detailData,
    listData,
    loading,
    getSongListHeight,
    resetData,
    setDetailData,
    setListData,
    appendListData,
    setLoading,
  };
};

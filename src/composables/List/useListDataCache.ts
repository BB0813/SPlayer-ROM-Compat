import type { CoverType, SongType } from "@/types/main";
import { useCacheManager } from "@/core/resource/CacheManager";
import { isElectron } from "@/utils/env";

/**
 * 列表类型
 */
export type ListType = "playlist" | "album" | "radio";

/**
 * 列表缓存数据结构
 */
export interface ListCacheData {
  /** 注释已清理 */
  version: number;
  /** 注释已清理 */
  timestamp: number;
  /** 注释已清理 */
  type: ListType;
  /** 注释已清理 */
  id: number;
  /** 注释已清理 */
  detail: CoverType;
  /** 注释已清理 */
  songs: SongType[];
}

/** 注释已清理 */
const CACHE_VERSION = 4;

/**
 * 注释已清理
 * 注释已清理
 */
export const useListDataCache = () => {
  const cacheManager = useCacheManager();

  /**
   * 注释已清理
   * 注释已清理
   * 注释已清理
   */
  const getCacheKey = (type: ListType, id: number): string => {
    return `${type}-${id}.json`;
  };

  /**
   * 注释已清理
   * 注释已清理
   * 注释已清理
   * 注释已清理
   * 注释已清理
   */
  const saveCache = async (
    type: ListType,
    id: number,
    detail: CoverType,
    songs: SongType[],
  ): Promise<void> => {
    if (!isElectron) return;

    const cacheData: ListCacheData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      type,
      id,
      detail,
      songs,
    };

    const key = getCacheKey(type, id);
    const jsonStr = JSON.stringify(cacheData);

    try {
      await cacheManager.set("list-data", key, jsonStr);
      console.log(`List cache saved: ${key}`);
    } catch (error) {
      console.error(`Failed to save list cache: ${key}`, error);
    }
  };

  /**
   * 注释已清理
   * 注释已清理
   * 注释已清理
   * 注释已清理
   */
  const loadCache = async (type: ListType, id: number): Promise<ListCacheData | null> => {
    if (!isElectron) return null;

    const key = getCacheKey(type, id);

    try {
      const result = await cacheManager.get("list-data", key);
      if (!result.success || !result.data) {
        return null;
      }

      // 注释已清理
      const jsonStr = new TextDecoder().decode(result.data);
      const cacheData: ListCacheData = JSON.parse(jsonStr);

      // 注释已清理
      if (cacheData.version !== CACHE_VERSION) {
        console.log(`Cache version mismatch: ${key}, removing old cache`);
        await removeCache(type, id);
        return null;
      }

      console.log(`List cache loaded: ${key}`);
      return cacheData;
    } catch (error) {
      console.error(`获取列表缓存失败: ${key}`, error);
      return null;
    }
  };

  /**
   * 注释已清理
   * 注释已清理
   * 注释已清理
   * 注释已清理
   * 注释已清理
   */
  const checkNeedsUpdate = (cached: ListCacheData, latestDetail: CoverType): boolean => {
    // 注释已清理
    if (cached.detail.updateTime && latestDetail.updateTime) {
      const needsUpdate = cached.detail.updateTime !== latestDetail.updateTime;
      if (needsUpdate) {
        console.log(`Cache needs update: timestamp changed`);
        console.log(`   Old: ${cached.detail.updateTime}`);
        console.log(`   New: ${latestDetail.updateTime}`);
      } else {
        console.log(`Cache is up to date (timestamp match)`);
      }
      return needsUpdate;
    }

    // 注释已清理
    if (cached.detail.count !== latestDetail.count) {
      console.log(`Cache needs update: count changed`);
      return true;
    }

    if (cached.type === "album") {
      console.log(`Album cache is up to date (count match)`);
    } else {
      console.log(`No timestamp found, assuming up to date based on count`);
    }

    return false;
  };

  /**
   * 注释已清理
   * 注释已清理
   * 注释已清理
   */
  const removeCache = async (type: ListType, id: number): Promise<void> => {
    if (!isElectron) return;

    const key = getCacheKey(type, id);

    try {
      await cacheManager.remove("list-data", key);
      console.log(`List cache removed: ${key}`);
    } catch (error) {
      console.error(`Failed to remove list cache: ${key}`, error);
    }
  };

  /**
   * 注释已清理
   */
  const clearAllCache = async (): Promise<void> => {
    if (!isElectron) return;

    try {
      await cacheManager.clear("list-data");
      console.log(`All list cache cleared`);
    } catch (error) {
      console.error(`Failed to clear list cache`, error);
    }
  };

  return {
    getCacheKey,
    saveCache,
    loadCache,
    checkNeedsUpdate,
    removeCache,
    clearAllCache,
  };
};

<template>
  <div class="setting">
    <!-- 移动端遮罩层 -->
    <Transition name="fade">
      <div v-if="showLeftMenu" class="mobile-overlay" @click="showLeftMenu = false" />
    </Transition>
    <Transition name="slideLeft">
      <div v-show="showLeftMenu" class="set-left">
        <n-flex class="title" :size="0" vertical>
          <n-h1>设置</n-h1>
          <n-text :depth="3">个性化与全局设置</n-text>
        </n-flex>
        <!-- 搜索 -->
        <div class="search-wrapper">
          <SettingSearch
            :options="searchOptions"
            @select="handleSearch"
            @active-change="(val) => (isSearchActive = val)"
          />
        </div>
        <!-- 设置菜单 -->
        <Transition name="fade" mode="out-in">
          <div v-show="!isSearchActive" style="height: calc(100% - 210px); min-height: 0">
            <component
              :is="isSmallScreen ? 'div' : NScrollbar"
              class="set-menu-scroll"
              :class="{ 'set-menu-scroll-native': isSmallScreen }"
            >
              <n-menu
                v-model:value="activeKey"
                :options="menuOptions"
                :indent="10"
                @update:value="onMenuSelect"
              />
            </component>
          </div>
        </Transition>
        <!-- 信息 -->
        <div class="power">
          <n-text class="author" :depth="2" @click="toGithub">
            <SvgIcon name="Github" :size="20" />
            {{ packageJson.author }}
          </n-text>
          <n-text class="name">SPlayer-ROM-Compat</n-text>
          <n-tag v-if="isNightly" class="version" size="small" type="primary" round>
            Nightly · {{ displayVersion }}
          </n-tag>
          <n-tag
            v-else-if="statusStore.isDeveloperMode"
            class="version"
            size="small"
            type="warning"
            round
          >
            DEV · {{ displayVersion }}
          </n-tag>
          <n-text v-else class="version" depth="3">{{ displayVersion }}</n-text>
        </div>
      </div>
    </Transition>
    <div class="set-right">
      <n-flex class="mobile-title" size="small" align="end">
        <n-button quaternary circle @click="showLeftMenu = !showLeftMenu">
          <template #icon>
            <SvgIcon :depth="2" size="24" name="Menu" />
          </template>
        </n-button>
        <n-h1>设置</n-h1>
        <n-text :depth="3">个性化与全局设置</n-text>
      </n-flex>
      <component
        :is="isSmallScreen ? 'div' : NScrollbar"
        ref="setContentRef"
        class="set-content"
        :class="{ 'set-content-native': isSmallScreen }"
        v-bind="contentScrollProps"
      >
        <Transition name="fade" mode="out-in" :duration="70" @after-leave="scrollContentToTop">
          <!-- 常规 -->
          <UniversalSetting
            v-if="activeKey === 'general'"
            :groups="generalConfig.groups"
            :highlight-key="highlightKey"
          />
          <!-- 外观 -->
          <UniversalSetting
            v-else-if="activeKey === 'appearance'"
            :groups="appearanceConfig.groups"
            :highlight-key="highlightKey"
          />
          <!-- 播放 -->
          <UniversalSetting
            v-else-if="activeKey === 'play'"
            :groups="playConfig.groups"
            :highlight-key="highlightKey"
          />
          <!-- 歌词 -->
          <UniversalSetting
            v-else-if="activeKey === 'lyrics'"
            :groups="lyricConfig.groups"
            :highlight-key="highlightKey"
          />
          <!-- 快捷键 -->
          <UniversalSetting
            v-else-if="activeKey === 'keyboard'"
            :groups="keyboardConfig.groups"
            :highlight-key="highlightKey"
          />
          <!-- 本地 -->
          <UniversalSetting
            v-else-if="activeKey === 'local'"
            :groups="localConfig.groups"
            :highlight-key="highlightKey"
          />
          <!-- 网络 -->
          <UniversalSetting
            v-else-if="activeKey === 'network'"
            :groups="networkConfig.groups"
            :highlight-key="highlightKey"
          />
          <!-- 关于 -->
          <AboutSetting v-else-if="activeKey === 'about'" />
          <!-- 空白 -->
          <n-text v-else class="error">暂无该设置项</n-text>
        </Transition>
      </component>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NScrollbar } from "naive-ui";
import type { MenuOption, SelectOption } from "naive-ui";
import { SettingItem, SettingGroup } from "@/types/settings";
import type { SettingType } from "@/types/main";
import { useMobile } from "@/composables/useMobile";
import { renderIcon } from "@/utils/helper";
import { isElectron } from "@/utils/env";
import { useStatusStore } from "@/stores";
import { getDisplayVersion, isNightly } from "@/utils/version";
import packageJson from "@/../package.json";
import { usePlaySettings } from "./config/play";
import { useGeneralSettings } from "./config/general";
import { useAppearanceSettings } from "./config/appearance";
import { useLyricSettings } from "./config/lyric";
import { useKeyboardSettings } from "./config/keyboard";
import { useLocalSettings } from "./config/local";
import { useNetworkSettings } from "./config/network";

const props = defineProps<{ type: SettingType; scrollTo?: string }>();

const playConfig = usePlaySettings();
const generalConfig = useGeneralSettings();
const appearanceConfig = useAppearanceSettings();
const lyricConfig = useLyricSettings();
const keyboardConfig = useKeyboardSettings();
const localConfig = useLocalSettings();
const networkConfig = useNetworkSettings();

// 配置映射表
const configs: Record<string, any> = {
  play: playConfig,
  general: generalConfig,
  appearance: appearanceConfig,
  lyrics: lyricConfig,
  keyboard: keyboardConfig,
  local: localConfig,
  network: networkConfig,
};

// 聚合所有设置
const allSettingGroups = computed(() => {
  return [
    { key: "general", groups: generalConfig.groups },
    { key: "appearance", groups: appearanceConfig.groups },
    { key: "play", groups: playConfig.groups },
    { key: "lyrics", groups: lyricConfig.groups },
    { key: "keyboard", groups: keyboardConfig.groups },
    { key: "local", groups: localConfig.groups },
    { key: "network", groups: networkConfig.groups },
  ];
});

const statusStore = useStatusStore();
const displayVersion = getDisplayVersion();
const { isSmallScreen } = useMobile();

// 设置内容
const setContentRef = ref<HTMLElement | InstanceType<typeof NScrollbar> | null>(null);

const contentScrollProps = computed(() => {
  const padding = isSmallScreen.value ? "12px 0 20px" : "40px 10px";
  return isSmallScreen.value ? { style: { padding } } : { contentStyle: { padding } };
});

const scrollContentToTop = () => {
  const target = setContentRef.value;
  if (!target) return;
  if (target instanceof HTMLElement) {
    target.scrollTo({ top: 0, behavior: "auto" });
    return;
  }
  target.scrollTo({ top: 0 });
};

// 移动端菜单显示状态
const showLeftMenu = ref(!isSmallScreen.value);

// 监听屏幕大小变化，非小屏时自动显示侧边栏
watch(isSmallScreen, (small) => {
  showLeftMenu.value = !small;
});

// 菜单数据
const activeKey = ref<SettingType>(props.type);

// 菜单选择处理
const onMenuSelect = () => {
  if (isSmallScreen.value) {
    showLeftMenu.value = false;
  }
};

// 监听 ActiveKey 变化，触发懒加载事件
watch(
  activeKey,
  (newKey, oldKey) => {
    // 触发销毁
    if (oldKey && configs[oldKey]?.onDeactivate) {
      configs[oldKey].onDeactivate();
    }
    // 触发激活
    if (newKey && configs[newKey]?.onActivate) {
      configs[newKey].onActivate();
    }
  },
  { immediate: true },
);

const highlightKey = ref<string>();
const isSearchActive = ref(false);

// 搜索选项
const searchOptions = computed<SelectOption[]>(() => {
  const options: SelectOption[] = [];
  allSettingGroups.value.forEach(({ key, groups }) => {
    // 分类是否显示
    const menuOption = menuOptions.find((m) => m.key === key);
    if (menuOption?.show === false) return;
    // 检查分组可见性
    groups.forEach((group: SettingGroup) => {
      const groupShow =
        group.show === undefined
          ? true
          : typeof group.show === "function"
            ? group.show()
            : toValue(group.show);
      if (!groupShow) return;
      // 检查设置项可见性
      group.items.forEach((item: SettingItem) => {
        const itemShow =
          item.show === undefined
            ? true
            : typeof item.show === "function"
              ? item.show()
              : toValue(item.show);
        if (!itemShow) return;
        const label = toValue(item.label);
        const desc = toValue(item.description);
        options.push({
          label: label,
          value: `${key}::${item.key}`,
          searchLabel: `${label} ${typeof desc === "string" ? desc : ""} ${item.keywords?.join(" ") || ""}`,
          desc: typeof desc === "string" ? desc : undefined,
          groupLabel: group.title,
        });
      });
    });
  });
  return options;
});

// 处理搜索选择
const handleSearch = (value: string | number) => {
  if (!value) return;
  const keyStr = String(value);
  const [targetTab, targetKey] = keyStr.split("::");
  // 标记正在跳转
  highlightKey.value = targetKey;
  // 切换到对应标签页
  if (activeKey.value !== targetTab) {
    activeKey.value = targetTab as SettingType;
  }
  // 移动端收起菜单
  if (isSmallScreen.value) {
    showLeftMenu.value = false;
  }
  nextTick(() => {
    setTimeout(() => {
      const element = document.getElementById(`setting-${targetKey}`);
      if (!element) {
        highlightKey.value = undefined;
        return;
      }
      // 滚动到元素位置
      element.scrollIntoView({ block: "center" });
      // 清理跳转标记
      setTimeout(() => {
        highlightKey.value = undefined;
      }, 2500);
    }, 300);
  });
};

// 菜单内容
const menuOptions: MenuOption[] = [
  {
    key: "general",
    label: "常规设置",
    icon: renderIcon("SettingsLine"),
  },
  {
    key: "appearance",
    label: "外观设置",
    icon: renderIcon("Palette"),
  },
  {
    key: "play",
    label: "播放设置",
    icon: renderIcon("Music"),
  },
  {
    key: "lyrics",
    label: "歌词设置",
    icon: renderIcon("Lyrics"),
  },
  {
    key: "local",
    label: "本地与缓存",
    show: isElectron,
    icon: renderIcon("Storage"),
  },
  {
    key: "keyboard",
    label: "快捷键设置",
    show: isElectron,
    icon: renderIcon("Keyboard"),
  },
  {
    key: "network",
    label: "网络与连接",
    icon: renderIcon("Link"),
  },
  {
    key: "about",
    label: "关于与鸣谢",
    icon: renderIcon("Info"),
  },
];

// 跳转
const toGithub = () => {
  window.open(packageJson.github);
};

onMounted(() => {
  if (props.scrollTo) {
    handleSearch(`${props.type}::${props.scrollTo}`);
  }
});
</script>

<style lang="scss" scoped>
.setting {
  position: relative;
  display: flex;
  width: 100%;
  height: 75vh;
  min-height: 75vh;
  overflow: hidden;
  .mobile-overlay {
    display: none;
  }
  .set-left {
    display: flex;
    flex-direction: column;
    width: 280px;
    height: 100%;
    padding: 20px;
    background-color: var(--surface-container-hex);
    .title {
      height: 60px;
      margin: 10px 0 20px 10px;
      .n-h1 {
        font-size: 26px;
        font-weight: bold;
        margin-top: 0;
        line-height: normal;
        margin-bottom: 6px;
      }
    }
    .set-menu-scroll {
      width: 100%;
      height: 100%;
      min-height: 0;
    }

    .set-menu-scroll-native {
      display: block;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      touch-action: pan-y;
    }

    .n-menu {
      width: 100%;
      flex: 1;
    }
    .power {
      height: 50px;
      margin: auto 0 0 10px;
      .name {
        font-weight: bold;
        margin-right: 6px;
      }
      .version {
        pointer-events: none;
      }
      .author {
        display: flex;
        flex-direction: row;
        align-items: center;
        margin-bottom: 4px;
        cursor: pointer;
        .n-icon {
          margin-right: 4px;
        }
      }
    }
  }
  .set-right {
    flex: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--background-hex);

    .set-content {
      flex: 1;
      min-height: 0;
      height: 0;
      overflow: hidden;
      touch-action: pan-y;
      overscroll-behavior: contain;
    }

    .set-content-native {
      display: block;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      touch-action: pan-y;
    }

    .mobile-title {
      flex-shrink: 0;
      display: none !important;
    }
  }
  @media (max-width: 768px) {
    height: 100%;
    min-height: 100%;

    .mobile-overlay {
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 10;
    }
    .set-left {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 11;
      width: min(82vw, 300px);
      padding: calc(16px + env(safe-area-inset-top, 0px)) 16px
        calc(16px + env(safe-area-inset-bottom, 0px));
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
    }
    .set-right {
      width: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      .mobile-title {
        display: flex !important;
        align-items: center;
        padding: calc(16px + env(safe-area-inset-top, 0px)) 64px 12px 12px;
        gap: 10px;

        .n-button {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
        }

        .n-h1 {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 0;
          line-height: normal;
          margin: 0;
        }
      }
    }
  }
}
</style>

<style lang="scss">
.main-setting {
  position: relative;
  width: min(calc(100vw - 24px), 1024px);
  max-width: 1024px !important;
  height: min(92dvh, 840px);
  max-height: min(92dvh, 840px);
  overflow: hidden;

  .n-card {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .n-card-header {
    position: absolute;
    top: 0;
    right: 0;
    padding: 20px;
    z-index: 20;
  }
  .n-card__content {
    flex: 1;
    min-height: 0;
    display: flex;
    padding: 0;
    .setting-type {
      transition: opacity 0.2s ease-in-out;
    }
    .set-content {
      padding: 0 30px;
    }
    .set-list {
      padding-top: 30px;
      &:first-child {
        padding-top: 0;
      }
    }
    .n-h {
      display: inline-flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }
    .n-collapse-transition {
      margin-bottom: 12px;
      &:last-child {
        margin-bottom: 0;
      }
    }
    .set-item {
      width: 100%;
      border-radius: 8px;
      margin-bottom: 12px;
      transition: margin 0.3s;
      &:last-child {
        margin-bottom: 0;
      }
      .n-card__content {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
      }
      .label {
        display: flex;
        flex-direction: column;
        padding-right: 20px;
        .name {
          font-size: 16px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
      }
      .n-flex {
        flex-flow: nowrap !important;
      }
      .set {
        justify-content: flex-end;
        min-width: 200px;
        width: 200px;
        &.n-switch {
          width: max-content;
        }
      }
    }
    @media (max-width: 768px) {
      .set-content {
        padding: 0 12px;

        .n-scrollbar-content {
          padding: 8px 0 calc(12px + env(safe-area-inset-bottom, 0px)) !important;
        }
      }

      .set-item {
        .n-card__content {
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
        }

        .label {
          width: 100%;
          padding-right: 0;
        }

        .n-flex {
          flex-flow: wrap !important;
        }

        .set {
          width: 100%;
          min-width: 0;
          justify-content: flex-start;

          &.n-switch {
            width: max-content;
          }
        }
      }
    }
  }

  @media (max-width: 768px) {
    width: 100vw;
    max-width: 100vw !important;
    height: 100dvh;
    max-height: 100dvh;
    margin: 0 !important;
    border-radius: 0;

    .n-card {
      border-radius: 0;
    }

    .n-card-header {
      top: env(safe-area-inset-top, 0px);
      right: env(safe-area-inset-right, 0px);
      padding: 8px;
    }

    .n-card-header__close {
      width: 44px;
      height: 44px;
      border-radius: 999px;
      touch-action: manipulation;
    }

    .n-card__content {
      overflow: hidden;
    }
  }

  @supports (height: 100svh) {
    @media (max-width: 768px) {
      height: 100svh;
      max-height: 100svh;
    }
  }

  @media (max-width: 420px) {
    width: 100vw;

    .n-card-header {
      padding: 16px 12px;
    }

    .n-card__content {
      .set-content {
        padding: 0 10px;
      }
    }
  }

  .n-menu {
    padding-bottom: 0;
    .n-menu-item {
      &:first-child {
        margin-top: 0;
      }
    }
    .n-menu-item-content {
      &::before {
        left: 0px;
        right: 0;
        width: 100%;
        border-radius: 6px;
      }
    }
  }
}
:root.android-app.android-compact-ui .main-setting {
  .n-card-header {
    padding: max(8px, calc(14px * var(--android-ui-scale, 1)));
  }

  .n-card__content {
    .set-content {
      padding: 0 max(10px, calc(24px * var(--android-ui-scale, 1)));
    }

    .set-list {
      padding-top: max(20px, calc(30px * var(--android-ui-scale, 1)));
    }

    .set-item {
      margin-bottom: max(8px, calc(12px * var(--android-ui-scale, 1)));

      .n-card__content {
        padding: var(--android-compact-card-padding);
      }

      .label {
        padding-right: max(12px, calc(20px * var(--android-ui-scale, 1)));

        .name {
          font-size: max(14px, calc(16px * var(--android-ui-scale, 1)));
        }
      }
    }
  }
}

@media (max-width: 768px) {
  :root.android-app.android-compact-ui .main-setting {
    .n-card__content {
      .set-content {
        padding: 0 max(8px, calc(12px * var(--android-ui-scale, 1)));
      }
    }
  }
}
</style>

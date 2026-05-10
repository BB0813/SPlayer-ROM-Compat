<template>
  <n-layout-header class="nav">
    <n-flex class="page-control" align="center">
      <Logo v-if="!isDesktop" :size="40" @click="router.push('/')" />
      <template v-if="!isSmallScreen">
        <n-button :focusable="false" tertiary circle @click="router.go(-1)">
          <template #icon>
            <SvgIcon name="NavigateBefore" :size="26" />
          </template>
        </n-button>
        <n-button :focusable="false" tertiary circle @click="router.go(1)">
          <template #icon>
            <SvgIcon name="NavigateNext" :size="26" />
          </template>
        </n-button>
      </template>
      <n-button
        v-if="statusStore.updateAvailable"
        :focusable="false"
        :title="updateBtnTitle"
        tertiary
        circle
        @click="handleUpdateClick"
      >
        <template #icon>
          <SvgIcon name="Update" />
        </template>
      </n-button>
    </n-flex>

    <n-flex :wrap="false" justify="end" class="nav-main">
      <SearchInp v-if="settingStore.useOnlineService" />
      <div v-if="isDesktop" class="nav-drag" />
      <n-flex align="center" :wrap="false" class="nav-actions">
        <User v-if="settingStore.useOnlineService && !isSmallScreen" />
        <User
          v-if="settingStore.useOnlineService && isSmallScreen"
          compact
          class="mobile-user-entry"
        />
        <n-dropdown :options="setOptions" trigger="click" @select="setSelect">
          <n-button :focusable="false" title="更多设置" tertiary circle>
            <template #icon>
              <SvgIcon name="Settings" />
            </template>
          </n-button>
        </n-dropdown>
        <n-button
          v-if="!isDesktop"
          :focusable="false"
          title="打开菜单"
          tertiary
          circle
          @click="showAside = !showAside"
        >
          <template #icon>
            <SvgIcon name="Menu" />
          </template>
        </n-button>
        <n-drawer v-model:show="showAside" :width="240" placement="left">
          <n-drawer-content :body-content-style="{ padding: 0 }" :native-scrollbar="false">
            <template #header>
              <n-flex align="center" justify="center" class="aside-logo">
                <Logo />
                <n-text>SPlayer-ROM-Compat</n-text>
              </n-flex>
            </template>
            <Menu @menu-click="showAside = false" />
          </n-drawer-content>
        </n-drawer>
      </n-flex>
    </n-flex>

    <n-flex
      v-if="isElectron && !isSmallScreen && useBorderless"
      align="center"
      class="client-control"
    >
      <n-divider class="divider" vertical />
      <div class="min-button-wrapper" title="最小化" @click="min">
        <n-button :focusable="false" title="最小化" tertiary circle @click.stop="min">
          <template #icon>
            <SvgIcon name="WindowMinimize" />
          </template>
        </n-button>
        <div class="min-expanded-area"></div>
      </div>
      <div class="max-button-wrapper" :title="isMax ? '还原窗口' : '最大化'" @click="maxOrRes">
        <n-button
          :focusable="false"
          :title="isMax ? '还原窗口' : '最大化'"
          tertiary
          circle
          @click.stop="maxOrRes"
        >
          <template #icon>
            <SvgIcon :name="isMax ? 'WindowRestore' : 'WindowMaximize'" />
          </template>
        </n-button>
        <div class="max-expanded-area"></div>
      </div>
      <div class="close-button-wrapper" title="关闭" @click="tryClose">
        <n-button :focusable="false" title="关闭" tertiary circle @click.stop="tryClose">
          <template #icon>
            <SvgIcon name="WindowClose" />
          </template>
        </n-button>
        <div class="close-expanded-area"></div>
      </div>
    </n-flex>

    <n-modal
      v-model:show="showCloseModal"
      :auto-focus="false"
      title="关闭应用"
      style="width: 600px"
      preset="card"
      transform-origin="center"
      bordered
      @after-leave="rememberNotAsk = false"
    >
      <n-text class="tip">关闭窗口时，要退出应用还是最小化到托盘？</n-text>
      <n-checkbox v-model:checked="rememberNotAsk" class="checkbox">
        记住本次选择，下次不再询问
      </n-checkbox>
      <template #footer>
        <n-flex justify="end">
          <n-button strong secondary @click="hideOrClose('exit')">
            <template #icon>
              <SvgIcon name="ExitToApp" />
            </template>
            退出应用
          </n-button>
          <n-button type="primary" strong secondary @click="hideOrClose('hide')">
            <template #icon>
              <SvgIcon name="WindowHide" />
            </template>
            最小化到托盘
          </n-button>
        </n-flex>
      </template>
    </n-modal>
  </n-layout-header>
</template>

<script setup lang="ts">
import type { DropdownOption } from "naive-ui";
import { useSettingStore, useStatusStore } from "@/stores";
import { renderIcon } from "@/utils/helper";
import { openSetting, openThemeConfig, openScalingModal, openUpdateApp } from "@/utils/modal";
import { isAndroidApp, isDev, isElectron } from "@/utils/env";
import { useMobile } from "@/composables/useMobile";

const router = useRouter();
const settingStore = useSettingStore();
const statusStore = useStatusStore();
const { isDesktop, isSmallScreen } = useMobile();

const showCloseModal = ref(false);
const rememberNotAsk = ref(false);
const useBorderless = ref(true);
const isMax = ref(false);
const showAside = ref(false);

const updateBtnTitle = computed(() => {
  if (statusStore.updateDownloaded) return "安装更新";
  if (statusStore.updateDownloading) {
    return `下载中 ${Math.round(statusStore.updateDownloadProgress)}%`;
  }
  const version = statusStore.updateInfo?.version;
  return version ? `发现更新 ${version}` : "发现更新";
});

const handleUpdateClick = () => {
  if (statusStore.updateInfo) {
    openUpdateApp(statusStore.updateInfo);
  }
};

const min = () => window.electron.ipcRenderer.send("win-min");

const maxOrRes = () => {
  if (window.electron.ipcRenderer.sendSync("win-state")) {
    window.electron.ipcRenderer.send("win-restore");
  } else {
    window.electron.ipcRenderer.send("win-max");
  }
};

const hideOrClose = (action: "hide" | "exit") => {
  if (rememberNotAsk.value) {
    settingStore.showCloseAppTip = false;
    settingStore.closeAppMethod = action;
  }
  showCloseModal.value = false;
  window.electron.ipcRenderer.send(action === "hide" ? "win-hide" : "quit-app");
};

const tryClose = () => {
  if (settingStore.showCloseAppTip) {
    showCloseModal.value = true;
  } else {
    hideOrClose(settingStore.closeAppMethod);
  }
};

const setOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [
    {
      key: "themeMode",
      label:
        settingStore.themeMode === "auto"
          ? "跟随系统主题"
          : settingStore.themeMode === "light"
            ? "浅色模式"
            : "深色模式",
      disabled: !!statusStore.backgroundImageUrl,
      icon: renderIcon(
        settingStore.themeMode === "auto"
          ? "LightTheme"
          : settingStore.themeMode === "light"
            ? "DarkTheme"
            : "AutoTheme",
      ),
    },
    {
      key: "themeConfig",
      label: "主题配置",
      icon: renderIcon("Palette"),
    },
  ];

  if (isElectron) {
    options.push({
      key: "zoom",
      label: "界面缩放",
      icon: renderIcon("ZoomIn"),
    });
  }

  options.push({
    key: "divider-1",
    type: "divider",
  });

  if (isAndroidApp) {
    options.push({
      key: "android-setting",
      label: "Android 显示与性能",
      icon: renderIcon("Settings"),
    });
  }

  if (isElectron) {
    options.push({
      key: "restart",
      label: "重启应用",
      props: { onClick: () => window.electron.ipcRenderer.send("win-reload") },
      icon: renderIcon("Restart"),
    });
  }

  if (isDev) {
    options.push({
      key: "dev-tools",
      label: "开发者工具",
      icon: renderIcon("Code"),
    });
  }

  options.push({
    key: "setting",
    label: "设置",
    icon: renderIcon("Settings"),
  });

  return options;
});

const setSelect = (key: string) => {
  switch (key) {
    case "themeMode":
      settingStore.setThemeMode();
      break;
    case "themeConfig":
      openThemeConfig();
      break;
    case "zoom":
      openScalingModal();
      break;
    case "android-setting":
      openSetting("play", "androidAutoUiScale");
      break;
    case "setting":
      openSetting();
      break;
    case "dev-tools":
      window.electron.ipcRenderer.send("open-dev-tools");
      break;
  }
};

const handleWinStateChange = (_event: unknown, value: boolean) => {
  isMax.value = value;
};

onMounted(async () => {
  if (!isElectron) return;
  const windowConfig = await window.api.store.get("window");
  useBorderless.value = windowConfig?.useBorderless ?? true;
  isMax.value = window.electron.ipcRenderer.sendSync("win-state");
  window.electron.ipcRenderer.on("win-state-change", handleWinStateChange);
});

onUnmounted(() => {
  if (!isElectron) return;
  window.electron.ipcRenderer.removeListener("win-state-change", handleWinStateChange);
});
</script>

<style lang="scss" scoped>
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: calc(70px + var(--safe-area-top, 0px));
  padding: var(--safe-area-top, 0px) 1rem 0;
  background-color: transparent;
  -webkit-app-region: drag;

  .page-control {
    flex-shrink: 0;
    gap: 8px;
  }

  .n-button {
    width: 40px;
    height: 40px;
    -webkit-app-region: no-drag;
  }

  .nav-main {
    position: relative;
    flex: 1;
    align-items: center;
    min-width: 0;
    height: 100%;
    margin-left: 12px;

    .nav-drag {
      flex: 1;
      width: 100%;
      height: 100%;
    }
  }

  .client-control {
    flex-shrink: 0;

    .divider {
      margin: 0 0 0 12px;
    }

    .min-button-wrapper,
    .max-button-wrapper,
    .close-button-wrapper {
      position: relative;
      cursor: pointer;
    }

    .min-expanded-area,
    .max-expanded-area,
    .close-expanded-area {
      position: fixed;
      top: 0;
      width: 50px;
      height: calc(70px + var(--safe-area-top, 0px));
      background-color: transparent;
      cursor: pointer;
      -webkit-app-region: no-drag;
      z-index: 1000;
    }

    .close-expanded-area {
      right: 0;
    }

    .max-expanded-area {
      right: 50px;
    }

    .min-expanded-area {
      right: 100px;
    }
  }
}

.tip {
  font-size: 16px;
}

.aside-logo {
  .n-text {
    width: 180px;
    font-size: 18px;
    font-family: "logo";
    margin-top: 2px;
    line-height: 40px;
  }
}

.checkbox {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: max-content;
  margin-top: 12px;

  :deep(.n-checkbox__label) {
    line-height: 0;
  }
}
</style>

<style lang="scss" scoped>
@media (max-width: 768px) {
  .nav {
    gap: 8px;
    height: calc(
      clamp(56px, calc(64px * var(--android-ui-scale, 1)), 64px) + var(--safe-area-top, 0px)
    );
    padding: var(--safe-area-top, 0px)
      var(
        --android-content-padding-right,
        clamp(7px, calc(12px * var(--android-ui-scale, 1)), 12px)
      )
      0
      var(--android-content-padding-left, clamp(7px, calc(12px * var(--android-ui-scale, 1)), 12px));

    .page-control {
      gap: 4px;
    }

    .nav-main {
      margin-left: 6px;
      --mobile-nav-action-reserve: calc(
        var(--android-touch-target, 48px) + var(--android-touch-target, 48px) +
          var(--android-touch-target, 48px) + var(--android-space-xs, 8px) +
          var(--android-space-xs, 8px) + 6px
      );
    }

    .n-button {
      width: clamp(44px, calc(48px * var(--android-ui-scale, 1)), 48px);
      height: clamp(44px, calc(48px * var(--android-ui-scale, 1)), 48px);
    }

    .nav-actions {
      position: relative;
      z-index: 102;
      gap: var(
        --android-space-xs,
        clamp(4px, calc(6px * var(--android-ui-scale, 1)), 6px)
      ) !important;
      flex-shrink: 0;
    }

    .mobile-user-entry {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      flex-shrink: 0;
      min-width: var(--android-touch-target, 44px);
      -webkit-app-region: no-drag;
    }
  }
}

@media (max-width: 420px) {
  .nav {
    gap: 6px;
    height: calc(
      clamp(52px, calc(60px * var(--android-ui-scale, 1)), 60px) + var(--safe-area-top, 0px)
    );
    padding: var(--safe-area-top, 0px)
      var(
        --android-content-padding-right,
        clamp(5px, calc(10px * var(--android-ui-scale, 1)), 10px)
      )
      0
      var(--android-content-padding-left, clamp(5px, calc(10px * var(--android-ui-scale, 1)), 10px));

    .nav-main {
      margin-left: 4px;
      --mobile-nav-action-reserve: calc(
        var(--android-touch-target, 46px) + var(--android-touch-target, 46px) +
          var(--android-touch-target, 46px) + var(--android-space-xs, 7px) +
          var(--android-space-xs, 7px) + 4px
      );
    }
  }
}
</style>

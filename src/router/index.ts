import { createRouter, createWebHashHistory, type Router } from "vue-router";
import { isLogin } from "@/utils/auth";
import { isAndroidApp, isElectron } from "@/utils/env";
import { openUserLogin } from "@/utils/modal";
import routes from "./routes";

const router: Router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach((to, from, next) => {
  if (!isElectron && to.path !== from.path) {
    window.$loadingBar?.start();
  }

  if (to.meta.needLogin && !isLogin()) {
    if (!isElectron) window.$loadingBar?.error();
    window.$message?.warning("请登录后使用");
    openUserLogin();
    return;
  }

  if (to.meta.needApp && !isElectron && !isAndroidApp) {
    window.$message?.warning("该功能仅客户端可用");
    next("/403");
    return;
  }

  next();
});

router.afterEach((to, from) => {
  window.$loadingBar?.finish();

  if (to.fullPath.split("#")[0] !== from.fullPath.split("#")[0]) {
    requestAnimationFrame(() => {
      const mainContent = document.getElementById("main-content");
      if (mainContent) {
        const scrollContainer = mainContent.querySelector(
          ".n-scrollbar-container",
        ) as HTMLElement | null;
        if (scrollContainer) scrollContainer.scrollTop = 0;
      }
    });
  }
});

export default router;

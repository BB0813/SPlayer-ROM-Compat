import type { AndroidSystemInfo } from "@/platform/bridge/types";

export type AndroidRomFamily =
  | "hyperos"
  | "miui"
  | "harmonyos"
  | "emui"
  | "magicos"
  | "coloros"
  | "originos"
  | "oneui"
  | "flyme"
  | "smartisan"
  | "generic";

export type AndroidRomRiskLevel = "low" | "medium" | "high";

export interface AndroidRomProfile {
  family: AndroidRomFamily;
  displayName: string;
  riskLevel: AndroidRomRiskLevel;
  riskLabel: string;
  requiredActions: string[];
  recommendedActions: string[];
  knownIssues: string[];
  settingsGuides: string[];
  supportsTaskLockGuide: boolean;
}

const normalize = (value?: string | null): string => value?.trim().toLowerCase() ?? "";

const includesSome = (value: string, keywords: string[]): boolean => {
  return keywords.some((keyword) => value.includes(keyword));
};

const resolveRomFamily = (info: AndroidSystemInfo): AndroidRomFamily => {
  const manufacturer = normalize(info.manufacturer);
  const brand = normalize(info.brand);
  const romName = normalize(info.romName);
  const joined = [manufacturer, brand, romName].join(" ");

  if (includesSome(joined, ["hyperos"])) return "hyperos";
  if (includesSome(joined, ["miui"])) return "miui";
  if (includesSome(joined, ["harmony", "hongmeng"])) return "harmonyos";
  if (includesSome(joined, ["emui"])) return "emui";
  if (includesSome(joined, ["magicos", "honor"])) return "magicos";
  if (includesSome(joined, ["coloros", "oppo", "oneplus", "realme", "oxygenos"])) {
    return "coloros";
  }
  if (includesSome(joined, ["originos", "funtouch", "vivo", "iqoo"])) return "originos";
  if (includesSome(joined, ["one ui", "samsung"])) return "oneui";
  if (includesSome(joined, ["flyme", "meizu"])) return "flyme";
  if (includesSome(joined, ["smartisan"])) return "smartisan";
  return "generic";
};

const buildGenericProfile = (displayName: string): AndroidRomProfile => ({
  family: "generic",
  displayName,
  riskLevel: "medium",
  riskLabel: "\u4e2d",
  requiredActions: [
    "\u5173\u95ed\u7535\u6c60\u4f18\u5316",
    "\u786e\u8ba4\u901a\u77e5\u6743\u9650\u5df2\u5f00\u542f",
  ],
  recommendedActions: [
    "\u628a\u5e94\u7528\u52a0\u5165\u540e\u53f0\u4fdd\u62a4\u540d\u5355",
    "\u5fc5\u8981\u65f6\u5728\u6700\u8fd1\u4efb\u52a1\u4e2d\u9501\u5b9a\u5e94\u7528",
  ],
  knownIssues: [
    "\u7cfb\u7edf\u53ef\u80fd\u5728\u606f\u5c4f\u6216\u5185\u5b58\u7d27\u5f20\u65f6\u56de\u6536\u540e\u53f0\u64ad\u653e",
  ],
  settingsGuides: [
    "\u5e94\u7528\u4fe1\u606f",
    "\u7535\u6c60",
    "\u901a\u77e5",
    "\u540e\u53f0\u6d3b\u52a8",
  ],
  supportsTaskLockGuide: true,
});

const profileMap: Record<
  Exclude<AndroidRomFamily, "generic">,
  Omit<AndroidRomProfile, "family" | "displayName">
> = {
  hyperos: {
    riskLevel: "high",
    riskLabel: "\u9ad8",
    requiredActions: [
      "\u5141\u8bb8\u81ea\u542f\u52a8",
      "\u7535\u6c60\u7b56\u7565\u6539\u4e3a\u65e0\u9650\u5236",
      "\u5728\u6700\u8fd1\u4efb\u52a1\u4e2d\u9501\u5b9a\u5e94\u7528",
    ],
    recommendedActions: [
      "\u5f00\u542f\u901a\u77e5\u5e38\u9a7b",
      "\u68c0\u67e5\u540e\u53f0\u5f39\u51fa\u754c\u9762\u6743\u9650",
    ],
    knownIssues: [
      "\u6e05\u7406\u6700\u8fd1\u4efb\u52a1\u540e\u5bb9\u6613\u4e2d\u65ad\u64ad\u653e",
      "\u7701\u7535\u7b56\u7565\u4f1a\u4e3b\u52a8\u9650\u5236\u540e\u53f0\u4efb\u52a1",
    ],
    settingsGuides: [
      "\u81ea\u542f\u52a8\u7ba1\u7406",
      "智能电池",
      "\u540e\u53f0\u5f39\u51fa\u754c\u9762",
      "\u6700\u8fd1\u4efb\u52a1\u9501\u5b9a",
    ],
    supportsTaskLockGuide: true,
  },
  miui: {
    riskLevel: "high",
    riskLabel: "\u9ad8",
    requiredActions: [
      "\u5141\u8bb8\u81ea\u542f\u52a8",
      "\u5173\u95ed\u7535\u6c60\u4f18\u5316",
      "\u5728\u6700\u8fd1\u4efb\u52a1\u4e2d\u9501\u5b9a\u5e94\u7528",
    ],
    recommendedActions: [
      "\u5141\u8bb8\u540e\u53f0\u5f39\u51fa\u754c\u9762",
      "\u4fdd\u6301\u901a\u77e5\u6743\u9650\u5f00\u542f",
    ],
    knownIssues: [
      "MIUI \u4f1a\u9650\u5236\u540e\u53f0\u64ad\u653e\u5b58\u6d3b",
      "\u6e05\u7406\u52a0\u901f\u540e\u53ef\u80fd\u56de\u6536\u64ad\u653e\u5668",
    ],
    settingsGuides: [
      "\u81ea\u542f\u52a8\u7ba1\u7406",
      "电池策略",
      "\u540e\u53f0\u5f39\u51fa\u754c\u9762",
      "\u6700\u8fd1\u4efb\u52a1\u9501\u5b9a",
    ],
    supportsTaskLockGuide: true,
  },
  harmonyos: {
    riskLevel: "high",
    riskLabel: "\u9ad8",
    requiredActions: [
      "\u5e94\u7528\u542f\u52a8\u7ba1\u7406\u6539\u4e3a\u624b\u52a8",
      "\u5141\u8bb8\u540e\u53f0\u6d3b\u52a8",
      "\u5173\u95ed\u7535\u6c60\u4f18\u5316",
    ],
    recommendedActions: [
      "\u4fdd\u6301\u901a\u77e5\u6743\u9650\u5f00\u542f",
      "\u628a\u5e94\u7528\u52a0\u5165\u53d7\u4fdd\u62a4\u5e94\u7528",
    ],
    knownIssues: [
      "\u5e94\u7528\u542f\u52a8\u7ba1\u7406\u9ed8\u8ba4\u53ef\u80fd\u9650\u5236\u540e\u53f0\u64ad\u653e",
      "\u7cfb\u7edf\u7ba1\u5bb6\u53ef\u80fd\u7ec8\u6b62\u540e\u53f0\u4efb\u52a1",
    ],
    settingsGuides: [
      "\u5e94\u7528\u542f\u52a8\u7ba1\u7406",
      "\u7535\u6c60",
      "\u53d7\u4fdd\u62a4\u5e94\u7528",
      "\u901a\u77e5",
    ],
    supportsTaskLockGuide: true,
  },
  emui: {
    riskLevel: "high",
    riskLabel: "\u9ad8",
    requiredActions: [
      "\u5e94\u7528\u542f\u52a8\u7ba1\u7406\u6539\u4e3a\u624b\u52a8",
      "\u5141\u8bb8\u540e\u53f0\u8fd0\u884c",
      "\u5173\u95ed\u7535\u6c60\u4f18\u5316",
    ],
    recommendedActions: [
      "\u5728\u6700\u8fd1\u4efb\u52a1\u4e2d\u9501\u5b9a\u5e94\u7528",
      "\u4fdd\u6301\u901a\u77e5\u6743\u9650\u5f00\u542f",
    ],
    knownIssues: [
      "\u7cfb\u7edf\u7ba1\u5bb6\u53ef\u80fd\u9650\u5236\u81ea\u542f\u52a8\u548c\u5173\u8054\u542f\u52a8",
      "\u606f\u5c4f\u540e\u64ad\u653e\u53ef\u80fd\u88ab\u56de\u6536",
    ],
    settingsGuides: [
      "\u5e94\u7528\u542f\u52a8\u7ba1\u7406",
      "\u53d7\u4fdd\u62a4\u5e94\u7528",
      "电池优化",
      "\u901a\u77e5",
    ],
    supportsTaskLockGuide: true,
  },
  magicos: {
    riskLevel: "high",
    riskLabel: "\u9ad8",
    requiredActions: [
      "\u5141\u8bb8\u81ea\u542f\u52a8",
      "\u5141\u8bb8\u5173\u8054\u542f\u52a8\u4e0e\u540e\u53f0\u6d3b\u52a8",
      "\u5173\u95ed\u7535\u6c60\u4f18\u5316",
    ],
    recommendedActions: [
      "\u628a\u5e94\u7528\u52a0\u5165\u540e\u53f0\u4fdd\u62a4\u540d\u5355",
      "\u5728\u6700\u8fd1\u4efb\u52a1\u4e2d\u9501\u5b9a\u5e94\u7528",
    ],
    knownIssues: [
      "\u8363\u8000\u7ba1\u5bb6\u4f1a\u9650\u5236\u540e\u53f0\u4fdd\u6d3b",
      "\u6e05\u7406\u6700\u8fd1\u4efb\u52a1\u540e\u5a92\u4f53\u4f1a\u8bdd\u53ef\u80fd\u88ab\u7ec8\u6b62",
    ],
    settingsGuides: [
      "\u5e94\u7528\u542f\u52a8\u7ba1\u7406",
      "\u540e\u53f0\u6d3b\u52a8",
      "电池优化",
      "\u6700\u8fd1\u4efb\u52a1\u9501\u5b9a",
    ],
    supportsTaskLockGuide: true,
  },
  coloros: {
    riskLevel: "high",
    riskLabel: "\u9ad8",
    requiredActions: [
      "\u5141\u8bb8\u81ea\u542f\u52a8",
      "\u5141\u8bb8\u540e\u53f0\u5f39\u51fa\u754c\u9762",
      "\u5173\u95ed\u667a\u80fd\u7701\u7535\u9650\u5236",
    ],
    recommendedActions: [
      "\u5141\u8bb8\u540e\u53f0\u6d3b\u52a8",
      "\u5f00\u542f\u901a\u77e5\u5e38\u9a7b",
    ],
    knownIssues: [
      "ColorOS \u53ef\u80fd\u62e6\u622a\u540e\u53f0\u5f39\u51fa\u548c\u5173\u8054\u542f\u52a8",
      "\u7701\u7535\u7b56\u7565\u53ef\u80fd\u6682\u505c\u540e\u53f0\u64ad\u653e",
    ],
    settingsGuides: [
      "\u81ea\u542f\u52a8\u7ba1\u7406",
      "\u540e\u53f0\u5f39\u51fa\u754c\u9762",
      "\u8017\u7535\u7ba1\u7406",
      "\u901a\u77e5",
    ],
    supportsTaskLockGuide: true,
  },
  originos: {
    riskLevel: "high",
    riskLabel: "\u9ad8",
    requiredActions: [
      "\u5141\u8bb8\u81ea\u542f\u52a8",
      "\u5173\u95ed\u540e\u53f0\u9ad8\u8017\u7535\u9650\u5236",
      "\u5141\u8bb8\u540e\u53f0\u5f39\u51fa\u754c\u9762",
    ],
    recommendedActions: [
      "\u5728\u6700\u8fd1\u4efb\u52a1\u4e2d\u9501\u5b9a\u5e94\u7528",
      "\u4fdd\u6301\u901a\u77e5\u6743\u9650\u5f00\u542f",
    ],
    knownIssues: [
      "vivo/iQOO \u5bf9\u540e\u53f0\u97f3\u9891\u56de\u6536\u8f83\u4e3a\u79ef\u6781",
      "高强度耗电管理可能会直接终止播放",
    ],
    settingsGuides: [
      "\u81ea\u542f\u52a8\u7ba1\u7406",
      "\u9ad8 \u8017\u7535\u7ba1\u7406",
      "悬浮窗 / 后台弹出界面",
      "\u6700\u8fd1\u4efb\u52a1\u9501\u5b9a",
    ],
    supportsTaskLockGuide: true,
  },
  oneui: {
    riskLevel: "medium",
    riskLabel: "\u4e2d",
    requiredActions: [
      "\u5173\u95ed\u7535\u6c60\u4f18\u5316",
      "\u786e\u8ba4\u901a\u77e5\u6743\u9650\u5df2\u5f00\u542f",
    ],
    recommendedActions: [
      "\u5728\u7535\u6c60\u8bbe\u7f6e\u4e2d\u6392\u9664\u4f11\u7720\u5e94\u7528",
      "\u5141\u8bb8\u540e\u53f0\u8fd0\u884c",
    ],
    knownIssues: [
      "\u7701\u7535\u6a21\u5f0f\u6216\u4f11\u7720\u5e94\u7528\u53ef\u80fd\u4e2d\u65ad\u540e\u53f0\u64ad\u653e",
    ],
    settingsGuides: ["\u7535\u6c60", "\u901a\u77e5", "\u540e\u53f0\u4f7f\u7528\u9650\u5236"],
    supportsTaskLockGuide: false,
  },
  flyme: {
    riskLevel: "medium",
    riskLabel: "\u4e2d",
    requiredActions: [
      "\u5141\u8bb8\u540e\u53f0\u8fd0\u884c",
      "\u5173\u95ed\u7535\u6c60\u4f18\u5316",
    ],
    recommendedActions: ["\u5f00\u542f\u901a\u77e5\u6743\u9650", "按需在最近任务中锁定应用"],
    knownIssues: ["\u7cfb\u7edf\u6e05\u7406\u540e\u53ef\u80fd\u7ec8\u6b62\u540e\u53f0\u4efb\u52a1"],
    settingsGuides: ["\u6743\u9650\u7ba1\u7406", "\u7535\u6c60 Manager", "\u901a\u77e5"],
    supportsTaskLockGuide: true,
  },
  smartisan: {
    riskLevel: "medium",
    riskLabel: "\u4e2d",
    requiredActions: [
      "\u786e\u8ba4\u540e\u53f0\u8fd0\u884c\u6743\u9650",
      "\u5173\u95ed\u7535\u6c60\u4f18\u5316",
    ],
    recommendedActions: [
      "\u5f00\u542f\u901a\u77e5\u6743\u9650",
      "\u51cf\u5c11\u7cfb\u7edf\u6e05\u7406\u9650\u5236",
    ],
    knownIssues: ["\u6e05\u7406\u7b56\u7565\u53ef\u80fd\u5f71\u54cd\u957f\u65f6\u95f4\u64ad\u653e"],
    settingsGuides: ["\u5e94\u7528\u7ba1\u7406", "\u7535\u6c60", "\u901a\u77e5"],
    supportsTaskLockGuide: false,
  },
};

export const resolveAndroidRomProfile = (
  info: AndroidSystemInfo | null,
): AndroidRomProfile | null => {
  if (!info) return null;

  const displayName =
    info.romName?.trim() || `${info.manufacturer} ${info.brand}`.trim() || "Android";
  const family = resolveRomFamily(info);

  if (family === "generic") {
    return buildGenericProfile(displayName);
  }

  return {
    family,
    displayName,
    ...profileMap[family],
  };
};

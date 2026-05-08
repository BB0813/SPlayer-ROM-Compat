<template>
  <n-flex class="android-ui-scale-control" vertical :size="12">
    <n-flex class="scale-editor" align="center" :wrap="false" :size="12">
      <n-slider
        class="scale-slider"
        :value="scaleValue"
        :min="minScale"
        :max="maxScale"
        :step="1"
        :marks="scaleMarks"
        :format-tooltip="formatTooltip"
        @update:value="updateScale"
      />
      <n-input-number
        class="scale-input"
        :value="scaleValue"
        :min="minScale"
        :max="maxScale"
        :step="1"
        :show-button="false"
        @update:value="updateScaleFromInput"
      >
        <template #suffix>%</template>
      </n-input-number>
    </n-flex>
    <n-flex class="scale-presets" :size="8">
      <n-button
        v-for="preset in scalePresets"
        :key="preset"
        size="small"
        secondary
        :type="scaleValue === preset ? 'primary' : 'default'"
        @click="updateScale(preset)"
      >
        {{ preset }}%
      </n-button>
    </n-flex>
    <n-text class="scale-tip" :depth="3">
      调整后立即生效；数值越小界面越紧凑，适合不同分辨率和 ROM 的显示密度。
    </n-text>
  </n-flex>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSettingStore } from "@/stores";

const minScale = 60;
const maxScale = 110;
const scalePresets = [60, 70, 80, 90, 100] as const;
const scaleMarks = {
  60: "60%",
  70: "70%",
  80: "80%",
  90: "90%",
  100: "100%",
  110: "110%",
};

const settingStore = useSettingStore();

const clampScale = (value: unknown) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 80;
  return Math.min(maxScale, Math.max(minScale, Math.round(numericValue)));
};

const scaleValue = computed(() => clampScale(settingStore.androidUiScale));

const updateScale = (value: number | [number, number]) => {
  const nextValue = Array.isArray(value) ? value[0] : value;
  settingStore.androidUiScale = clampScale(nextValue);
};

const updateScaleFromInput = (value: number | null) => {
  updateScale(value ?? 80);
};

const formatTooltip = (value: number) => `${value}%`;
</script>

<style scoped lang="scss">
.android-ui-scale-control {
  width: min(100%, 460px);
}

.scale-editor {
  width: 100%;
}

.scale-slider {
  flex: 1;
  min-width: 0;
  padding: 12px 4px 22px;
  touch-action: none;
}

.scale-input {
  width: 92px;
  flex: 0 0 92px;
}

.scale-presets {
  flex-wrap: wrap;
}

.scale-tip {
  font-size: 12px;
  line-height: 1.5;
}

:deep(.n-slider),
:deep(.n-slider .n-slider-rail),
:deep(.n-slider .n-slider-handle) {
  touch-action: none;
}

@media (max-width: 768px) {
  .android-ui-scale-control {
    width: 100%;
  }

  .scale-editor {
    align-items: stretch;
  }

  .scale-input {
    width: 84px;
    flex-basis: 84px;
  }
}
</style>

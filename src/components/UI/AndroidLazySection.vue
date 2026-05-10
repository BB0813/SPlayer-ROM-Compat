<template>
  <div ref="rootRef" class="android-lazy-section">
    <slot v-if="shouldRender" />
    <div v-else class="android-lazy-placeholder" :style="{ minHeight: `${placeholderHeight}px` }">
      <n-skeleton text round :repeat="2" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** 是否启用懒渲染 */
    enabled?: boolean;
    /** 是否立即渲染 */
    eager?: boolean;
    /** 占位高度 */
    placeholderHeight?: number;
  }>(),
  {
    enabled: false,
    eager: false,
    placeholderHeight: 220,
  },
);

const rootRef = ref<HTMLElement>();
const isVisible = useElementVisibility(rootRef);
const hasRendered = ref(false);

const shouldRender = computed(() => !props.enabled || props.eager || hasRendered.value);

watch(
  () => [props.enabled, props.eager, isVisible.value] as const,
  ([enabled, eager, visible]) => {
    if (!enabled || eager || visible) {
      hasRendered.value = true;
    }
  },
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.android-lazy-section {
  width: 100%;
  min-width: 0;
}

.android-lazy-placeholder {
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  padding: 16px 8px;
  contain: layout paint;
}
</style>

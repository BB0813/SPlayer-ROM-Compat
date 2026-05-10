<!-- 图片组件 -->
<template>
  <div
    ref="imgContainer"
    :key="src"
    class="s-image"
    :class="{ round }"
    :style="{ width: size + 'px', height: size + 'px' }"
  >
    <!-- 加载图片 -->
    <Transition name="fade">
      <img v-if="shouldRenderLoading" :src="defaultSrc" class="loading" alt="loading" />
    </Transition>
    <!-- 真实图片 -->
    <img
      v-if="imgSrc"
      :key="imgSrc"
      ref="imgRef"
      :src="imgSrc"
      :alt="alt || 'image'"
      :class="['cover', { loaded: isLoaded }]"
      :decoding="decodeAsync ? 'async' : 'auto'"
      :loading="nativeLazy ? 'lazy' : 'eager'"
      :style="{ objectFit: objectFit }"
      :crossorigin="crossorigin"
      @load="imageLoaded"
      @error="imageError"
    />
  </div>
</template>

<script setup lang="ts">
import { enqueueAndroidImageLoad } from "@/composables/useAndroidImageLoadQueue";
import { useSettingStore, useStatusStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";

const props = withDefaults(
  defineProps<{
    /** 图片地址 */
    src: string | undefined;
    /** 默认图片 */
    defaultSrc?: string;
    /** 图片描述 */
    alt?: string;
    /** 图片大小 */
    size?: number;
    /** 图片填充方式 */
    objectFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
    /** 是否进行可视状态变化 */
    observeVisibility?: boolean;
    /** 在不可视时是否释放图片以回收内存 */
    releaseOnHide?: boolean;
    /** 是否使用浏览器异步解码 */
    decodeAsync?: boolean;
    /** 是否使用原生懒加载 */
    nativeLazy?: boolean;
    /** 跨域 */
    crossorigin?: "" | "anonymous" | "use-credentials" | undefined;
    /** 圆角 */
    round?: boolean;
  }>(),
  {
    defaultSrc: "/images/song.jpg?asset",
    observeVisibility: true,
    releaseOnHide: false,
    decodeAsync: true,
    nativeLazy: true,
    objectFit: "cover",
  },
);

const emit = defineEmits<{
  // 加载完成
  load: [e: Event];
  // 加载失败
  error: [e: Event];
  // 可视状态变化
  "update:show": [show: boolean];
}>();

const settingStore = useSettingStore();
const statusStore = useStatusStore();

// 图片数据
const imgRef = ref<HTMLImageElement>();
const imgSrc = ref<string>();
const pendingImgSrc = ref<string>();
const imgContainer = ref<HTMLElement>();

// 是否加载完成
const isLoaded = ref<boolean>(false);
// 可视状态上一次值，避免重复 emit
const lastShowState = ref<boolean | null>(null);
// 加载竞态 token，防止旧图片回调覆盖新状态
const loadToken = ref<number>(0);
const currentToken = ref<number>(0);
let cancelQueuedImageLoad: (() => void) | null = null;

// 是否可视
const isCanLook = useElementVisibility(imgContainer);
const shouldReleaseOnHide = computed(
  () =>
    props.releaseOnHide ||
    (isAndroidApp &&
      settingStore.androidPerformanceMode &&
      statusStore.playStatus &&
      !statusStore.showFullPlayer),
);
const shouldQueueImageLoad = computed(
  () =>
    isAndroidApp &&
    settingStore.androidPerformanceMode &&
    statusStore.playStatus &&
    !statusStore.showFullPlayer,
);
const shouldRenderLoading = computed(
  () => !isLoaded.value && (!shouldReleaseOnHide.value || isCanLook.value),
);

const cancelPendingImageLoad = () => {
  if (!cancelQueuedImageLoad) return;
  cancelQueuedImageLoad();
  cancelQueuedImageLoad = null;
  pendingImgSrc.value = undefined;
};

const applyImageSource = (src: string | undefined) => {
  if (imgSrc.value === src) return;
  loadToken.value += 1;
  currentToken.value = loadToken.value;
  isLoaded.value = false;
  imgSrc.value = src;
};

const releaseImageSource = () => {
  cancelPendingImageLoad();
  if (imgSrc.value === undefined && !isLoaded.value) return;
  loadToken.value += 1;
  currentToken.value = loadToken.value;
  isLoaded.value = false;
  imgSrc.value = undefined;
};

const setImageSource = (src: string | undefined) => {
  if (imgSrc.value === src && pendingImgSrc.value === undefined) return;
  cancelPendingImageLoad();

  if (!src || !shouldQueueImageLoad.value || src === props.defaultSrc) {
    applyImageSource(src);
    return;
  }

  // 播放态排队加载封面，避免大量图片同时解码
  releaseImageSource();
  pendingImgSrc.value = src;
  cancelQueuedImageLoad = enqueueAndroidImageLoad(() => {
    if (pendingImgSrc.value !== src) return;
    if (props.observeVisibility && !isCanLook.value) return;
    pendingImgSrc.value = undefined;
    cancelQueuedImageLoad = null;
    applyImageSource(src);
  });
};

// 图片加载完成
const imageLoaded = (e: Event) => {
  // 竞态保护：仅响应最新一次设置的图片
  if (currentToken.value !== loadToken.value) return;
  if (isLoaded.value) return;
  isLoaded.value = true;
  emit("load", e);
};

// 图片加载失败
const imageError = (e: Event) => {
  // 竞态保护
  if (currentToken.value !== loadToken.value) return;
  isLoaded.value = false;
  // 避免默认图也反复触发导致死循环
  if (imgSrc.value !== props.defaultSrc) {
    setImageSource(props.defaultSrc);
  }
  emit("error", e);
};

// 可视状态变化（可控）
watch(
  isCanLook,
  (show) => {
    if (!props.observeVisibility) return;
    // 去重：仅在状态变化时触发
    if (lastShowState.value !== show) {
      lastShowState.value = show;
      emit("update:show", show);
    }
    if (show) {
      // 进入可视区再加载
      setImageSource(props.src);
    } else if (shouldReleaseOnHide.value) {
      // 释放图片以回收内存
      releaseImageSource();
    }
  },
  { immediate: true },
);

// 监听 src 变化
watch(
  () => props.src,
  (val) => {
    if (!props.observeVisibility || isCanLook.value) {
      setImageSource(val);
      return;
    }
    if (shouldReleaseOnHide.value) releaseImageSource();
  },
  { immediate: true },
);

// 播放态切换时释放已离屏图片
watch(shouldReleaseOnHide, (releaseOnHide) => {
  if (releaseOnHide && props.observeVisibility && !isCanLook.value) {
    releaseImageSource();
  }
});

onUnmounted(() => {
  try {
    if (imgRef.value) imgRef.value.src = "";
  } catch {
    /* empty */
  }
  releaseImageSource();
  imgRef.value = undefined;
  imgContainer.value = undefined;
});
</script>

<style lang="scss" scoped>
.s-image {
  position: relative;
  width: 100%;
  height: 100%;
  img {
    width: 100%;
    height: 100%;
    overflow: hidden;
    transition: all 0.3s;
  }
  .loading {
    position: absolute;
    // top: 0;
    // left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
  }
  .cover {
    // position: absolute;
    // top: 0;
    // left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    opacity: 0;
    &.loaded {
      opacity: 1;
    }
  }
  &.round {
    border-radius: 50%;
    overflow: hidden;
  }
}
</style>

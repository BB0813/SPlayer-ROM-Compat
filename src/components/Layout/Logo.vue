<template>
  <img
    :src="logoSrc"
    :alt="appName"
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="app-logo"
  />
</template>

<script setup lang="ts">
defineProps({
  size: {
    type: Number,
    default: 36,
  },
});

const appName = "SPlayer-ROM-Compat";
const logoSrc = "/icons/logo-icon.png?asset";
</script>

<style lang="scss" scoped>
.app-logo {
  display: block;
  object-fit: contain;
  flex-shrink: 0;
}
</style>

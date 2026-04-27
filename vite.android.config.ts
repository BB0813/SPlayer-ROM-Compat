import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { defineConfig } from "vite";
import AutoImport from "unplugin-auto-import/vite";
import { NaiveUiResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";
import wasm from "vite-plugin-wasm";

const commonResolve = {
  alias: {
    "@": resolve(__dirname, "src/"),
    "@emi": resolve(__dirname, "native/external-media-integration"),
    "@shared": resolve(__dirname, "src/types/shared"),
    "@opencc": resolve(__dirname, "native/ferrous-opencc-wasm/pkg"),
    "@native": resolve(__dirname, "native"),
  },
};

export default defineConfig({
  base: "https://appassets.androidplatform.net/assets/www/",
  publicDir: resolve(__dirname, "public"),
  plugins: [
    vue(),
    AutoImport({
      imports: [
        "vue",
        "vue-router",
        "@vueuse/core",
        {
          "naive-ui": ["useDialog", "useMessage", "useNotification", "useLoadingBar"],
        },
      ],
      eslintrc: {
        enabled: true,
        filepath: "./auto-eslint.mjs",
      },
    }),
    Components({
      resolvers: [NaiveUiResolver()],
    }),
    wasm(),
  ],
  resolve: commonResolve,
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ["legacy-js-api"],
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "android-web-dist"),
    emptyOutDir: true,
    minify: "terser",
    sourcemap: false,
    chunkSizeWarningLimit: 3200,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        loading: resolve(__dirname, "web/loading/index.html"),
      },
      external: ["external-media-integration.node"],
      output: {
        manualChunks: {
          stores: ["src/stores/data.ts", "src/stores/index.ts"],
        },
      },
    },
    terserOptions: {
      compress: {
        pure_funcs: ["console.log"],
      },
    },
  },
});

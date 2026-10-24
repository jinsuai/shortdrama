import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

// 把 workspace 包直接指向 packages/ 源码，避免 node_modules 里的旧拷贝导致改动不生效
const r = (p) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), p);

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // node_modules_old 是历史备份目录，其中有磁盘损坏的文件，
      // chokidar 扫描时会 lstat 失败并让 dev server 直接崩溃，必须排除。
      ignored: ['**/src-tauri/target/**', '**/node_modules/**', '**/node_modules_old/**', '**/dist/**'],
    },
  },
  build: {
    // 必须清空旧产物：之前关掉这项后，dist/assets 累积了上百个历史 chunk，
    // 打包时会全部塞进安装包。
    // 注：若在带有 safe-delete 拦截的沙箱里构建，fs.rmSync 可能超时，
    // 那种情况下先手动移走 dist 目录再 build。
    emptyOutDir: true,
  },
  css: {
    preprocessorOptions: {
      scss: { api: "modern" },
    },
  },
  resolve: {
    alias: [
      // 开源 Web 版：把全部 @tauri-apps/* 透明别名到浏览器垫片，去掉桌面壳依赖。
      // 覆盖 src 与 @dual/ui 内部所有 Tauri 导入，无需逐个改文件。
      // 注意：必须匹配「整个」说明符（含 /api/core、/plugin-dialog 等子路径），
      // 否则 @tauri-apps/api/core 会被替换成 tauri-shim.jsapi/core 而找不到文件。
      { find: /^@tauri-apps(\/.*)?$/, replacement: r("./src/lib/tauri-shim.js") },
      { find: "@dual/agnes-client", replacement: r("./local-packages/agnes-client/src/index.js") },
      { find: "@dual/glm-client", replacement: r("./local-packages/glm-client/src/index.js") },
      { find: "@dual/ui", replacement: r("./local-packages/ui/src/index.js") },
    ],
  },
});

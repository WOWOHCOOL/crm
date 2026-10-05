import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  base: '/',
  build: {
    // ⛔ 这里**刻意不写 manualChunks**。曾经有过一份，把 antd / @ant-design
    // 整包归并成一个 chunk，结果是首屏灾难：
    //
    //   入口只用到 antd 的一部分（Layout/Menu/Form/Input/Modal/Drawer/Button/
    //   message/Spin…），但整包归并后，入口一旦引用其中任意一个模块，
    //   **整个 chunk 都会被 modulepreload**。于是 Table / Select / Upload /
    //   DatePicker / Image / Tree / InputNumber / Popconfirm / Segmented 等
    //   11 个首屏根本用不到的组件族（含 rc-table、rc-select、rc-picker、
    //   dayjs）全被算进关键路径 —— 实测首屏静态闭包 1667 KB / 496 KB gzip。
    //
    // 现在交给 Rolldown 按真实引用关系分包，首屏静态闭包降到 1064 KB / 325 KB gzip
    // （−36% / −34%）。懒加载路由各自只带走自己用到的那部分组件。
    //
    // ⚠️ 如果将来确实需要拆 chunk 做缓存优化，**别用「按包名整包归并」的写法**：
    // 实测这个 Rolldown 版本会把共享依赖倒进被命名的 chunk 里（曾观察到
    // 名为 supabase-*.js 的 chunk 里装了 173 个 antd 模块、名为 charts-*.js 的
    // chunk 里装了 react/react-dom），进而把无关代码拖上关键路径。
    //
    // 验证手段：`node %TEMP%/crm-lab/import-graph.cjs dist`
    // —— 它解析真实 import 语句算出首屏静态闭包，比 grep 可靠
    //    （产物里有 __vite__mapDeps 这类纯文件名数组，grep 会误判成引用）。
    rollupOptions: {},
  },
});

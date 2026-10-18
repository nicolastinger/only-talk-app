import { defineConfig } from '@umijs/max';
import routes from './src/route';
import tauriConfig from '../../src-tauri/tauri.conf.json';

/**
 * 应用版本号单一数据源: src-tauri/tauri.conf.json(`version`)。
 * 打包后由 Tauri 运行时 getVersion() 提供同一版本; 浏览器直接开 dev server(无 Tauri 运行时)时,
 * 通过 define 注入 __APP_VERSION__ 兜底展示, 避免写死造成的版本号不一致。
 */
export default defineConfig({
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: false,
  locale: {
    default: 'zh-CN',
    antd: true,
    title: true,
    baseNavigator: true,
    useLocalStorage: true,
  },
  routes,
  npmClient: 'pnpm',
  esbuildMinifyIIFE: true,
  define: {
    __APP_VERSION__: tauriConfig.version,
  },
  // 精细化分包：把 node_modules 依赖按粒度拆分，缩小首屏主包 umi.js 体积
  codeSplitting: {
    jsStrategy: 'granularChunks',
  }
});

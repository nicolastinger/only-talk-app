import { defineConfig } from '@umijs/max';
import routes from './src/route';

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
  // 精细化分包：把 node_modules 依赖按粒度拆分，缩小首屏主包 umi.js 体积
  codeSplitting: {
    jsStrategy: 'granularChunks',
  }
});

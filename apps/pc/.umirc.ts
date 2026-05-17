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
    locales: ['zh-CN', 'zh-TW', 'en-US'],
  },
  routes,
  npmClient: 'pnpm',
  esbuildMinifyIIFE: true,
});

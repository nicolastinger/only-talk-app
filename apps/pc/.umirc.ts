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
  },
  // 内联首屏 loading（注入 index.html 的 <style>，JS 执行前即生效）
  // #root 为空时显示 loading 动画，React 挂载后 :empty 失效自动消失
  styles: [
    `#root:empty { background: #fff; }
     #root:empty::before {
       content: "";
       position: fixed;
       top: 50%; left: 50%;
       width: 28px; height: 28px;
       margin-top: -48px; margin-left: -14px;
       border: 3px solid #e6f4ff;
       border-top-color: #1677ff;
       border-radius: 50%;
       animation: onlytalk-spin 0.8s linear infinite;
     }
     #root:empty::after {
       content: "Only Talk";
       position: fixed;
       top: 50%; left: 0; right: 0;
       margin-top: 8px;
       text-align: center;
       font-size: 15px;
       color: #999;
       font-family: system-ui, -apple-system, sans-serif;
       letter-spacing: 1px;
     }
     @keyframes onlytalk-spin { to { transform: rotate(360deg); } }`,
  ],
});

/**
 * 官网(apps/web) ESLint 配置: Vue 3 + TypeScript + Vite(纯手写 CSS, 无 Tauri 依赖)
 *
 * 与 apps/mobile 保持同一套社区基线:
 * eslint:recommended + eslint-plugin-vue(vue3-essential) + @typescript-eslint/recommended
 * 只做静态检查, 不做格式化(格式化交给 prettier)。
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-essential',
    'plugin:@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  ignorePatterns: ['dist', 'node_modules', '*.d.ts'],
  overrides: [
    {
      // 纯 TS 文件交给 @typescript-eslint 解析(上面的 vue 预设把 parser 设成了 vue-eslint-parser)
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
    },
    {
      // .vue 内部 <script lang="ts"> 交给 @typescript-eslint 解析
      files: ['*.vue'],
      parser: 'vue-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        extraFileExtensions: ['.vue'],
      },
    },
  ],
  rules: {
    // TypeScript 自身会检查未声明标识符, 关掉 eslint 的 no-undef
    // (否则 .vue 里合法的 DOM 全局类型会误报)
    'no-undef': 'off',
    // 页面/组件统一按路由或目录命名(index.vue), 该约定下不强制多词组件名
    'vue/multi-word-component-names': 'off',
    // 允许用 _ 前缀显式声明"有意不使用"的绑定
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
};

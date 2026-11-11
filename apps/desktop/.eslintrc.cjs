/**
 * PC 桌面端(apps/desktop) ESLint 配置: Vue 3 + TypeScript + Vite
 *
 * 与 apps/mobile 基线一致:
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
  ignorePatterns: ['dist', 'node_modules', 'src-tauri', '*.d.ts'],
  overrides: [
    {
      // 纯 TS 文件交给 @typescript-eslint 解析
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
    'no-undef': 'off',
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
};

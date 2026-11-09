import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import { initAppConfig, setHttpErrorHandler } from '@workspace/services';
import App from './App.vue';
import router from './router';
import { initLocale } from '@/i18n';
import { initTheme } from '@/stores/theme';
import { feedback } from '@/utils/feedback';
import 'ant-design-vue/dist/reset.css';
import '@/global.less';

// 注册统一 HTTP 错误中间层展示器(所有 http 接口的 604/500/401/403/404 等错误都在此统一展示)
setHttpErrorHandler({
  show: (result) => {
    if (result.kind === 'validation' && result.messages?.length) {
      // 604 DTO 校验失败: 逐条输出字段规则错误
      result.messages.forEach((msg) => feedback.message.error(msg));
      return;
    }
    feedback.message.error(result.message || '请求失败');
  },
});

const app = createApp(App);

app.use(router);
app.use(Antd);

async function bootstrap() {
  // 先加载客户端配置(公共库 client_config 表 → 内存), 设置 API base 与默认语言后再挂载应用
  await initAppConfig().catch(() => {});
  await initLocale();
  initTheme();
  app.mount('#app');
}

bootstrap();

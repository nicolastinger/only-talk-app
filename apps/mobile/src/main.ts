import { createApp } from "vue";
import { showToast } from "vant";
import { initAppConfig, setHttpErrorHandler } from "@workspace/services";
import App from "./App.vue";
import router from "./router";
import UserTypeTag from "@/components/UserTypeTag.vue";
import "vant/lib/index.css";
import "@/styles/theme.css";

import {
  NavBar,
  Form,
  Field,
  Button,
  ActionSheet,
  Popup,
  DatePicker,
  Toast,
  Loading,
  Overlay,
  Dialog,
  Switch,
  Progress,
} from "vant";

// 屏蔽 WebView 原生 contextmenu（长按图片/链接/文本弹出的系统菜单）与图片原生拖拽，
// 长按交互统一由应用自定义（如消息多选）
document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("dragstart", (event) => event.preventDefault());
// 兜底：部分 WebView 不遵守 user-select: none，直接拦截文本选择（输入框除外）
document.addEventListener("selectstart", (event) => {
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  ) {
    return;
  }
  event.preventDefault();
});

const app = createApp(App);

// 注册统一 HTTP 错误中间层展示器(所有 http 接口的 604/500/401/403/404 等错误都在此统一展示)
setHttpErrorHandler({
  show: (result) => {
    if (result.kind === "validation" && result.messages?.length) {
      // 604 DTO 校验失败: 逐条输出字段规则错误(单条 toast 换行拼接)
      showToast(result.messages.join("\n"));
      return;
    }
    showToast(result.message || "请求失败");
  },
});

app.use(router);
app.component("UserTypeTag", UserTypeTag);

app.use(NavBar);
app.use(Form);
app.use(Field);
app.use(Button);
app.use(ActionSheet);
app.use(Popup);
app.use(DatePicker);
app.use(Toast);
app.use(Loading);
app.use(Overlay);
app.use(Dialog);
app.use(Switch);
app.use(Progress);

async function bootstrap() {
  // 先加载客户端配置(公共库 client_config 表 → 内存), 设置 API base 后再挂载应用
  await initAppConfig().catch(() => {});
  app.mount("#app");
}

bootstrap();

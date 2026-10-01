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
} from "vant";

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

async function bootstrap() {
  // 先加载客户端配置(公共库 client_config 表 → 内存), 设置 API base 后再挂载应用
  await initAppConfig().catch(() => {});
  app.mount("#app");
}

bootstrap();

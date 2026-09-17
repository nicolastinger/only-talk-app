import { createApp } from "vue";
import { initAppConfig } from "@workspace/services";
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

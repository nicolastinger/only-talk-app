import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
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
} from "vant";

const app = createApp(App);

app.use(router);

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

app.mount("#app");

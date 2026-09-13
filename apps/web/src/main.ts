import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { initTheme } from "./theme";
import { resolveLocaleFromUrl, setLocale } from "./i18n";
import "@/styles/theme.css";
import "@/styles/global.css";

initTheme();
setLocale(resolveLocaleFromUrl());

const app = createApp(App);
app.use(router);
app.mount("#app");

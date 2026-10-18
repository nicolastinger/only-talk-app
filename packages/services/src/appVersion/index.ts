/**
 * 应用版本号(单一数据源: `src-tauri/tauri.conf.json` 的 `version`)
 *
 * - Tauri 运行时(打包后的桌面端 / 移动端): `getVersion()` 返回应用真实版本。
 *   该值由 Tauri 编译期写入(config.version 优先, 缺省回退 Cargo.toml 的版本),
 *   因此与安装包 / 更新包的版本号始终一致。
 * - 非 Tauri 运行时(浏览器直接开 dev server, 如 `pnpm dev` / `pnpm dev:mobile`):
 *   回退到构建期注入的 `__APP_VERSION__`。该值由各 app 的构建配置从
 *   `src-tauri/tauri.conf.json` 读取(apps/pc/.umirc.ts、apps/mobile/vite.config.ts),
 *   避免出现"写死 1.0.0"这种与真实版本不一致的展示。
 */
import { getVersion } from "@tauri-apps/api/app";

/** 构建期注入的应用版本号(由各 app 构建配置 define 注入) */
declare const __APP_VERSION__: unknown;

/** 无 Tauri 运行时的兜底版本号(构建配置未注入时为 "dev") */
export const buildAppVersion: string =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__
    ? __APP_VERSION__
    : "dev";

/** 获取应用版本号: 优先读 Tauri 运行时版本, 无 Tauri 环境回退到构建期注入版本 */
export const getAppVersion = async (): Promise<string> => {
  try {
    return await getVersion();
  } catch {
    return buildAppVersion;
  }
};

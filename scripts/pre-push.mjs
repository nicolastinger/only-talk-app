#!/usr/bin/env node
/**
 * pre-push 推送保护钩子(与 CI 对齐的本地拦截):
 *
 *   前端: apps/pc      -> pnpm lint:pc      (max lint: eslint + stylelint)
 *         apps/mobile  -> pnpm lint:mobile  (eslint)
 *         apps/web     -> pnpm lint:web     (eslint)
 *   Rust: src-tauri    -> pnpm lint:rust:fmt    (cargo +nightly fmt --all --check)
 *                         pnpm lint:rust:clippy (cargo +stable clippy --all-targets)
 *
 * 只跑"本次推送确实涉及"的工程, 避免前端改动也要等 clippy;
 * 拿不到推送范围(新分支、浅克隆等)时退化为全量检查。
 * 共享包 packages/** 与根级配置改动会影响全部前端, 因此触发三个前端一起检查。
 *
 * 跳过方式: git push --no-verify / SKIP_GIT_HOOKS=1 / HUSKY=0
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const ZERO_SHA = /^0{40,}$/;

/** 影响全部前端的根级文件 */
const SHARED_PATHS = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'typings.d.ts',
  'scripts/pre-push.mjs',
  '.husky/',
];

const log = (msg) => process.stdout.write(`${msg}\n`);

/** 在仓库根目录执行命令(Windows 下交给 shell 解析 pnpm/cargo 这类包装脚本) */
function exec(command, args, cwd = repoRoot) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: isWindows,
  });
}

/** 读取 git 通过 stdin 传来的 `<local ref> <local sha> <remote ref> <remote sha>` */
function readPushedRefs() {
  // 手动执行脚本时 stdin 是终端, 无法得知推送范围
  if (process.stdin.isTTY) return null;
  try {
    return readFileSync(0, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * 本次推送涉及的文件列表; 返回 null 表示无法确定范围(调用方按全量处理)
 */
function collectChangedFiles() {
  const refs = readPushedRefs();
  if (!refs || refs.length === 0) return null;

  const files = new Set();
  let unknown = false;

  for (const ref of refs) {
    const [, localSha, , remoteSha] = ref.split(/\s+/);
    // 删除远端分支: 没有可检查的内容
    if (!localSha || ZERO_SHA.test(localSha)) continue;
    // 新分支: 没有可比较的基点, 按全量处理
    if (!remoteSha || ZERO_SHA.test(remoteSha)) {
      unknown = true;
      continue;
    }

    const result = exec('git', ['diff', '--name-only', `${remoteSha}..${localSha}`]);
    if (result.status !== 0) {
      unknown = true;
      continue;
    }
    for (const file of result.stdout.split('\n')) {
      const trimmed = file.trim();
      if (trimmed) files.add(trimmed.replace(/\\/g, '/'));
    }
  }

  return unknown ? null : files;
}

function pickTargets(files) {
  if (files === null) {
    return { pc: true, mobile: true, web: true, rust: true, reason: '无法确定推送范围' };
  }

  const targets = { pc: false, mobile: false, web: false, rust: false };

  for (const file of files) {
    if (file.startsWith('apps/pc/')) targets.pc = true;
    else if (file.startsWith('apps/mobile/')) targets.mobile = true;
    else if (file.startsWith('apps/web/')) targets.web = true;

    const shared =
      file.startsWith('packages/') ||
      SHARED_PATHS.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path));
    if (shared) {
      targets.pc = true;
      targets.mobile = true;
      targets.web = true;
    }

    if (file.startsWith('src-tauri/')) targets.rust = true;
  }

  return targets;
}

function buildChecks(targets) {
  const checks = [];

  if (targets.pc) checks.push(['apps/pc lint (eslint + stylelint)', 'pnpm', ['lint:pc']]);
  if (targets.mobile) checks.push(['apps/mobile lint (eslint)', 'pnpm', ['lint:mobile']]);
  if (targets.web) checks.push(['apps/web lint (eslint)', 'pnpm', ['lint:web']]);

  if (targets.rust) {
    // src-tauri 编译时通过 tauri::generate_context! 内嵌前端产物, 缺 dist 会编译失败
    if (!existsSync(join(repoRoot, 'apps', 'pc', 'dist'))) {
      checks.push(['src-tauri 前置检查 (缺少前端产物)', '__missing_dist__', []]);
    } else {
      checks.push(['src-tauri fmt (cargo +nightly fmt --all --check)', 'pnpm', ['lint:rust:fmt']]);
      checks.push(['src-tauri clippy (cargo +stable clippy --all-targets)', 'pnpm', ['lint:rust:clippy']]);
    }
  }

  return checks;
}

function main() {
  if (process.env.SKIP_GIT_HOOKS === '1') {
    log('[pre-push] SKIP_GIT_HOOKS=1, 跳过推送前检查');
    return 0;
  }

  const files = collectChangedFiles();
  const targets = pickTargets(files);
  const checks = buildChecks(targets);

  if (targets.reason) {
    log(`[pre-push] ${targets.reason}, 执行全量检查`);
  } else if (files) {
    log(`[pre-push] 本次推送变更 ${files.size} 个文件`);
  }

  if (checks.length === 0) {
    log('[pre-push] 本次推送未涉及需要检查的工程, 跳过');
    return 0;
  }

  const failures = [];

  log(`[pre-push] 待执行检查: ${checks.map(([label]) => label).join(' | ')}`);

  for (const [label, command, args] of checks) {
    if (command === '__missing_dist__') {
      failures.push(label);
      log(
        '\n[pre-push] ✖ 缺少 apps/pc/dist: src-tauri 编译需要前端产物, 请先执行 `pnpm build` (或 `pnpm dev` 生成一次)',
      );
      continue;
    }

    log(`\n[pre-push] ▶ ${label}`);
    log(`[pre-push]   $ ${command} ${args.join(' ')}`);

    const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', shell: isWindows });
    if (result.status !== 0) failures.push(label);
  }

  log('');
  if (failures.length > 0) {
    log(`[pre-push] ✖ 未通过: ${failures.join(' | ')}`);
    log('[pre-push] 修复后重新提交/推送; 确需临时跳过: git push --no-verify');
    return 1;
  }

  log('[pre-push] ✔ 全部检查通过');
  return 0;
}

process.exit(main());

# Android OpenSSL 交叉编译指南

## 背景

项目的 `rusqlite` 依赖使用了 `bundled-sqlcipher` 特性，它在编译时需要链接 OpenSSL 的 `libcrypto` 库。Android NDK 默认不提供预编译的 OpenSSL 库，直接交叉编译会报错：

```
ld.lld: error: unable to find library -lcrypto
```

## 解决方案概览

使用 **MSYS2 + Android NDK** 在 Windows 上交叉编译 OpenSSL 3.0 静态库，输出到 4 个 Android 目标的专用目录，然后通过 `.cargo/config.toml` 的 `rustflags` 让 Rust 链接器找到它们。

```
.ndk toolchain (clang)
      │
      ▼
perl Configure linux-{arch} --prefix=openssl-android/{rust-target}
      │
      ▼
make -jN → libcrypto.a + libssl.a
      │
      ▼
.cargo/config.toml → rustflags = ["-L", "native=openssl-android/{rust-target}/lib"]
      │
      ▼
cargo build → 链接器找到 -lcrypto ✅
```

## 前置要求

| 工具 | 用途 | 验证命令 |
|------|------|----------|
| MSYS2 | 提供 POSIX 环境（Perl / make / bash） | `C:\msys64\usr\bin\bash.exe --version` |
| Android NDK 29+ | 提供 clang 交叉编译工具链 | 检查 `%LOCALAPPDATA%\Android\Sdk\ndk\29.x` |
| make (MSYS2) | 构建工具 | 安装：`pacman -S make` |

> **为何用 MSYS2 而非 Strawberry Perl？**
> Strawberry Perl 在 Windows 上生成的路径使用反斜杠，OpenSSL Configure 不接受。
> MSYS2 的 Perl 产生 Unix 风格路径（正斜杠），与 OpenSSL 兼容。

## 相关文件

| 文件 | 说明 |
|------|------|
| `scripts/build-openssl-android.sh` | 一键交叉编译脚本（MSYS2 bash） |
| `openssl-android/` | 编译产物输出目录（4 个架构的 `libcrypto.a`） |
| `.cargo/config.toml` | Rust 目标配置，含 `rustflags` 库搜索路径 |
| `src-tauri/.cargo/config.toml` | 同上（src-tauri 下的副本） |

## 使用方法

### 首次执行

```powershell
# 1. 确保 MSYS2 已安装 make
C:\msys64\usr\bin\bash.exe -lc "pacman -S --noconfirm make"

# 2. 运行交叉编译脚本
C:\msys64\usr\bin\bash.exe -lc "cd 'I:/code/rust/umi_gitee/frontend/src-tauri' && bash scripts/build-openssl-android.sh"
```

脚本会自动完成：
- 下载 OpenSSL 3.0.15 源码（首次）
- 对 4 个目标分别执行 Configure → make → make install
- 已编译的架构会跳过（增量缓存）

### 编译的架构

| Configure Target | Rust Target | ABI |
|-----------------|-------------|-----|
| `linux-x86_64` | `x86_64-linux-android` | x86_64 (64-bit) |
| `linux-elf` | `i686-linux-android` | x86 (32-bit) |
| `linux-aarch64` | `aarch64-linux-android` | arm64-v8a |
| `linux-armv4` | `armv7-linux-androideabi` | armeabi-v7a |

### 产物目录结构

```
openssl-android/
├── x86_64-linux-android/lib/
│   ├── libcrypto.a       # ← Rust 链接器需要这个
│   └── libssl.a
├── i686-linux-android/lib/
│   └── ...
├── aarch64-linux-android/lib/
│   └── ...
├── armv7-linux-androideabi/lib/
│   └── ...
└── src/openssl-3.0.15/   # OpenSSL 源码（保留用于增量编译）
```

### OpenSSL 版本升级

编辑 `build-openssl-android.sh` 顶部的变量：

```bash
OPENSSL_VERSION="3.0.15"   # 改为新版本号
```

然后删除旧的输出重新执行。

### NDK 版本/路径变更

如果 NDK 路径不同，有两个地方需要更新：

1. **`build-openssl-android.sh`** — `NDK_PATH` 变量
2. **`.cargo/config.toml`** 和 **`src-tauri/.cargo/config.toml`** — 每个 `[target.*]` 块下的 `ar`、`linker`、`rustflags` 路径

## 故障排除

### `no NDK clang on $PATH`

Windows 上的 Strawberry Perl 产生的路径不兼容。必须使用 **MSYS2 的 bash** 运行脚本。

### `unable to find library -lcrypto` 仍出现

检查 `.cargo/config.toml` 中的 `rustflags` 路径是否正确，以及对应的 `libcrypto.a` 是否存在：

```powershell
ls openssl-android\{arch}\lib\libcrypto.a
```

### x86_64 架构报错 lib64 → lib 问题

OpenSSL 在 64 位 Linux 目标上默认安装到 `lib64/`，脚本已自动处理复制到 `lib/`。

### make: command not found

MSYS2 默认不带 make：

```bash
C:\msys64\usr\bin\bash.exe -lc "pacman -S --noconfirm make"
```

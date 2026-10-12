param(
    [string]$NDKPath = "",
    [int]$ApiLevel = 21
)

$ErrorActionPreference = "Stop"

# 目标：Rust 目标 | clang 前缀 | OpenSSL 输出目录名
$targets = @(
    @{
        RustTarget       = "x86_64-linux-android"
        ClangPrefix      = "x86_64-linux-android"
        OpenSSLDirectory = "x86_64-linux-android"
    },
    @{
        RustTarget       = "i686-linux-android"
        ClangPrefix      = "i686-linux-android"
        OpenSSLDirectory = "i686-linux-android"
    },
    @{
        RustTarget       = "aarch64-linux-android"
        ClangPrefix      = "aarch64-linux-android"
        OpenSSLDirectory = "aarch64-linux-android"
    },
    @{
        RustTarget       = "armv7-linux-androideabi"
        ClangPrefix      = "armv7a-linux-androideabi"
        OpenSSLDirectory = "armv7-linux-androideabi"
    }
)

function Get-DetectedNDKPath {
    if ($env:ANDROID_NDK_HOME -and (Test-Path $env:ANDROID_NDK_HOME)) {
        return $env:ANDROID_NDK_HOME
    }
    $base = "$env:LOCALAPPDATA\Android\Sdk\ndk"
    if (Test-Path $base) {
        $latest = Get-ChildItem -Directory $base |
            Sort-Object { try { [version]$_.Name } catch { [version]"0.0.0" } } -Descending |
            Select-Object -First 1
        if ($latest) {
            return $latest.FullName
        }
    }
    return $null
}

if (-not $NDKPath) {
    $NDKPath = Get-DetectedNDKPath
}

if (-not $NDKPath -or -not (Test-Path $NDKPath)) {
    Write-Host "ERROR: NDK not found. Pass -NDKPath or set ANDROID_NDK_HOME." -ForegroundColor Red
    exit 1
}

$repoRoot = Resolve-Path "$PSScriptRoot\..\.."
$opensslBase = Resolve-Path "$PSScriptRoot\..\openssl-android" -ErrorAction SilentlyContinue
if (-not $opensslBase) {
    Write-Host "WARNING: src-tauri\openssl-android 不存在。请先运行 build-openssl-android.ps1 生成 OpenSSL 库。" -ForegroundColor Yellow
    $opensslBase = Join-Path $repoRoot "src-tauri\openssl-android"
}

$ndkBin = "$NDKPath\toolchains\llvm\prebuilt\windows-x86_64\bin"

function ConvertTo-TomlPath([string]$Path) {
    return $Path.Replace('\', '\\')
}

$lines = @(
    "# 由 scripts/generate-cargo-config.ps1 在本机生成，路径因机器而异，请勿提交到 Git。",
    ""
)

foreach ($target in $targets) {
    $rustTarget = $target.RustTarget
    $lines += "[target.$rustTarget]"
    $lines += "ar = `"$(ConvertTo-TomlPath "$ndkBin\llvm-ar.exe")`""
    $lines += "linker = `"$(ConvertTo-TomlPath "$ndkBin\$($target.ClangPrefix)$ApiLevel-clang.cmd")`""
    $lines += "rustflags = [`"-L`", `"native=$(ConvertTo-TomlPath "$opensslBase\$($target.OpenSSLDirectory)\lib")`"]"
    $lines += ""
}

$config = $lines -join "`r`n"

foreach ($configDir in @("$repoRoot\.cargo", "$repoRoot\src-tauri\.cargo")) {
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
    Set-Content -Path "$configDir\config.toml" -Value $config -Encoding UTF8
    Write-Host "已生成: $configDir\config.toml" -ForegroundColor Green
}
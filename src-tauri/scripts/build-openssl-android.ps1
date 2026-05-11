param(
    [string]$OpenSSLVersion = "3.0.15",
    [string]$NDKPath = "$env:LOCALAPPDATA\Android\Sdk\ndk\29.0.14206865",
    [string]$OutputBase = "$PSScriptRoot\..\openssl-android",
    [int]$ApiLevel = 24
)

$ErrorActionPreference = "Stop"

$NDK_TOOLCHAIN = "$NDKPath\toolchains\llvm\prebuilt\windows-x86_64\bin"
$OPENSSL_SRC = "$OutputBase\src\openssl-$OpenSSLVersion"
$OPENSSL_URL = "https://www.openssl.org/source/openssl-$OpenSSLVersion.tar.gz"

$targets = @(
    @{
        ConfigureTarget = "linux-x86_64"
        RustTarget      = "x86_64-linux-android"
        CC              = "x86_64-linux-android$ApiLevel-clang.cmd"
    },
    @{
        ConfigureTarget = "linux-aarch64"
        RustTarget      = "aarch64-linux-android"
        CC              = "aarch64-linux-android$ApiLevel-clang.cmd"
    },
    @{
        ConfigureTarget = "linux-armv4"
        RustTarget      = "armv7-linux-androideabi"
        CC              = "armv7a-linux-androideabi$ApiLevel-clang.cmd"
    }
)

Write-Host "========================================"  -ForegroundColor Cyan
Write-Host " OpenSSL Android Cross-Compilation Script" -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "OpenSSL Version : $OpenSSLVersion"
Write-Host "NDK Path        : $NDKPath"
Write-Host "API Level       : $ApiLevel"
Write-Host "Output Base     : $OutputBase"
Write-Host ""

# --- Check prerequisites ---
Write-Host "[1/4] Checking prerequisites..." -ForegroundColor Yellow

if (!(Test-Path $NDK_TOOLCHAIN)) {
    Write-Host "ERROR: NDK toolchain not found at: $NDK_TOOLCHAIN" -ForegroundColor Red
    Write-Host "Please update `$NDKPath in this script or install the Android NDK." -ForegroundColor Red
    exit 1
}
Write-Host "  NDK toolchain found." -ForegroundColor Green

$perlOk = $false
try { $null = Get-Command perl -ErrorAction Stop; $perlOk = $true } catch {}
if (-not $perlOk) {
    Write-Host "ERROR: Perl not found. Please install Strawberry Perl (https://strawberryperl.com/)." -ForegroundColor Red
    exit 1
}
Write-Host "  Perl found: $(perl --version | Select-Object -First 1)" -ForegroundColor Green

function Get-MakeCommand {
    foreach ($cmd in @('gmake', 'mingw32-make', 'make')) {
        try { $null = Get-Command $cmd -ErrorAction Stop; return $cmd } catch {}
    }
    return $null
}
$makeCmd = Get-MakeCommand
if (-not $makeCmd) {
    Write-Host "ERROR: make not found. Please install Strawberry Perl (includes gmake)." -ForegroundColor Red
    exit 1
}
Write-Host "  make found: $makeCmd" -ForegroundColor Green

# --- Download OpenSSL ---
Write-Host ""
Write-Host "[2/4] Preparing OpenSSL source..." -ForegroundColor Yellow

New-Item -ItemType Directory -Force -Path "$OutputBase\src" | Out-Null

if (Test-Path "$OPENSSL_SRC\Configure") {
    Write-Host "  OpenSSL source already exists, skipping download." -ForegroundColor Green
} else {
    $archive = "$OutputBase\src\openssl-$OpenSSLVersion.tar.gz"
    if (!(Test-Path $archive)) {
        Write-Host "  Downloading $OPENSSL_URL ..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $OPENSSL_URL -OutFile $archive -UseBasicParsing
    }
    Write-Host "  Extracting..." -ForegroundColor Gray
    tar -xzf $archive -C "$OutputBase\src"
    Write-Host "  Source ready." -ForegroundColor Green
}

# --- Build for each target ---
Write-Host ""
Write-Host "[3/4] Building OpenSSL for Android targets..." -ForegroundColor Yellow

$origPath = $env:PATH
$origCC = $env:CC
$origCXX = $env:CXX
$origAR = $env:AR
$origRANLIB = $env:RANLIB

foreach ($target in $targets) {
    $configureTarget = $target.ConfigureTarget
    $rustTarget = $target.RustTarget
    $ccFile = $target.CC
    $installDir = "$OutputBase\$rustTarget"

    Write-Host ""
    Write-Host "  --- Building for $configureTarget ($rustTarget) ---" -ForegroundColor Cyan

    if (Test-Path "$installDir\lib\libcrypto.a") {
        Write-Host "  Already built, skipping." -ForegroundColor Green
        continue
    }

    New-Item -ItemType Directory -Force -Path $installDir | Out-Null

    $env:PATH = "$NDK_TOOLCHAIN;$origPath"
    $env:CC = "$NDK_TOOLCHAIN\$ccFile"
    $env:CXX = "$NDK_TOOLCHAIN\$ccFile"
    $env:AR = "$NDK_TOOLCHAIN\llvm-ar.exe"
    $env:RANLIB = "$NDK_TOOLCHAIN\llvm-ranlib.exe"

    Push-Location $OPENSSL_SRC

    try {
        if (Test-Path "Makefile") {
            Write-Host "  Cleaning..." -ForegroundColor Gray
            & $makeCmd clean 2>&1 | Out-Null
        }

        Write-Host "  Configuring with CC=$($env:CC)..." -ForegroundColor Gray
        $configureArgs = @(
            $configureTarget,
            "-D__ANDROID_API__=$ApiLevel",
            "--prefix=$installDir",
            "no-shared",
            "no-tests",
            "no-ssl3",
            "no-comp",
            "no-idea",
            "no-mdc2",
            "no-rc5",
            "no-ec2m",
            "no-weak-ssl-ciphers"
        )
        & perl Configure @configureArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Configure failed for $configureTarget" -ForegroundColor Red
            exit 1
        }

        Write-Host "  Compiling..." -ForegroundColor Gray
        & $makeCmd -j$env:NUMBER_OF_PROCESSORS
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Build failed for $configureTarget" -ForegroundColor Red
            exit 1
        }

        Write-Host "  Installing..." -ForegroundColor Gray
        & $makeCmd install_sw
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Install failed for $configureTarget" -ForegroundColor Red
            exit 1
        }

        Write-Host "  Done: $installDir\lib\libcrypto.a" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

$env:PATH = $origPath
$env:CC = $origCC
$env:CXX = $origCXX
$env:AR = $origAR
$env:RANLIB = $origRANLIB

# --- Verify ---
Write-Host ""
Write-Host "[4/4] Verifying output..." -ForegroundColor Yellow

$allOk = $true
foreach ($target in $targets) {
    $rustTarget = $target.RustTarget
    $libPath = "$OutputBase\$rustTarget\lib\libcrypto.a"
    if (Test-Path $libPath) {
        $size = (Get-Item $libPath).Length
        Write-Host "  $rustTarget : libcrypto.a ($([math]::Round($size/1KB, 1)) KB)" -ForegroundColor Green
    } else {
        Write-Host "  $rustTarget : MISSING!" -ForegroundColor Red
        $allOk = $false
    }
}

if ($allOk) {
    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Green
    Write-Host " OpenSSL cross-compilation completed!"    -ForegroundColor Green
    Write-Host " Libraries installed to: $OutputBase"      -ForegroundColor Green
    Write-Host "========================================"  -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERROR: Some libraries are missing." -ForegroundColor Red
    exit 1
}

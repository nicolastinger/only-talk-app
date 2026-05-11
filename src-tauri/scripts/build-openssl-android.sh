#!/bin/bash
set -e

OPENSSL_VERSION="3.0.15"
NDK_PATH="$LOCALAPPDATA/Android/Sdk/ndk/29.0.14206865"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_BASE="$(cd "$SCRIPT_DIR/.." && pwd)/openssl-android"
API_LEVEL=24

NDK_TOOLCHAIN="$NDK_PATH/toolchains/llvm/prebuilt/windows-x86_64/bin"
OPENSSL_SRC="$OUTPUT_BASE/src/openssl-$OPENSSL_VERSION"
OPENSSL_URL="https://www.openssl.org/source/openssl-$OPENSSL_VERSION.tar.gz"

# Convert Windows paths to MSYS2 style
NDK_PATH_MSYS=$(cygpath -u "$NDK_PATH")
NDK_TOOLCHAIN_MSYS=$(cygpath -u "$NDK_TOOLCHAIN")
OUTPUT_BASE_MSYS=$(cygpath -u "$OUTPUT_BASE")
OPENSSL_SRC_MSYS=$(cygpath -u "$OPENSSL_SRC")

TARGETS=(
    "linux-x86_64|x86_64-linux-android|x86_64-linux-android${API_LEVEL}-clang.cmd"
    "linux-elf|i686-linux-android|i686-linux-android${API_LEVEL}-clang.cmd"
    "linux-aarch64|aarch64-linux-android|aarch64-linux-android${API_LEVEL}-clang.cmd"
    "linux-armv4|armv7-linux-androideabi|armv7a-linux-androideabi${API_LEVEL}-clang.cmd"
)

echo "========================================"
echo " OpenSSL Android Cross-Compilation Script"
echo "========================================"
echo "OpenSSL Version : $OPENSSL_VERSION"
echo "NDK Path        : $NDK_PATH_MSYS"
echo "API Level       : $API_LEVEL"
echo "Output Base     : $OUTPUT_BASE_MSYS"
echo ""

# --- Check prerequisites ---
echo "[1/4] Checking prerequisites..."

if [ ! -d "$NDK_TOOLCHAIN_MSYS" ]; then
    echo "ERROR: NDK toolchain not found at: $NDK_TOOLCHAIN_MSYS"
    exit 1
fi
echo "  NDK toolchain found."

echo "  Perl: $(perl --version | head -1)"
echo "  Make: $(make --version | head -1)"

# --- Download OpenSSL ---
echo ""
echo "[2/4] Preparing OpenSSL source..."

mkdir -p "$OUTPUT_BASE_MSYS/src"

if [ -f "$OPENSSL_SRC_MSYS/Configure" ]; then
    echo "  OpenSSL source already exists, skipping download."
else
    ARCHIVE="$OUTPUT_BASE_MSYS/src/openssl-$OPENSSL_VERSION.tar.gz"
    if [ ! -f "$ARCHIVE" ]; then
        echo "  Downloading $OPENSSL_URL ..."
        curl -L -o "$ARCHIVE" "$OPENSSL_URL"
    fi
    echo "  Extracting..."
    tar -xzf "$ARCHIVE" -C "$OUTPUT_BASE_MSYS/src"
    echo "  Source ready."
fi

# --- Build for each target ---
echo ""
echo "[3/4] Building OpenSSL for Android targets..."

JOBS=$(nproc 2>/dev/null || echo 4)

for TARGET_ENTRY in "${TARGETS[@]}"; do
    IFS='|' read -r CONFIGURE_TARGET RUST_TARGET CC_FILE <<< "$TARGET_ENTRY"
    INSTALL_DIR="$OUTPUT_BASE_MSYS/$RUST_TARGET"

    echo ""
    echo "  --- Building for $CONFIGURE_TARGET ($RUST_TARGET) ---"

    if [ -f "$INSTALL_DIR/lib/libcrypto.a" ]; then
        echo "  Already built, skipping."
        continue
    fi

    mkdir -p "$INSTALL_DIR"

    export ANDROID_NDK_ROOT="$NDK_PATH_MSYS"
    export CC="$NDK_TOOLCHAIN_MSYS/$CC_FILE"
    export CXX="$NDK_TOOLCHAIN_MSYS/$CC_FILE"
    export AR="$NDK_TOOLCHAIN_MSYS/llvm-ar.exe"
    export RANLIB="$NDK_TOOLCHAIN_MSYS/llvm-ranlib.exe"

    cd "$OPENSSL_SRC_MSYS"

    if [ -f "Makefile" ]; then
        echo "  Cleaning..."
        make clean > /dev/null 2>&1 || true
    fi

    echo "  Configuring with CC=$CC..."
    perl Configure \
        "$CONFIGURE_TARGET" \
        "-D__ANDROID_API__=$API_LEVEL" \
        "--prefix=$INSTALL_DIR" \
        no-shared \
        no-tests \
        no-ssl3 \
        no-comp \
        no-idea \
        no-mdc2 \
        no-rc5 \
        no-ec2m \
        no-weak-ssl-ciphers

    echo "  Compiling..."
    make -j"$JOBS"

    echo "  Installing..."
    make install_sw

    # OpenSSL uses lib64 for x86_64; ensure files are in lib/
    if [ -d "$INSTALL_DIR/lib64" ] && [ ! -d "$INSTALL_DIR/lib" ]; then
        cp -r "$INSTALL_DIR/lib64" "$INSTALL_DIR/lib"
    fi

    echo "  Done: $INSTALL_DIR/lib/libcrypto.a"
done

# --- Verify ---
echo ""
echo "[4/4] Verifying output..."

ALL_OK=true
for TARGET_ENTRY in "${TARGETS[@]}"; do
    IFS='|' read -r CONFIGURE_TARGET RUST_TARGET CC_FILE <<< "$TARGET_ENTRY"
    INSTALL_DIR="$OUTPUT_BASE_MSYS/$RUST_TARGET"
    LIB_PATH="$INSTALL_DIR/lib/libcrypto.a"
    if [ -f "$LIB_PATH" ]; then
        SIZE=$(stat -c%s "$LIB_PATH" 2>/dev/null || stat -f%z "$LIB_PATH" 2>/dev/null)
        SIZEB=$(( SIZE / 1024 ))
        echo "  $RUST_TARGET : libcrypto.a (${SIZEB} KB)"
    else
        echo "  $RUST_TARGET : MISSING!"
        ALL_OK=false
    fi
done

if [ "$ALL_OK" = true ]; then
    echo ""
    echo "========================================"
    echo " OpenSSL cross-compilation completed!"
    echo " Libraries installed to: $OUTPUT_BASE_MSYS"
    echo "========================================"
else
    echo ""
    echo "ERROR: Some libraries are missing."
    exit 1
fi

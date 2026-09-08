#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
sdk_dir="${FXSDK_PREFIX:-/tools/codex/workspace/.fxsdk-official}"
export PATH="$sdk_dir/bin:$PATH"
export FXSDK_PREFIX="$sdk_dir"
cmake -S "$project_dir/firmware" -B "$project_dir/firmware/build-cg" \
  -DCMAKE_MODULE_PATH="$sdk_dir/lib/cmake/fxsdk" \
  -DCMAKE_TOOLCHAIN_FILE="$sdk_dir/lib/cmake/fxsdk/FXCG50.cmake" \
  -DFXSDK_CMAKE_MODULE_PATH="$sdk_dir/lib/cmake/fxsdk"
cmake --build "$project_dir/firmware/build-cg" -j2

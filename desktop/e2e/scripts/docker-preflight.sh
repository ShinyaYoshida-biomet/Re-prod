#!/usr/bin/env bash
set -euo pipefail

cache_dir="/root/.cache"
toolchain_marker="${cache_dir}/reprod-e2e-toolchain-ok"

if [[ -f "${toolchain_marker}" ]]; then
  exit 0
fi

mkdir -p "${cache_dir}"

if command -v pgrep >/dev/null 2>&1; then
  for _ in {1..60}; do
    if pgrep -x apt-get >/dev/null || pgrep -x dpkg >/dev/null; then
      sleep 2
    else
      break
    fi
  done
fi

collect2_path="$(gcc -print-file-name=collect2 2>/dev/null || true)"
openssl_pc=""
for candidate in /usr/lib/*/pkgconfig/openssl.pc /usr/lib/pkgconfig/openssl.pc; do
  if [[ -e "${candidate}" ]]; then
    openssl_pc="${candidate}"
    break
  fi
done
glib_pc=""
for candidate in /usr/lib/*/pkgconfig/glib-2.0.pc /usr/lib/pkgconfig/glib-2.0.pc; do
  if [[ -e "${candidate}" ]]; then
    glib_pc="${candidate}"
    break
  fi
done

needs_repair=0
if [[ ( -n "${collect2_path}" && -f "${collect2_path}" && ! -s "${collect2_path}" ) || -z "${openssl_pc}" || ! -s "${openssl_pc}" || -z "${glib_pc}" || ! -s "${glib_pc}" ]]; then
  needs_repair=1
fi

if [[ "${needs_repair}" == "1" ]]; then
  apt-get update
  apt-get install --reinstall -y gcc-11 g++-11 libssl-dev libglib2.0-dev pkg-config
  rm -rf /var/lib/apt/lists/*
fi

touch "${toolchain_marker}"

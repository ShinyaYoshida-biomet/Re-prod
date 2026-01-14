#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
IMAGE_NAME="reprod-e2e"
PNPM_STORE_VOLUME="reprod-e2e-pnpm-store"
NODE_MODULES_VOLUME="reprod-e2e-node-modules"
CARGO_REGISTRY_VOLUME="reprod-e2e-cargo-registry"
CARGO_GIT_VOLUME="reprod-e2e-cargo-git"
CARGO_TARGET_VOLUME="reprod-e2e-cargo-target"
DOCKER_MEMORY="${REPROD_E2E_DOCKER_MEMORY:-6g}"
DOCKER_CPUS="${REPROD_E2E_DOCKER_CPUS:-4}"
DOCKERFILE_PATH="${ROOT_DIR}/desktop/e2e/Dockerfile"
DOCKERFILE_LABEL_KEY="reprod.e2e.dockerfile-sha"
DOCKERFILE_SHA="$(shasum -a 256 "${DOCKERFILE_PATH}" | awk '{print $1}')"
KEEP_OLD_IMAGE="${REPROD_E2E_DOCKER_KEEP_OLD_IMAGE:-0}"

FORCE_BUILD=0
MODE="${REPROD_E2E_DOCKER_MODE:-playwright}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      FORCE_BUILD=1
      shift
      ;;
    --webdriver)
      MODE="webdriver"
      shift
      ;;
    --playwright)
      MODE="playwright"
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [[ -n "${1-}" ]]; then
  COMMAND="$*"
else
  if [[ "${MODE}" == "webdriver" ]]; then
    COMMAND="pnpm install --frozen-lockfile && pnpm tauri build --debug --no-bundle && echo '[e2e] starting WebDriverIO tests' && { Xvfb :99 -screen 0 1280x720x24 -nolisten tcp & XVFB_PID=\$!; export DISPLAY=:99; pnpm --filter @reprod/e2e test:webdriver; status=\$?; kill \$XVFB_PID; exit \$status; }"
  else
    COMMAND="pnpm install --frozen-lockfile && pnpm --filter @reprod/e2e test -- --workers=1"
  fi
fi

CURRENT_SHA="$(docker image inspect --format '{{ index .Config.Labels "'"${DOCKERFILE_LABEL_KEY}"'" }}' "${IMAGE_NAME}" 2>/dev/null || true)"
OLD_IMAGE_ID="$(docker image inspect --format '{{ .Id }}' "${IMAGE_NAME}" 2>/dev/null || true)"

if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1 || [[ "${FORCE_BUILD}" -eq 1 ]] || [[ "${CURRENT_SHA}" != "${DOCKERFILE_SHA}" ]]; then
  docker build \
    --label "${DOCKERFILE_LABEL_KEY}=${DOCKERFILE_SHA}" \
    -f "${DOCKERFILE_PATH}" \
    -t "${IMAGE_NAME}" \
    "${ROOT_DIR}"
  if [[ "${KEEP_OLD_IMAGE}" != "1" ]]; then
    NEW_IMAGE_ID="$(docker image inspect --format '{{ .Id }}' "${IMAGE_NAME}" 2>/dev/null || true)"
    if [[ -n "${OLD_IMAGE_ID}" && -n "${NEW_IMAGE_ID}" && "${OLD_IMAGE_ID}" != "${NEW_IMAGE_ID}" ]]; then
      docker image rm "${OLD_IMAGE_ID}" >/dev/null 2>&1 || true
    fi
  fi
fi

docker run --rm -i \
  --memory="${DOCKER_MEMORY}" \
  --cpus="${DOCKER_CPUS}" \
  -e CI=true \
  -e COREPACK_ENABLE_PROMPT=0 \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e PNPM_CONFIG_CONFIRM_MODULES_PURGE=false \
  -e PNPM_CONFIRM_MODULES_PURGE=false \
  -e PNPM_DISABLE_SELF_UPDATE_CHECK=1 \
  -e PNPM_STORE_DIR=/pnpm-store \
  -e PNPM_CONFIG_STORE_DIR=/pnpm-store \
  -e TS_NODE_TRANSPILE_ONLY=1 \
  -e CARGO_TARGET_DIR=/cargo-target \
  -e LOG_LEVEL \
  -e DEBUG \
  -e TAURI_DRIVER_APP \
  -e TAURI_DRIVER_ARGS \
  -e TAURI_DRIVER_HOST \
  -e TAURI_DRIVER_PATH \
  -e TAURI_DRIVER_PORT \
  -e TAURI_DRIVER_READY_TIMEOUT \
  --tmpfs /workspace/.cargo \
  -v "${ROOT_DIR}":/workspace \
  -v "${CARGO_REGISTRY_VOLUME}:/root/.cargo/registry" \
  -v "${CARGO_GIT_VOLUME}:/root/.cargo/git" \
  -v "${CARGO_TARGET_VOLUME}:/cargo-target" \
  -v "${PNPM_STORE_VOLUME}:/pnpm-store" \
  -v "${NODE_MODULES_VOLUME}:/workspace/node_modules" \
  -w /workspace \
  "${IMAGE_NAME}" \
  bash -lc "${COMMAND}"

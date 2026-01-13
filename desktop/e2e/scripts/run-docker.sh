#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
IMAGE_NAME="reprod-e2e"
PNPM_STORE_VOLUME="reprod-e2e-pnpm-store"
NODE_MODULES_VOLUME="reprod-e2e-node-modules"
DOCKER_MEMORY="${REPROD_E2E_DOCKER_MEMORY:-6g}"
DOCKER_CPUS="${REPROD_E2E_DOCKER_CPUS:-4}"
DOCKERFILE_PATH="${ROOT_DIR}/desktop/e2e/Dockerfile"
DOCKERFILE_LABEL_KEY="reprod.e2e.dockerfile-sha"
DOCKERFILE_SHA="$(shasum -a 256 "${DOCKERFILE_PATH}" | awk '{print $1}')"

FORCE_BUILD=0
if [[ "${1-}" == "--build" ]]; then
  FORCE_BUILD=1
  shift
fi

if [[ -n "${1-}" ]]; then
  COMMAND="$*"
else
  COMMAND="pnpm install --frozen-lockfile && pnpm --filter @reprod/e2e test -- --workers=1"
fi

CURRENT_SHA="$(docker image inspect --format '{{ index .Config.Labels "'"${DOCKERFILE_LABEL_KEY}"'" }}' "${IMAGE_NAME}" 2>/dev/null || true)"

if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1 || [[ "${FORCE_BUILD}" -eq 1 ]] || [[ "${CURRENT_SHA}" != "${DOCKERFILE_SHA}" ]]; then
  docker build \
    --label "${DOCKERFILE_LABEL_KEY}=${DOCKERFILE_SHA}" \
    -f "${DOCKERFILE_PATH}" \
    -t "${IMAGE_NAME}" \
    "${ROOT_DIR}"
fi

docker run --rm -it \
  --memory="${DOCKER_MEMORY}" \
  --cpus="${DOCKER_CPUS}" \
  -e CI=1 \
  -e COREPACK_ENABLE_PROMPT=0 \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e PNPM_CONFIG_CONFIRM_MODULES_PURGE=false \
  -e PNPM_CONFIRM_MODULES_PURGE=false \
  -e PNPM_DISABLE_SELF_UPDATE_CHECK=1 \
  -e PNPM_STORE_DIR=/pnpm-store \
  -e PNPM_CONFIG_STORE_DIR=/pnpm-store \
  -v "${ROOT_DIR}":/workspace \
  -v "${PNPM_STORE_VOLUME}:/pnpm-store" \
  -v "${NODE_MODULES_VOLUME}:/workspace/node_modules" \
  -w /workspace \
  "${IMAGE_NAME}" \
  bash -lc "${COMMAND}"

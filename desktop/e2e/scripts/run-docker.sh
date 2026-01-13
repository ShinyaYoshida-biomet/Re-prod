#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
IMAGE_NAME="reprod-e2e"
PNPM_STORE_VOLUME="reprod-e2e-pnpm-store"

FORCE_BUILD=0
if [[ "${1-}" == "--build" ]]; then
  FORCE_BUILD=1
  shift
fi

if [[ -n "${1-}" ]]; then
  COMMAND="$*"
else
  COMMAND="pnpm install && pnpm --filter @reprod/e2e test -- --workers=1"
fi

if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1 || [[ "${FORCE_BUILD}" -eq 1 ]]; then
  docker build -f "${ROOT_DIR}/desktop/e2e/Dockerfile" -t "${IMAGE_NAME}" "${ROOT_DIR}"
fi

docker run --rm -it \
  -v "${ROOT_DIR}":/workspace \
  -v "${PNPM_STORE_VOLUME}:/root/.local/share/pnpm/store" \
  -w /workspace \
  "${IMAGE_NAME}" \
  bash -lc "${COMMAND}"

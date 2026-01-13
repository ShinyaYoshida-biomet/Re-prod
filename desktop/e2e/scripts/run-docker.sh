#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
IMAGE_NAME="reprod-e2e"

if [[ -n "${1-}" ]]; then
  COMMAND="$*"
else
  COMMAND="pnpm install && pnpm --filter @reprod/e2e test"
fi

docker build -f "${ROOT_DIR}/desktop/e2e/Dockerfile" -t "${IMAGE_NAME}" "${ROOT_DIR}"
docker run --rm -it -v "${ROOT_DIR}":/workspace -w /workspace "${IMAGE_NAME}" bash -lc "${COMMAND}"

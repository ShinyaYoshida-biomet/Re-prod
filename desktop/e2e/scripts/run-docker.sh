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
REUSE_CONTAINER="${REPROD_E2E_DOCKER_REUSE_CONTAINER:-1}"
SKIP_BUILD="${REPROD_E2E_DOCKER_SKIP_BUILD:-0}"
CONTAINER_NAME="${REPROD_E2E_DOCKER_CONTAINER_NAME:-reprod-e2e-runner}"
PREBUILD_BACKEND="${REPROD_E2E_DOCKER_PREBUILD:-1}"

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

if [[ "${MODE}" == "webdriver" ]]; then
  export VITE_E2E="${VITE_E2E:-1}"
fi

if [[ "${FORCE_BUILD}" -eq 1 ]]; then
  SKIP_BUILD=0
fi

PREBUILD_COMMAND=""
if [[ "${PREBUILD_BACKEND}" == "1" ]]; then
  PREBUILD_COMMAND="cargo build -p reprod-server && "
fi
PRE_COMMAND='bash /workspace/desktop/e2e/scripts/docker-preflight.sh'

if [[ -n "${1-}" ]]; then
  COMMAND="${PRE_COMMAND} pnpm install --frozen-lockfile && ${PREBUILD_COMMAND}$*"
else
  if [[ "${MODE}" == "webdriver" ]]; then
    COMMAND="${PRE_COMMAND} pnpm install --frozen-lockfile && ${PREBUILD_COMMAND}pnpm tauri build --debug --no-bundle && echo '[e2e] starting WebDriverIO tests' && { Xvfb :99 -screen 0 1280x720x24 -nolisten tcp & XVFB_PID=\$!; export DISPLAY=:99; pnpm --filter @reprod/e2e test:webdriver; status=\$?; kill \$XVFB_PID; exit \$status; }"
  else
    COMMAND="${PRE_COMMAND} pnpm install --frozen-lockfile && ${PREBUILD_COMMAND}pnpm --filter @reprod/e2e test -- --workers=1"
  fi
fi

CURRENT_SHA="$(docker image inspect --format '{{ index .Config.Labels "'"${DOCKERFILE_LABEL_KEY}"'" }}' "${IMAGE_NAME}" 2>/dev/null || true)"
OLD_IMAGE_ID="$(docker image inspect --format '{{ .Id }}' "${IMAGE_NAME}" 2>/dev/null || true)"

if [[ "${SKIP_BUILD}" == "1" ]]; then
  if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
    echo "[e2e] image ${IMAGE_NAME} not found; unset REPROD_E2E_DOCKER_SKIP_BUILD to build it." >&2
    exit 1
  fi
else
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
fi

DOCKER_BASE_ARGS=(
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
  -e REPROD_E2E_WEB_PORT \
  -e VITE_E2E \
  -e VITE_PORT \
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
)

cleanup_container() {
  docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}

if [[ "${REUSE_CONTAINER}" != "0" ]]; then
  REUSE_CONTAINER="1"
  IMAGE_ID="$(docker image inspect --format '{{ .Id }}' "${IMAGE_NAME}" 2>/dev/null || true)"
  CONTAINER_ID="$(docker container ls -aq -f "name=^/${CONTAINER_NAME}$")"
  if [[ -n "${CONTAINER_ID}" ]]; then
    CONTAINER_IMAGE_ID="$(docker container inspect --format '{{ .Image }}' "${CONTAINER_NAME}" 2>/dev/null || true)"
    if [[ -n "${IMAGE_ID}" && "${CONTAINER_IMAGE_ID}" != "${IMAGE_ID}" ]]; then
      if [[ "${REUSE_CONTAINER}" == "1" ]]; then
        docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
        CONTAINER_ID=""
      else
        CONTAINER_ID=""
      fi
    fi
  fi

  if [[ "${REUSE_CONTAINER}" == "1" ]]; then
    if [[ -z "${CONTAINER_ID}" ]]; then
      docker run -d --name "${CONTAINER_NAME}" \
        "${DOCKER_BASE_ARGS[@]}" \
        "${IMAGE_NAME}" \
        bash -lc "sleep infinity" >/dev/null
      CONTAINER_ID="${CONTAINER_NAME}"
    else
      RUNNING_STATE="$(docker container inspect --format '{{ .State.Running }}' "${CONTAINER_NAME}" 2>/dev/null || true)"
      if [[ "${RUNNING_STATE}" != "true" ]]; then
        docker start "${CONTAINER_NAME}" >/dev/null
      fi
    fi
  fi

  if [[ -n "${CONTAINER_ID}" ]]; then
    RUNNING_STATE="$(docker container inspect --format '{{ .State.Running }}' "${CONTAINER_NAME}" 2>/dev/null || true)"
    if [[ "${RUNNING_STATE}" == "true" ]]; then
      EXEC_ENV_ARGS=()
      for var in REPROD_E2E_WEB_PORT VITE_E2E VITE_PORT LOG_LEVEL DEBUG TAURI_DRIVER_APP TAURI_DRIVER_ARGS TAURI_DRIVER_HOST TAURI_DRIVER_PATH TAURI_DRIVER_PORT TAURI_DRIVER_READY_TIMEOUT; do
        value="${!var-}"
        if [[ -n "${value}" ]]; then
          EXEC_ENV_ARGS+=(-e "${var}=${value}")
        fi
      done

      trap cleanup_container EXIT
      set +e
      docker exec -i -w /workspace \
        "${EXEC_ENV_ARGS[@]}" \
        "${CONTAINER_NAME}" \
        bash -lc "${COMMAND}"
      status=$?
      set -e
      exit "${status}"
    fi
  fi
fi

docker run --rm -i \
  "${DOCKER_BASE_ARGS[@]}" \
  "${IMAGE_NAME}" \
  bash -lc "${COMMAND}"

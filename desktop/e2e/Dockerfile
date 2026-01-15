FROM mcr.microsoft.com/playwright:v1.56.1-jammy

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Etc/UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    webkit2gtk-driver \
    libglib2.0-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    xvfb \
    r-base \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.12.1

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"
ENV PATH="/usr/libexec/webkit2gtk-4.1:/usr/libexec/webkit2gtk-4.0:${PATH}"

RUN cargo install tauri-driver \
    && rustup component remove rust-docs || true \
    && rm -rf /root/.cargo/registry /root/.cargo/git /root/.rustup/toolchains/*/share/doc

ENV REPROD_E2E_DOCKER=1
WORKDIR /workspace

CMD ["/bin/bash"]

FROM mcr.microsoft.com/playwright:v1.56.1-jammy

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    xvfb \
    r-base \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

RUN cargo install tauri-driver

ENV REPROD_E2E_DOCKER=1
WORKDIR /workspace

CMD ["/bin/bash"]

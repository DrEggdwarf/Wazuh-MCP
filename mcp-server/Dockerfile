# Serveur MCP Wazuh (gbrigandi/mcp-server-wazuh) — build depuis les sources, variante HTTP.
# Rend le stack auto-suffisant : un simple `docker compose up -d --build` construit tout.
FROM rust:1.86-slim AS builder
ARG MCP_REF=969f36fb833c5404055a668dc27b97f0ea3cc755   # épinglé (≈ v0.3.0) — supply-chain reproductible
RUN apt-get update && apt-get install -y --no-install-recommends \
      git pkg-config libssl-dev build-essential perl make ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone https://github.com/gbrigandi/mcp-server-wazuh.git . && \
    git checkout "$MCP_REF" && \
    cargo build --release --features http

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /src/target/release/mcp-server-wazuh /app/mcp-server-wazuh
RUN useradd -m wazuh
USER wazuh
EXPOSE 8000
CMD ["./mcp-server-wazuh", "--transport", "http", "--host", "0.0.0.0", "--port", "8000"]

# 1. Build-Stage (mit Bun)
FROM oven/bun:latest AS build
WORKDIR /app

# Abhängigkeiten installieren
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Quellcode kopieren
COPY . .

# App zu einem Binary kompilieren
# --minify      → kleinere Binary
# --sourcemap   → bessere Stack-Traces + weniger RAM
# --bytecode    → schnellerer Kaltstart (wichtig bei auto_stop)
# --smol        → kleinerer Heap (ideal für 256MB Fly.io VM)
RUN bun build ./src/index.ts --compile --minify --sourcemap --bytecode --compile-exec-argv="--smol" --outfile mp3

# 2. Release-Stage (ohne Bun, nur minimales Debian)
FROM debian:bookworm-slim AS release
WORKDIR /app

# Nötig für SQLite und glibc-Kompatibilität
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /data/uploads && chmod 777 /data /data/uploads

# Das fertige Binary und die statischen Dateien kopieren
COPY --from=build /app/mp3 /app/mp3
COPY --from=build /app/src/public ./src/public

ENV DATA_DIR=/data

EXPOSE 3000

# Führt das kompilierte Binary direkt aus (kein "bun run" mehr)
CMD ["/app/mp3"]
FROM node:24

RUN apt-get update && \
    apt-get install -y \
    build-essential \
    libzmq3-dev \
    cmake

# Node 24 ships corepack; enable it so the `packageManager` field in
# package.json pins the project's pnpm version.
RUN corepack enable

WORKDIR /app

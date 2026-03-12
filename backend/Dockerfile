FROM node:22-bookworm

ARG APT_MIRROR=deb.debian.org

ENV PIP_DISABLE_PIP_VERSION_CHECK=1

RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY shared /app/shared
COPY analysis-service/requirements.txt /tmp/analysis-service-requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
  python3 -m pip install --break-system-packages -r /tmp/analysis-service-requirements.txt
COPY analysis-service /app/analysis-service

COPY backend/ ./
RUN npm run build

EXPOSE 8787

CMD ["npm", "start"]

FROM node:22-bookworm

ARG APT_MIRROR=deb.debian.org

RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY analysis-service /app/analysis-service
RUN python3 -m pip install --break-system-packages -r /app/analysis-service/requirements.txt

COPY backend/ ./
RUN npm run build

EXPOSE 8787

CMD ["npm", "start"]

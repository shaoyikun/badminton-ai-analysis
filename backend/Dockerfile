FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./
COPY analysis-service /app/analysis-service
RUN python3 -m pip install --break-system-packages -r /app/analysis-service/requirements.txt
RUN npm run build

EXPOSE 8787

CMD ["npm", "start"]

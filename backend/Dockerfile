FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json /app/backend/
RUN cd /app/backend && npm install

COPY analysis-service/requirements.txt /app/analysis-service/requirements.txt
RUN python3 -m pip install --break-system-packages -r /app/analysis-service/requirements.txt

WORKDIR /app/backend

EXPOSE 8787

CMD ["npm", "run", "dev"]

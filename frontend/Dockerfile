FROM node:22-bookworm

WORKDIR /app

COPY frontend/package*.json /app/frontend/
RUN cd /app/frontend && npm install

WORKDIR /app/frontend

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

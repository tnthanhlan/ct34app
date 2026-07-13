ARG BUILD_FROM=node:20-alpine
FROM $BUILD_FROM

RUN apk add --no-cache jq tzdata python3 make g++

WORKDIR /app
COPY app/package*.json ./
RUN npm install --omit=dev

COPY app/ ./
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8099

CMD [ "/run.sh" ]

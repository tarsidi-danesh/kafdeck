# Kafdeck

Desktop Kafka UI inspired by Kadeck. Connect to a cluster, browse topics, consume and produce records, and inspect consumer groups.

## Run

```bash
npm install
npm run dev
```

This starts Vite and opens the Electron window.

## Local Kafka (optional)

```bash
docker compose up -d
```

Then in Kafdeck add a connection to `localhost:9092` and connect.

## Features

- Saved connections (PLAINTEXT, SSL, SASL PLAIN / SCRAM)
- Cluster overview: brokers, topic volume, group lag
- Topic list, create, delete
- Record browser with JSON inspector, filters, and live tail
- Produce messages with optional key and headers
- Consumer groups with members, assignments, and lag

Connection details are stored in the Electron user-data folder on this machine.

## Build

```bash
npm run build
```

The packaged app is written to `release/`.

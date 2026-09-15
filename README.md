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

## Connect and disconnect

1. Open **Connections**.
2. Click **Add localhost:9092** or **New connection**, save, then **Connect**.
3. To leave the cluster, click **Disconnect** in the top-right of the window, or on the connected cluster card. That closes the Kafka client and returns you to Connections. Closing the app also disconnects.

## Features

- Saved connections (PLAINTEXT, SSL, SASL PLAIN / SCRAM)
- Connect and disconnect from a cluster without quitting the app
- Cluster overview: brokers, topic volume, group lag
- Topic list, create, delete
- Record browser with JSON inspector, filters, and live tail
- Produce messages with optional key and headers, or bulk-produce from a CSV file
- Consumer groups with members, assignments, and lag

Connection details are stored in the Electron user-data folder on this machine.

## Produce from a CSV file

Open **Produce**, switch to **From CSV file** and pick a file. One record is sent per
row, in batches, with a progress bar and a **Stop** button.

The delimiter (comma, semicolon, tab or pipe) is detected from the file and can be
overridden. Quoted fields may contain the delimiter, escaped `""` quotes and
newlines. Point each column at what it should become:

| Setting | Effect |
|---|---|
| Value → Whole row as JSON | Sends `{"column": "cell"}` built from every column |
| Value → Single column | Sends one column's text verbatim, for pre-serialised payloads |
| Key column | Uses that column as the record key (optional) |
| Partition column | Routes each row to the partition named in that column (optional) |
| Send as headers | Each selected column becomes a record header (optional) |

All cells are sent as strings; no number or boolean coercion happens. Rows that
cannot be sent (an unparseable partition, for example) are reported with their row
number and do not stop the rest of the file.

## Build

`npm run build` only type-checks and compiles the renderer and Electron bundles into
`dist/` and `dist-electron/`. Use a `dist:*` script to produce an installable app.

```bash
npm run dist:mac            # installers for the machine's own architecture
npm run dist:mac:arm64      # Apple Silicon
npm run dist:mac:x64        # Intel
npm run dist:mac:universal   # single binary for both
npm run dist:win            # NSIS installer + portable exe
npm run dist:linux          # AppImage + deb
npm run dist:all            # macOS, Windows and Linux in one pass
npm run dist                # current platform, default targets
npm run pack                # unpacked .app / folder only, no installer (fast)
```

Artifacts land in `release/`, named like `Kafdeck-0.1.0-mac-arm64.dmg`. Building for
Windows or Linux from macOS needs Docker or Wine.

### Icon

`build/icon.png` is the only icon asset; electron-builder derives the `.icns` and
`.ico` from it. It is generated rather than drawn by hand, so edit the constants at
the top of `scripts/make-icon.cjs` and regenerate:

```bash
npm run icon
```

### Install on macOS

Open the `.dmg` and drag **Kafdeck** to Applications.

There is no Apple Developer ID in this project, so builds are ad-hoc signed locally
(see `scripts/adhoc-sign.cjs`). That is enough for the app to launch on the machine
that built it. A build copied off this machine gets quarantined by Gatekeeper, and
macOS will report it as damaged — open it once via right-click → **Open**, or run
`xattr -dr com.apple.quarantine /Applications/Kafdeck.app`. Set a `Developer ID
Application` identity in the keychain to have electron-builder sign properly instead.

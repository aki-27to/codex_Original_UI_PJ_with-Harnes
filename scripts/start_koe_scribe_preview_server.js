"use strict";

const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");

const port = process.env.CODEX_KOE_SCRIBE_PREVIEW_PORT || process.env.CODEX_UI_PORT || "57526";

let serverHandle = null;

async function stop() {
  if (!serverHandle) return;
  const handle = serverHandle;
  serverHandle = null;
  await handle.stop();
}

process.on("SIGINT", () => {
  stop().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  stop().finally(() => process.exit(0));
});

startInProcessHarnessServer({ CODEX_UI_PORT: port })
  .then((started) => {
    serverHandle = started;
    console.log(`KoeScribe preview server listening on http://127.0.0.1:${started.port}/apps/koe-scribe/`);
    setInterval(() => {}, 2147483647);
  })
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });

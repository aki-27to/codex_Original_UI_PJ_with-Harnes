"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { once } = require("events");

const { startServer } = require("../APP/05.koe-scribe/standalone_server");

function request({ method = "GET", port, path: requestPath, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const requestBody = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: requestPath,
        headers: {
          ...(requestBody ? { "Content-Type": "application/json", "Content-Length": requestBody.length } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (requestBody) req.write(requestBody);
    req.end();
  });
}

async function main() {
  const server = startServer({ hostOverride: "127.0.0.1", portOverride: 0, quiet: true });
  await once(server, "listening");
  const port = server.address().port;
  const context = server.koeScribeContext;

  try {
    const health = await request({ port, path: "/healthz" });
    assert.strictEqual(health.statusCode, 200);
    const healthPayload = JSON.parse(health.body);
    assert.strictEqual(healthPayload.ok, true);
    assert.strictEqual(healthPayload.isolation.mode, "standalone");
    assert.strictEqual(healthPayload.isolation.sharedHarness, false);
    assert.strictEqual(healthPayload.isolation.portSelection, "auto");

    const index = await request({ port, path: "/" });
    assert.strictEqual(index.statusCode, 200);
    assert(index.body.includes("KoeScribe"));

    const runtime = await request({ port, path: "/api/runtime" });
    assert.strictEqual(runtime.statusCode, 200);
    const runtimePayload = JSON.parse(runtime.body);
    assert.strictEqual(runtimePayload.mode, "app-server");
    assert.strictEqual(runtimePayload.isolation.sharedApiExec, false);
    assert.strictEqual(runtimePayload.controlApi.tokenHeader, "x-koe-scribe-control-token");

    const unauthorized = await request({
      method: "POST",
      port,
      path: "/api/exec",
      body: { prompt: "KoeScribe transcription job.\nengine: plan-only" },
    });
    assert.strictEqual(unauthorized.statusCode, 401);

    const exec = await request({
      method: "POST",
      port,
      path: "/api/exec",
      headers: { [runtimePayload.controlApi.tokenHeader]: runtimePayload.controlApi.token },
      body: { prompt: "KoeScribe transcription job.\nengine: openai-whisper-srt" },
    });
    assert.strictEqual(exec.statusCode, 200);
    assert(String(exec.headers["content-type"]).includes("application/x-ndjson"));
    const events = exec.body.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const finalEvent = events.find((event) => event.type === "final");
    assert(events.some((event) => event.status === "standalone_isolated"));
    assert(finalEvent && finalEvent.text.includes("shared_harness_dispatch: disabled"));
    assert(finalEvent.text.includes("shared_harness_api_exec: disabled"));
    assert(finalEvent.text.includes(path.join(context.runtimeRoot, "jobs")));

    console.log(`koe-scribe standalone server test passed: http://127.0.0.1:${port}/`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

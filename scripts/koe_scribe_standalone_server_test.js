"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
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

function rawRequest({ method = "POST", port, path: requestPath, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const requestBody = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""));
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: requestPath,
        headers: {
          "Content-Length": requestBody.length,
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
    req.write(requestBody);
    req.end();
  });
}

async function main() {
  const server = startServer({
    hostOverride: "127.0.0.1",
    portOverride: 0,
    quiet: true,
    openAiClient: async () => ({
      text: "こんにちは。これはKoeScribeの文字起こしテストです。",
      segments: [
        { start: 0, end: 2.4, text: "こんにちは。" },
        { start: 2.4, end: 5.2, text: "これはKoeScribeの文字起こしテストです。" },
      ],
    }),
  });
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
    assert.strictEqual(runtimePayload.isolation.transcriptionModel, "whisper-1");
    assert.strictEqual(runtimePayload.controlApi.tokenHeader, "x-koe-scribe-control-token");

    const upload = await rawRequest({
      port,
      path: "/api/media/upload",
      headers: {
        [runtimePayload.controlApi.tokenHeader]: runtimePayload.controlApi.token,
        "Content-Type": "video/mp4",
        "x-koe-scribe-file-name": encodeURIComponent("sample video.mp4"),
        "x-koe-scribe-file-type": "video/mp4",
      },
      body: Buffer.from("fake media bytes"),
    });
    assert.strictEqual(upload.statusCode, 200);
    const uploadPayload = JSON.parse(upload.body);
    assert.strictEqual(uploadPayload.ok, true);
    assert.strictEqual(uploadPayload.upload.fileName, "sample video.mp4");
    assert(fs.existsSync(uploadPayload.upload.localPath), "uploaded media should be saved under the app runtime root");
    assert(uploadPayload.upload.localPath.startsWith(context.runtimeRoot));

    const unauthorized = await request({
      method: "POST",
      port,
      path: "/api/exec",
      body: { prompt: "KoeScribe transcription job.\nengine: codex-openai-transcription" },
    });
    assert.strictEqual(unauthorized.statusCode, 401);

    const exec = await request({
      method: "POST",
      port,
      path: "/api/exec",
      headers: { [runtimePayload.controlApi.tokenHeader]: runtimePayload.controlApi.token },
      body: {
        prompt: "KoeScribe transcription job.\nengine: codex-openai-transcription",
        job: {
          outputs: ["SRT", "VTT", "Markdown"],
          language: "ja",
          quality: "technical",
          glossary: "KoeScribe",
        },
        uploadedMedia: uploadPayload.upload,
      },
    });
    assert.strictEqual(exec.statusCode, 200);
    assert(String(exec.headers["content-type"]).includes("application/x-ndjson"));
    const events = exec.body.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const finalEvent = events.find((event) => event.type === "final");
    assert(events.some((event) => event.status === "standalone_isolated"));
    assert(events.some((event) => event.status === "transcription_completed"));
    assert(finalEvent && finalEvent.text.includes("文字起こしが完了しました。"));
    assert(finalEvent.text.includes("こんにちは。これはKoeScribeの文字起こしテストです。"));
    assert(finalEvent.text.includes(".srt"));
    assert(finalEvent.text.includes(".vtt"));

    console.log(`koe-scribe standalone server test passed: http://127.0.0.1:${port}/`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

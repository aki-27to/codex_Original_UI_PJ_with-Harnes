const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const electronBinary = require("electron");

const root = path.resolve(__dirname, "..");
const userDataDir = path.join(root, "runtime", `electron-smoke-${Date.now()}`);
fs.mkdirSync(userDataDir, { recursive: true });

const child = spawn(electronBinary, ["desktop/harnes-electron/main.cjs", "--smoke"], {
  cwd: root,
  windowsHide: true,
  env: {
    ...process.env,
    HARNES_ELECTRON_SMOKE: "1",
    HARNES_ELECTRON_SMOKE_TIMEOUT_MS: process.env.HARNES_ELECTRON_SMOKE_TIMEOUT_MS || "150000",
    CODEX_AUTO_OPEN_BROWSER: "0",
    HARNES_ELECTRON_USER_DATA_DIR: userDataDir,
  },
});

let stdout = "";
let stderr = "";
let finished = false;
const timeoutMs = Number(process.env.HARNES_ELECTRON_SMOKE_WRAPPER_TIMEOUT_MS || 180000);
const watchdog = setTimeout(() => {
  if (finished) return;
  finished = true;
  try {
    child.kill("SIGKILL");
  } catch (_error) {
  }
  console.error(`electron_harnesui_smoke_test: timed out after ${timeoutMs}ms`);
  process.exit(1);
}, timeoutMs);

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  stdout += text;
  process.stdout.write(text);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  stderr += text;
  process.stderr.write(text);
});

child.on("exit", (code) => {
  if (finished) return;
  finished = true;
  clearTimeout(watchdog);
  const marker = "HARNES_ELECTRON_SMOKE_RESULT=";
  const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith(marker));
  if (code !== 0) {
    console.error(`electron_harnesui_smoke_test: Electron exited with ${code}`);
    process.exit(code || 1);
  }
  if (!line) {
    console.error("electron_harnesui_smoke_test: missing smoke result marker");
    if (stderr) console.error(stderr);
    process.exit(1);
  }
  const payload = JSON.parse(line.slice(marker.length));
  if (!payload.ok) {
    console.error(`electron_harnesui_smoke_test: failed ${JSON.stringify(payload)}`);
    process.exit(1);
  }
  console.log("electron_harnesui_smoke_test: PASS");
});

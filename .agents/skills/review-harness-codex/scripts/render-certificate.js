#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const options = {
    grade: "A",
    percent: "80",
    project: "Codex Harness",
    summary: "Codex harness diagnosis result.",
    html: "output/playwright/codex-harness-certificate.html",
    out: "output/playwright/codex-harness-certificate.png",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--grade" && next) {
      options.grade = next;
      index += 1;
    } else if (token === "--percent" && next) {
      options.percent = next;
      index += 1;
    } else if (token === "--project" && next) {
      options.project = next;
      index += 1;
    } else if (token === "--summary" && next) {
      options.summary = next;
      index += 1;
    } else if (token === "--html" && next) {
      options.html = next;
      index += 1;
    } else if (token === "--out" && next) {
      options.out = next;
      index += 1;
    } else if (token === "--help" || token === "-h") {
      options.help = true;
    }
  }
  return options;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gradePhrase(grade) {
  return {
    S: "EXCELLENT PERFORMANCE",
    A: "STRONG PERFORMANCE",
    B: "SOLID FOUNDATION",
    C: "NEEDS REMEDIATION",
    D: "EARLY STAGE",
    E: "CRITICAL GAPS",
  }[grade] || "DIAGNOSIS RESULT";
}

function normalizeGrade(value) {
  const grade = String(value || "A").trim().toUpperCase();
  return ["S", "A", "B", "C", "D", "E"].includes(grade) ? grade : "A";
}

function findPlaywright(workspaceRoot) {
  const candidates = [
    path.join(workspaceRoot, "node_modules", "playwright"),
    path.join(workspaceRoot, "node_modules", "@playwright", "test", "node_modules", "playwright"),
  ];
  const npxRoot = path.join(workspaceRoot, "runtime", "npm-cache", "_npx");
  if (fs.existsSync(npxRoot)) {
    for (const child of fs.readdirSync(npxRoot)) {
      candidates.push(path.join(npxRoot, child, "node_modules", "playwright"));
    }
  }
  for (const candidate of candidates) {
    const packageJson = path.join(candidate, "package.json");
    if (!fs.existsSync(packageJson)) {
      continue;
    }
    try {
      return require(candidate);
    } catch (_) {
      // Try the next candidate.
    }
  }
  return null;
}

function buildHtml(options) {
  const grade = normalizeGrade(options.grade);
  const percent = String(options.percent || "").replace(/%$/, "");
  const rankClass = grade.toLowerCase();
  const project = escapeHtml(options.project);
  const phrase = gradePhrase(grade);

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codex Harness Rank ${grade}</title>
  <style>
    :root {
      --paper: #efe4c5;
      --paper-light: #fff7df;
      --ink: #382916;
      --muted: #846a3f;
      --gold: #bd8d22;
      --gold-dark: #86600f;
      --seal: #8e241c;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      width: 1200px;
      height: 630px;
      overflow: hidden;
      background: #221807;
      color: var(--ink);
      font-family: "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Times New Roman", serif;
    }

    .certificate {
      position: relative;
      width: 1200px;
      height: 630px;
      padding: 58px 78px;
      background:
        radial-gradient(circle at 20% 18%, rgba(255,255,255,.72), transparent 20%),
        radial-gradient(circle at 76% 30%, rgba(255,255,255,.42), transparent 24%),
        linear-gradient(115deg, rgba(255,255,255,.42), transparent 42%),
        var(--paper);
      border: 20px solid #b58a35;
      box-shadow: inset 0 0 0 6px #f3db91, inset 0 0 0 12px #8f6824;
    }

    .certificate::before,
    .certificate::after {
      content: "";
      position: absolute;
      inset: 34px;
      border: 2px solid rgba(124, 85, 20, .62);
      pointer-events: none;
    }

    .certificate::after {
      inset: 48px;
      border-style: dotted;
      opacity: .75;
    }

    .corner {
      position: absolute;
      width: 176px;
      height: 176px;
      color: rgba(122, 84, 19, .92);
      font-size: 108px;
      line-height: 1;
      font-weight: 700;
    }

    .corner.tl { top: 18px; left: 26px; transform: rotate(0deg); }
    .corner.tr { top: 18px; right: 26px; transform: scaleX(-1); }
    .corner.bl { bottom: 18px; left: 26px; transform: scaleY(-1); }
    .corner.br { bottom: 18px; right: 26px; transform: scale(-1); }

    .inner {
      position: relative;
      z-index: 1;
      height: 100%;
      display: grid;
      justify-items: center;
      align-content: center;
      text-align: center;
    }

    .crest {
      width: 210px;
      height: 46px;
      margin-bottom: 12px;
      border-top: 3px double rgba(139, 99, 26, .72);
      border-bottom: 3px double rgba(139, 99, 26, .72);
      color: var(--gold-dark);
      font-size: 34px;
      letter-spacing: 12px;
      line-height: 40px;
    }

    .title {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: 10px;
      margin-bottom: 8px;
    }

    .subtitle {
      font-family: "Times New Roman", serif;
      color: var(--muted);
      letter-spacing: 8px;
      font-size: 17px;
      margin-bottom: 20px;
    }

    .project {
      max-width: 760px;
      color: #5d4728;
      font-size: 20px;
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .judge {
      font-size: 22px;
      letter-spacing: 8px;
      margin-bottom: 2px;
    }

    .rank-line {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      margin: 4px 0 0;
    }

    .spark {
      color: #d6a537;
      font-size: 40px;
    }

    .rank {
      font-size: 132px;
      line-height: .98;
      font-weight: 900;
      color: var(--gold);
      text-shadow: 0 4px 0 rgba(255,255,255,.72), 0 7px 18px rgba(109, 73, 8, .28);
      letter-spacing: 4px;
    }

    .rank.s { color: #c69b2e; }
    .rank.a { color: #bd8d22; }
    .rank.b { color: #98753b; }
    .rank.c { color: #7f6b45; }
    .rank.d { color: #6c5d4b; }
    .rank.e { color: #9c3b24; }

    .rank-label {
      color: #9a7331;
      font-family: "Times New Roman", serif;
      font-size: 17px;
      letter-spacing: 10px;
      margin-top: 2px;
    }

    .phrase {
      color: #8b6a32;
      font-family: "Times New Roman", serif;
      font-size: 18px;
      letter-spacing: 8px;
      margin-top: 8px;
    }

    .percent {
      position: absolute;
      right: 112px;
      bottom: 92px;
      width: 112px;
      height: 112px;
      border: 5px double var(--seal);
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: var(--seal);
      font-family: "Times New Roman", serif;
      font-weight: 800;
      font-size: 26px;
      transform: rotate(-10deg);
    }

    .percent span {
      display: block;
      font-size: 14px;
      letter-spacing: 2px;
    }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="corner tl">❦</div>
    <div class="corner tr">❦</div>
    <div class="corner bl">❦</div>
    <div class="corner br">❦</div>
    <div class="inner">
      <div class="crest">CODX</div>
      <div class="title">ハーネス診断結果</div>
      <div class="subtitle">CODEX APP SERVER HARNESS DIAGNOSTIC REPORT</div>
      <div class="project">本状は、${project} における Codex ハーネス構成の総合診断結果をお知らせするものです。</div>
      <div class="judge">総合判定</div>
      <div class="rank-line">
        <div class="spark">✦</div>
        <div class="rank ${rankClass}">${grade}ランク</div>
        <div class="spark">✦</div>
      </div>
      <div class="rank-label">${grade} RANK - ${phrase}</div>
    </div>
    <div class="percent"><div>${escapeHtml(percent)}%<span>CODEX</span></div></div>
  </div>
</body>
</html>`;
}

async function renderPng(htmlPath, outPath, workspaceRoot) {
  const playwright = findPlaywright(workspaceRoot);
  if (!playwright) {
    return { rendered: false, reason: "playwright_not_found" };
  }
  const { chromium } = playwright;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "msedge" });
  } catch (_) {
    browser = await chromium.launch({ headless: true });
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(`file:///${path.resolve(htmlPath).replace(/\\/g, "/")}`, { waitUntil: "load" });
    await page.screenshot({ path: outPath, fullPage: false });
  } finally {
    await browser.close();
  }
  return { rendered: true };
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log("Usage: node render-certificate.js --grade A --percent 80 --project NAME --summary TEXT --html out.html --out out.png");
    return;
  }
  const workspaceRoot = process.cwd();
  const htmlPath = path.resolve(workspaceRoot, options.html);
  const outPath = path.resolve(workspaceRoot, options.out);
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(htmlPath, buildHtml(options), "utf8");
  const result = await renderPng(htmlPath, outPath, workspaceRoot);
  console.log(JSON.stringify({
    html: htmlPath,
    png: result.rendered ? outPath : null,
    rendered: result.rendered,
    reason: result.reason || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

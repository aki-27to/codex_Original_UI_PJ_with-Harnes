#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultPolicyPath = path.join(workspaceRoot, "scripts", "config", "design_quality_operator_policy.json");
const defaultVisualGrammarPath = path.join(workspaceRoot, "scripts", "config", "visual_grammar.json");
const defaultAntiTastePath = path.join(workspaceRoot, "scripts", "config", "anti_taste_memory.json");
const defaultTasteMemoryPath = path.join(workspaceRoot, "scripts", "config", "default_user_taste_memory.json");

function safeString(value, max = 20000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isPathWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function removeDirSafe(dirPath) {
  const resolved = path.resolve(dirPath);
  if (!isPathWithin(workspaceRoot, resolved)) {
    throw new Error(`Refusing to remove path outside workspace: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "application/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function copyFileIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return false;
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function copyDirectorySafe(sourceRoot, targetRoot) {
  const resolvedTarget = path.resolve(targetRoot);
  if (!isPathWithin(workspaceRoot, resolvedTarget)) {
    throw new Error(`Refusing to publish outside workspace: ${resolvedTarget}`);
  }
  removeDirSafe(resolvedTarget);
  ensureDir(resolvedTarget);
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(resolvedTarget, entry.name);
    if (entry.isDirectory()) {
      copyDirectorySafe(source, target);
    } else if (entry.isFile()) {
      ensureDir(path.dirname(target));
      fs.copyFileSync(source, target);
    }
  }
}

function parseArgs(argv) {
  const args = { command: "run" };
  const rest = Array.from(argv || []);
  if (rest[0] && !rest[0].startsWith("--")) args.command = rest.shift();
  for (let index = 0; index < rest.length; index += 1) {
    const raw = rest[index];
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    const key = raw.slice(2, eq === -1 ? undefined : eq);
    const value = eq === -1 ? rest[index + 1] : raw.slice(eq + 1);
    if (eq === -1 && value && !value.startsWith("--")) index += 1;
    if (eq === -1 && (!value || value.startsWith("--"))) {
      args[key] = true;
    } else {
      args[key] = value;
    }
  }
  return args;
}

function boolArg(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function normalizedRunId(value) {
  const raw = safeString(value, 120);
  if (raw) return raw.replace(/[^A-Za-z0-9_.-]/g, "-");
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function targetRootFromArgs(args, policy) {
  const raw = safeString(args["target-root"], 2000)
    || safeString(process.env.DESIGN_QUALITY_TARGET_ROOT, 2000)
    || safeString(policy.defaultTarget && policy.defaultTarget.path, 2000);
  if (!raw) throw new Error("target root is required");
  return path.resolve(raw);
}

function buildBrief({ targetRoot, policy, visualGrammar, antiTaste }) {
  const target = policy.defaultTarget || {};
  return {
    schema: "design-quality-brief.v1",
    target: {
      id: target.id || "unknown",
      label: target.label || "Target page",
      root: targetRoot,
      pageScope: target.pageScope || "unspecified",
    },
    objective: "Generate and route a better TOP-page design image without requiring the user to inspect every candidate.",
    lockedConstraints: [
      "Do not mutate the target MieNDI repository.",
      "Use real MieNDI page content and public assets.",
      "Do not auto-recommend until the customer-image benchmark and win conditions are satisfied.",
      "Keep rejected candidates available only as evidence."
    ],
    customerImageReference: policy.customerImageReference || {},
    calibrationGate: {
      ...(policy.calibrationGate || {}),
      currentSiteDiagnosis: policy.currentSiteDiagnosis || {},
      winConditions: policy.winConditions || [],
      antiReference: policy.antiReference || [],
    },
    visualGrammar: visualGrammar.profiles && visualGrammar.profiles["mie-ndi-ndt"]
      ? visualGrammar.profiles["mie-ndi-ndt"]
      : {},
    antiTaste: [
      ...((antiTaste.globalAvoid || []).map((entry) => entry.label || entry.id)),
      ...((antiTaste.mieNdiAvoid || []).map((entry) => entry.label || entry.id)),
    ],
  };
}

function prepareAssets(targetRoot, runRoot) {
  const publicRoot = path.join(targetRoot, "public");
  const assets = [
    "assets/suruga/home-hero.jpg",
    "assets/suruga/home-inspection-ut.jpg",
    "assets/suruga/home-inspection-pt.jpg",
    "assets/suruga/home-inspection-mt.jpg",
    "assets/suruga/home-company-office.jpg",
    "assets/suruga/home-recruit-new.jpg",
    "assets/original/ndt-about-ultrasonic.png",
    "assets/original/ndt-about-infrastructure.png",
    "assets/original/ndt-about-report.png",
  ];
  const copied = [];
  for (const rel of assets) {
    const source = path.join(publicRoot, rel);
    const target = path.join(runRoot, "assets", rel.replace(/^assets[\\/]/, ""));
    if (copyFileIfExists(source, target)) copied.push({ source, target: path.relative(runRoot, target).replace(/\\/g, "/") });
  }
  return copied;
}

function buildCandidateData() {
  return [
    {
      id: "candidate-a",
      label: "Field Precision Blue",
      decision: "review_required",
      summary: "Real field photography is present, but the Suruga-calibrated benchmark exposes weak composition maturity and customer-image fit.",
      score: {
        reference_fit: 74,
        customer_image_fit: 61,
        benchmark_competitiveness: 55,
        composition_maturity: 58,
        taste_fit: 54,
        anti_taste_avoidance: 70,
        visual_hierarchy: 63,
        information_density: 66,
        layout_integrity: 70,
        mobile_resilience: 88,
        brand_specificity: 70,
        implementation_risk: 84,
      },
    },
    {
      id: "candidate-b",
      label: "Industrial Dark Control",
      decision: "rejected",
      summary: "High contrast and strong industrial tone, but too close to the heavy dark-console pattern the taste memory rejects.",
      score: {
        reference_fit: 76,
        customer_image_fit: 57,
        benchmark_competitiveness: 52,
        composition_maturity: 60,
        taste_fit: 62,
        anti_taste_avoidance: 58,
        visual_hierarchy: 78,
        information_density: 80,
        layout_integrity: 82,
        mobile_resilience: 78,
        brand_specificity: 82,
        implementation_risk: 76,
      },
    },
    {
      id: "candidate-c",
      label: "Corporate Card Stack",
      decision: "rejected",
      summary: "Readable and safe, but it regresses toward generic white-card SaaS structure and weak field realness.",
      score: {
        reference_fit: 61,
        customer_image_fit: 45,
        benchmark_competitiveness: 42,
        composition_maturity: 48,
        taste_fit: 54,
        anti_taste_avoidance: 49,
        visual_hierarchy: 68,
        information_density: 64,
        layout_integrity: 80,
        mobile_resilience: 82,
        brand_specificity: 58,
        implementation_risk: 88,
      },
    },
  ];
}

function totalScore(score) {
  const weights = {
    reference_fit: 1.15,
    customer_image_fit: 1.35,
    benchmark_competitiveness: 1.35,
    composition_maturity: 1.3,
    taste_fit: 1.2,
    anti_taste_avoidance: 1.15,
    visual_hierarchy: 1.1,
    information_density: 0.95,
    layout_integrity: 1.1,
    mobile_resilience: 0.9,
    brand_specificity: 1.15,
    implementation_risk: 0.65,
  };
  let numerator = 0;
  let denominator = 0;
  for (const [key, value] of Object.entries(score || {})) {
    const weight = weights[key] || 1;
    numerator += Number(value || 0) * weight;
    denominator += weight;
  }
  return Math.round(numerator / Math.max(denominator, 1));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function commonHeader() {
  return `
    <header class="site-header">
      <a class="brand" href="#top" aria-label="有限会社三重非破壊検査 TOP">
        <span class="brand-mark">NDT</span>
        <span><strong>有限会社三重非破壊検査</strong><small>MIE NON-DESTRUCTIVE TESTING</small></span>
      </a>
      <nav aria-label="主要ページ">
        <a href="#service">検査内容</a>
        <a href="#education">教育体制</a>
        <a href="#company">会社概要</a>
        <a class="contact-link" href="#contact">お問い合わせ</a>
      </nav>
    </header>`;
}

function candidateAHtml(candidate) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(candidate.label)} | Design Quality Operator</title>
  <style>
    :root { color-scheme: light; --ink:#102844; --ink-2:#31516f; --line:#cfdae5; --blue:#2f6fb2; --sky:#77a8c8; --cream:#f5f8f2; --steel:#e8eff6; --gold:#f2b84b; font-family:"Noto Sans JP", "Yu Gothic", sans-serif; }
    * { box-sizing: border-box; }
    body { margin:0; background:#f5f8f2; color:var(--ink); letter-spacing:0; }
    a { color:inherit; text-decoration:none; }
    .site-header { position:fixed; z-index:10; inset:18px 28px auto; display:flex; align-items:center; justify-content:space-between; gap:18px; padding:12px 16px; border:1px solid rgba(255,255,255,.42); background:rgba(8,24,42,.36); color:white; backdrop-filter:blur(14px); }
    .brand { display:flex; align-items:center; gap:12px; min-width:0; }
    .brand-mark { display:grid; place-items:center; width:42px; height:42px; border:2px solid rgba(255,255,255,.82); font-weight:900; font-size:12px; }
    .brand strong { display:block; font-size:15px; line-height:1.35; }
    .brand small { display:block; margin-top:2px; color:rgba(255,255,255,.68); font-size:10px; font-weight:800; }
    nav { display:flex; align-items:center; gap:20px; font-size:12px; font-weight:800; }
    .contact-link { padding:10px 14px; border:1px solid rgba(255,255,255,.42); background:rgba(255,255,255,.12); }
    .hero { position:relative; min-height:82vh; display:grid; align-items:end; overflow:hidden; background:url("../../assets/suruga/home-hero.jpg") center / cover no-repeat; color:white; }
    .hero::before { content:""; position:absolute; inset:0; background:linear-gradient(90deg, rgba(7,22,39,.86) 0%, rgba(16,40,68,.64) 48%, rgba(16,40,68,.10) 100%), linear-gradient(180deg, rgba(7,22,39,.04), rgba(7,22,39,.58)); }
    .hero-inner { position:relative; width:min(1180px, calc(100vw - 48px)); margin:0 auto; padding:148px 0 96px; display:grid; gap:28px; }
    .eyebrow { width:max-content; padding:8px 11px; border-left:4px solid var(--gold); background:rgba(255,255,255,.11); color:#dceafb; font-size:12px; font-weight:900; }
    h1 { margin:0; max-width:770px; font-size:clamp(38px, 6vw, 82px); line-height:1.04; font-weight:900; text-wrap:balance; }
    .lead { max-width:650px; margin:0; color:rgba(255,255,255,.86); font-size:clamp(15px, 1.6vw, 19px); font-weight:700; line-height:2; }
    .hero-actions { display:flex; flex-wrap:wrap; gap:12px; }
    .button { display:inline-flex; align-items:center; justify-content:center; min-height:48px; padding:0 18px; border:1px solid rgba(255,255,255,.5); font-size:13px; font-weight:900; }
    .button.primary { border-color:var(--gold); background:var(--gold); color:#152638; }
    .button.secondary { background:rgba(255,255,255,.08); color:white; }
    .proof-rail { position:relative; width:min(1180px, calc(100vw - 48px)); margin:-54px auto 0; z-index:2; display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); border:1px solid var(--line); background:rgba(255,255,255,.96); box-shadow:0 18px 42px rgba(16,40,68,.16); }
    .proof-rail article { padding:18px 20px; border-left:1px solid var(--line); min-height:108px; }
    .proof-rail article:first-child { border-left:0; }
    .proof-rail p { margin:0 0 8px; color:var(--blue); font-size:11px; font-weight:900; }
    .proof-rail strong { display:block; font-size:20px; line-height:1.25; }
    .proof-rail span { display:block; margin-top:8px; color:#65798e; font-size:12px; font-weight:700; line-height:1.55; }
    main > section:not(.hero) { padding:86px 0; }
    .section-inner { width:min(1180px, calc(100vw - 48px)); margin:0 auto; }
    .statement { display:grid; grid-template-columns:minmax(0,.92fr) minmax(380px,1fr); gap:64px; align-items:center; }
    .section-label { margin:0 0 14px; color:var(--blue); font-size:12px; font-weight:900; }
    .statement h2, .services h2 { margin:0; font-size:clamp(28px,3.6vw,48px); line-height:1.18; }
    .statement p { color:var(--ink-2); font-size:15px; font-weight:700; line-height:2; }
    .inspection-map { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .inspection-tile { min-height:156px; padding:18px; border:1px solid var(--line); background:white; display:flex; flex-direction:column; justify-content:space-between; }
    .inspection-tile b { font-size:15px; }
    .inspection-tile span { color:#6a7f93; font-size:12px; line-height:1.6; font-weight:700; }
    .services { background:var(--steel); }
    .service-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:18px; margin-top:28px; }
    .service-card { min-height:320px; display:flex; align-items:end; padding:22px; color:white; background-size:cover; background-position:center; position:relative; overflow:hidden; }
    .service-card::before { content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgba(16,40,68,.06), rgba(16,40,68,.88)); }
    .service-card div { position:relative; }
    .service-card h3 { margin:0 0 10px; font-size:22px; }
    .service-card p { margin:0; color:rgba(255,255,255,.78); font-size:13px; line-height:1.7; font-weight:700; }
    .closing { background:#102844; color:white; }
    .closing .section-inner { display:grid; grid-template-columns:1fr auto; gap:28px; align-items:center; }
    .closing h2 { margin:0; font-size:clamp(26px,3.2vw,46px); line-height:1.24; }
    .closing p { color:rgba(255,255,255,.72); line-height:1.8; font-weight:700; }
    @media (max-width: 860px) {
      .site-header { position:absolute; inset:12px 14px auto; align-items:flex-start; }
      nav { display:none; }
      .hero-inner { width:min(100% - 32px, 680px); padding:122px 0 86px; }
      .proof-rail, .statement, .service-grid, .closing .section-inner { grid-template-columns:1fr; }
      .proof-rail article, .proof-rail article:first-child { border-left:0; border-top:1px solid var(--line); }
      .proof-rail article:first-child { border-top:0; }
      .section-inner { width:min(100% - 32px, 680px); }
      .inspection-map { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  ${commonHeader()}
  <section class="hero" id="top">
    <div class="hero-inner">
      <p class="eyebrow">MIE NON-DESTRUCTIVE TESTING</p>
      <h1>社会の安全を、現場で確かめる。</h1>
      <p class="lead">有限会社三重非破壊検査は、設備・鋼構造物・プラントを壊さずに調べ、検査から報告まで一貫して支える鈴鹿の専門技術者集団です。</p>
      <div class="hero-actions">
        <a class="button primary" href="#contact">検査を相談する</a>
        <a class="button secondary" href="#education">採用と教育を見る</a>
      </div>
    </div>
  </section>
  <section class="proof-rail" aria-label="対応体制">
    <article><p>BASE</p><strong>鈴鹿本社</strong><span>三重県を拠点に東海・近畿圏へ対応</span></article>
    <article><p>SINCE</p><strong>1992年</strong><span>地域の設備と構造物を支える検査会社</span></article>
    <article><p>FLOW</p><strong>検査から報告まで</strong><span>現場確認、検査、記録作成まで一貫対応</span></article>
    <article><p>FIELD</p><strong>プラント・橋梁・建築</strong><span>状態を見える情報として整理</span></article>
  </section>
  <main>
    <section class="statement">
      <div class="section-inner statement">
        <div>
          <p class="section-label">ABOUT NDT</p>
          <h2>見えない部分の状態を、現場で判断できる情報にする。</h2>
          <p>超音波探傷、浸透探傷、鉄筋探査など、対象物に合わせた検査方法を選び、設備や構造物の安全判断を支えます。</p>
        </div>
        <div class="inspection-map">
          <article class="inspection-tile"><b>超音波探傷試験</b><span>内部きずや厚さを非破壊で確認</span></article>
          <article class="inspection-tile"><b>浸透探傷試験</b><span>表面の微細なきずを可視化</span></article>
          <article class="inspection-tile"><b>鉄筋探査</b><span>コンクリート内の鉄筋位置を確認</span></article>
          <article class="inspection-tile"><b>報告書作成</b><span>次の判断につながる記録へ整理</span></article>
        </div>
      </div>
    </section>
    <section class="services" id="service">
      <div class="section-inner">
        <p class="section-label">INSPECTIONS</p>
        <h2>主要な検査を、現場の条件に合わせて選定。</h2>
        <div class="service-grid">
          <article class="service-card" style="background-image:url('../../assets/suruga/home-inspection-ut.jpg')"><div><h3>UT</h3><p>鋼材内部のきずや厚さを確認します。</p></div></article>
          <article class="service-card" style="background-image:url('../../assets/suruga/home-inspection-pt.jpg')"><div><h3>PT</h3><p>表面欠陥を分かりやすく可視化します。</p></div></article>
          <article class="service-card" style="background-image:url('../../assets/suruga/home-inspection-mt.jpg')"><div><h3>鉄筋探査</h3><p>コンクリート内部の位置情報を整理します。</p></div></article>
        </div>
      </div>
    </section>
    <section class="closing" id="contact">
      <div class="section-inner">
        <div><p class="section-label">CONTACT</p><h2>検査相談、会社説明、採用相談まで。</h2><p>検査内容が固まっていない段階でも、対象物と現場条件から相談できます。</p></div>
        <a class="button primary" href="#">お問い合わせフォーム</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function candidateBHtml(candidate) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(candidate.label)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#07111d;color:#e9f2ff;font-family:"Noto Sans JP","Yu Gothic",sans-serif}.shell{min-height:100vh;background:linear-gradient(120deg,#07111d,#162944)}.wrap{width:min(1120px,calc(100vw - 40px));margin:0 auto}.site-header{padding:28px 0;display:flex;justify-content:space-between;align-items:center}.brand{font-weight:900}.nav{display:flex;gap:20px;color:#9fb1c7;font-size:12px}.hero{padding:96px 0 64px;display:grid;grid-template-columns:1fr 420px;gap:48px;align-items:center}.kicker{color:#77a8c8;font-weight:900;font-size:12px}h1{font-size:clamp(40px,5vw,72px);line-height:1.04;margin:16px 0}.lead{color:#b9c7d9;line-height:2;font-weight:700}.dashboard{border:1px solid rgba(255,255,255,.16);background:#0d1d31;padding:22px}.dashboard article{border-top:1px solid rgba(255,255,255,.12);padding:16px 0}.dashboard article:first-child{border-top:0}.photo{height:280px;background:url('../../assets/suruga/home-hero.jpg') center/cover;border:1px solid rgba(255,255,255,.12);filter:saturate(.88) contrast(1.06)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:34px 0 72px}.card{border:1px solid rgba(255,255,255,.12);background:#0f223a;padding:20px;min-height:148px}.card h3{margin:0 0 10px}.card p{margin:0;color:#9fb1c7;line-height:1.7;font-size:13px}@media(max-width:820px){.hero,.grid{grid-template-columns:1fr}.nav{display:none}}
  </style></head><body><div class="shell"><div class="wrap">${commonHeader().replace("site-header","site-header").replace(/<nav[\s\S]*<\/nav>/,"<div class='nav'>検査内容 / 教育体制 / 会社概要</div>")}<section class="hero"><div><p class="kicker">CONTROL VIEW</p><h1>非破壊検査を、工程の中で制御する。</h1><p class="lead">情報密度は高いが、全体が暗く重く、会社サイトとしては開かれた信頼感が弱くなる候補。</p></div><div><div class="photo"></div><div class="dashboard"><article><b>UT / PT / 鉄筋探査</b><p>三重・東海・近畿圏</p></article><article><b>REPORT FLOW</b><p>現場確認から報告まで</p></article></div></div></section><section class="grid"><article class="card"><h3>高い専門性</h3><p>設備や構造物の状態を丁寧に見極めます。</p></article><article class="card"><h3>確かな信頼性</h3><p>検査結果を次の判断につなげます。</p></article><article class="card"><h3>教育体制</h3><p>若手技術者を段階的に育てます。</p></article></section></div></div></body></html>`;
}

function candidateCHtml(candidate) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(candidate.label)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f6f8fb;color:#172d48;font-family:"Noto Sans JP","Yu Gothic",sans-serif}header{width:min(1120px,calc(100vw - 32px));margin:0 auto;padding:22px 0;display:flex;justify-content:space-between}.brand{font-weight:900}.hero{width:min(1120px,calc(100vw - 32px));margin:0 auto;padding:68px 0 42px;text-align:center}.badge{display:inline-flex;padding:8px 14px;border-radius:999px;background:#e9f1fb;color:#2f6fb2;font-size:12px;font-weight:900}h1{font-size:clamp(36px,5vw,64px);line-height:1.08;margin:18px auto;max-width:760px}.lead{max-width:680px;margin:0 auto;color:#5f7083;line-height:1.9;font-weight:700}.button{display:inline-flex;margin-top:24px;padding:14px 20px;border-radius:999px;background:#2f6fb2;color:white;font-weight:900}.photo{width:min(960px,calc(100vw - 32px));height:340px;margin:36px auto;border-radius:24px;background:url('../../assets/suruga/home-hero.jpg') center/cover;box-shadow:0 20px 48px rgba(28,63,101,.16)}.cards{width:min(1120px,calc(100vw - 32px));margin:0 auto 80px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.card{border-radius:22px;background:white;padding:24px;box-shadow:0 18px 42px rgba(30,70,112,.1)}.card h3{margin:0 0 10px}.card p{margin:0;color:#65778a;line-height:1.7;font-size:13px}@media(max-width:760px){.cards{grid-template-columns:1fr}.photo{height:260px}}
  </style></head><body><header><div class="brand">有限会社三重非破壊検査</div><div>TOP / 検査内容 / 採用</div></header><section class="hero"><span class="badge">MIE NDT</span><h1>社会の安全を、確かな技術で支え続ける。</h1><p class="lead">読みやすいが、丸いカードと中央寄せの安全構成に寄りすぎて、専門会社の現場感と設計の強さが弱い候補。</p><a class="button">お問い合わせ</a></section><div class="photo"></div><section class="cards"><article class="card"><h3>高い専門性</h3><p>検査を行います。</p></article><article class="card"><h3>確かな信頼性</h3><p>報告まで支えます。</p></article><article class="card"><h3>教育体制</h3><p>若手技術者を育てます。</p></article></section></body></html>`;
}

function renderCandidateHtml(candidate) {
  if (candidate.id === "candidate-a") return candidateAHtml(candidate);
  if (candidate.id === "candidate-b") return candidateBHtml(candidate);
  return candidateCHtml(candidate);
}

function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const resolvedRoot = path.resolve(root);
    const server = http.createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
        let relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
        if (!relativePath || relativePath.endsWith("/")) {
          relativePath = path.join(relativePath, "index.html");
        }
        const filePath = path.resolve(resolvedRoot, relativePath);
        if (!isPathWithin(resolvedRoot, filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          response.end("not found");
          return;
        }
        response.writeHead(200, { "content-type": contentTypeFor(filePath) });
        fs.createReadStream(filePath).pipe(response);
      } catch (error) {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end(error && error.message ? error.message : String(error));
      }
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function closeStaticServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}

function existingExecutable(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || "";
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForFileSync(filePath, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return true;
    sleepSync(200);
  }
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

function findHeadlessBrowserExecutable() {
  if (process.env.DESIGN_QUALITY_BROWSER) {
    return fs.existsSync(process.env.DESIGN_QUALITY_BROWSER) ? process.env.DESIGN_QUALITY_BROWSER : "";
  }
  if (process.platform !== "win32") {
    return existingExecutable([
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]);
  }
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  return existingExecutable([
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
  ]);
}

function quotePowerShellArg(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function formatPowerShellArg(value) {
  const raw = String(value);
  return /\s|['"]/.test(raw) ? quotePowerShellArg(raw) : raw;
}

function spawnHeadlessBrowser(browserPath, args) {
  if (process.platform === "win32") {
    return spawnSync(
      "powershell.exe",
      ["-NoProfile", "-Command", ["&", quotePowerShellArg(browserPath), ...args.map(formatPowerShellArg)].join(" ")],
      {
        cwd: workspaceRoot,
        encoding: "utf8",
        timeout: 60000,
        windowsHide: true,
      },
    );
  }
  return spawnSync(browserPath, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    timeout: 60000,
    windowsHide: true,
  });
}

function runHeadlessBrowserScreenshot({ browserPath, url, screenshotPath, viewport, userDataDir }) {
  ensureDir(path.dirname(screenshotPath));
  ensureDir(userDataDir);
  const result = spawnHeadlessBrowser(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    `--screenshot=${screenshotPath}`,
    url,
  ]);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || `${path.basename(browserPath)} exited with status ${result.status}`);
  }
  if (!waitForFileSync(screenshotPath)) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`screenshot was not created: ${screenshotPath}${output ? ` (${output})` : ""}`);
  }
}

async function captureScreenshotsWithHeadlessBrowser({ runRoot, candidates, screenshotsRoot }) {
  const result = {
    status: "not_run",
    error: "",
    items: [],
  };
  const browserPath = findHeadlessBrowserExecutable();
  if (!browserPath) {
    result.status = "blocked";
    result.error = "No Chrome or Edge executable found for headless screenshots.";
    return result;
  }
  let staticServer;
  const profileRoot = path.join(runRoot, ".browser-profile");
  try {
    staticServer = await startStaticServer(runRoot);
    for (const candidate of candidates) {
      const candidateUrl = `${staticServer.origin}/candidates/${encodeURIComponent(candidate.id)}/index.html`;
      for (const viewport of [
        { id: "desktop", width: 1440, height: 960, fullPage: false },
        { id: "mobile", width: 390, height: 920, fullPage: false },
      ]) {
        const fileName = `${candidate.id}-${viewport.id}.png`;
        const screenshotPath = path.join(screenshotsRoot, fileName);
        runHeadlessBrowserScreenshot({
          browserPath,
          url: candidateUrl,
          screenshotPath,
          viewport,
          userDataDir: path.join(profileRoot, `${candidate.id}-${viewport.id}`),
        });
        result.items.push({
          candidateId: candidate.id,
          viewport: viewport.id,
          width: viewport.width,
          height: viewport.height,
          path: `screenshots/${fileName}`,
        });
      }
    }
    result.status = "pass";
  } catch (error) {
    result.status = "blocked";
    result.error = error && error.message ? error.message : String(error);
  } finally {
    await closeStaticServer(staticServer && staticServer.server);
    try {
      removeDirSafe(profileRoot);
    } catch (_) {
      // Best-effort cleanup for temporary browser profiles.
    }
  }
  return result;
}

function runPlaywrightCli(args, sessionName) {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${sessionName}`, ...args],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || `playwright-cli exited with status ${result.status}`);
  }
  return result.stdout || "";
}

async function captureScreenshotsWithCli({ runRoot, candidates, screenshotsRoot }) {
  const result = {
    status: "not_run",
    error: "",
    items: [],
  };
  const sessionName = `dqo-${crypto.randomBytes(5).toString("hex")}`;
  let staticServer;
  try {
    staticServer = await startStaticServer(runRoot);
    runPlaywrightCli(["open", "about:blank"], sessionName);
    for (const candidate of candidates) {
      const candidateUrl = `${staticServer.origin}/candidates/${encodeURIComponent(candidate.id)}/index.html`;
      for (const viewport of [
        { id: "desktop", width: 1440, height: 960, fullPage: false },
        { id: "mobile", width: 390, height: 920, fullPage: false },
      ]) {
        runPlaywrightCli(["resize", String(viewport.width), String(viewport.height)], sessionName);
        runPlaywrightCli(["goto", candidateUrl], sessionName);
        const fileName = `${candidate.id}-${viewport.id}.png`;
        const screenshotPath = path.join(screenshotsRoot, fileName);
        const screenshotArgs = ["screenshot", "--filename", screenshotPath];
        if (viewport.fullPage) screenshotArgs.push("--full-page");
        runPlaywrightCli(screenshotArgs, sessionName);
        result.items.push({
          candidateId: candidate.id,
          viewport: viewport.id,
          width: viewport.width,
          height: viewport.height,
          path: `screenshots/${fileName}`,
        });
      }
    }
    result.status = "pass";
  } catch (error) {
    result.status = "blocked";
    result.error = error && error.message ? error.message : String(error);
  } finally {
    try {
      runPlaywrightCli(["close"], sessionName);
    } catch (_) {
      // Best-effort cleanup for CLI sessions.
    }
    await closeStaticServer(staticServer && staticServer.server);
  }
  return result;
}

async function captureScreenshots({ runRoot, candidates, requireScreenshots }) {
  const screenshotsRoot = path.join(runRoot, "screenshots");
  ensureDir(screenshotsRoot);
  const result = {
    status: "not_run",
    error: "",
    items: [],
  };
  let chromium;
  try {
    ({ chromium } = require("@playwright/test"));
  } catch (error) {
    const browserResult = await captureScreenshotsWithHeadlessBrowser({ runRoot, candidates, screenshotsRoot });
    if (browserResult.status === "pass") return browserResult;
    if (process.env.DESIGN_QUALITY_ALLOW_NPX_CLI !== "1") {
      result.status = "blocked";
      result.error = `@playwright/test unavailable and headless browser fallback failed: ${browserResult.error || error.message}`;
      if (requireScreenshots) throw new Error(result.error);
      return result;
    }
    const cliResult = await captureScreenshotsWithCli({ runRoot, candidates, screenshotsRoot });
    if (cliResult.status === "pass") return cliResult;
    result.status = "blocked";
    result.error = `@playwright/test unavailable, headless browser fallback failed: ${browserResult.error || error.message}, playwright-cli fallback failed: ${cliResult.error || error.message}`;
    if (requireScreenshots) throw new Error(result.error);
    return result;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const candidate of candidates) {
      const candidatePath = path.join(runRoot, "candidates", candidate.id, "index.html");
      for (const viewport of [
        { id: "desktop", width: 1440, height: 960, fullPage: false },
        { id: "mobile", width: 390, height: 920, fullPage: false },
      ]) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await page.goto(pathToFileURL(candidatePath).toString(), { waitUntil: "load" });
        const fileName = `${candidate.id}-${viewport.id}.png`;
        const screenshotPath = path.join(screenshotsRoot, fileName);
        await page.screenshot({ path: screenshotPath, fullPage: viewport.fullPage });
        await page.close();
        result.items.push({
          candidateId: candidate.id,
          viewport: viewport.id,
          width: viewport.width,
          height: viewport.height,
          path: `screenshots/${fileName}`,
        });
      }
    }
    result.status = "pass";
  } catch (error) {
    result.status = "blocked";
    result.error = error && error.message ? error.message : String(error);
    if (requireScreenshots) throw error;
  } finally {
    if (browser) await browser.close();
  }
  return result;
}

function buildScorecard(candidates, screenshotResult) {
  return {
    schema: "design-quality-scorecard.v1",
    generatedAt: new Date().toISOString(),
    screenshotEvidence: {
      status: screenshotResult.status,
      error: screenshotResult.error,
      count: screenshotResult.items.length,
      items: screenshotResult.items,
    },
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      decision: candidate.decision,
      summary: candidate.summary,
      score: totalScore(candidate.score),
      axes: candidate.score,
      rejectedReasons: candidate.decision !== "recommended" ? rejectedReasonsFor(candidate.id) : [],
    })).sort((a, b) => b.score - a.score),
  };
}

function rejectedReasonsFor(candidateId) {
  if (candidateId === "candidate-a") {
    return [
      "failed customer-image benchmark after Suruga reference was locked",
      "real photo presence is not enough without stronger composition and hierarchy",
      "requires human design review before any auto recommendation"
    ];
  }
  if (candidateId === "candidate-b") {
    return [
      "too close to dark_console_as_default",
      "less inviting for a public company TOP page",
      "requires stronger copy work to avoid operator-console tone"
    ];
  }
  if (candidateId === "candidate-c") {
    return [
      "too close to generic_saas_cards",
      "rounded card stack creates template feel",
      "field photography becomes secondary instead of first-viewport proof"
    ];
  }
  return [];
}

function evaluateCalibrationGate({ policy, brief, winner }) {
  const gate = policy.calibrationGate || {};
  const reference = policy.customerImageReference || {};
  const diagnosis = policy.currentSiteDiagnosis || {};
  const winConditions = Array.isArray(policy.winConditions) ? policy.winConditions : [];
  const antiReference = Array.isArray(policy.antiReference) ? policy.antiReference : [];
  const score = winner && winner.axes ? winner.axes : {};
  const checks = [
    {
      id: "customer_image_reference_locked",
      pass: Boolean(reference.url && reference.label && Array.isArray(reference.observedSignals) && reference.observedSignals.length >= 4),
      detail: reference.url || "missing",
    },
    {
      id: "current_site_diagnosis_present",
      pass: !gate.requiresCurrentSiteDiagnosis || (Array.isArray(diagnosis.weaknessesToBeat) && diagnosis.weaknessesToBeat.length >= 3),
      detail: diagnosis.status || "missing",
    },
    {
      id: "win_conditions_present",
      pass: !gate.requiresWinConditions || winConditions.length >= 4,
      detail: `${winConditions.length} win conditions`,
    },
    {
      id: "anti_reference_present",
      pass: !gate.requiresAntiReference || antiReference.length >= 3,
      detail: `${antiReference.length} anti references`,
    },
    {
      id: "winner_customer_image_fit",
      pass: Number(score.customer_image_fit || 0) >= Number((policy.decisionThresholds || {}).autoRecommendMinCustomerImageFit || 88),
      detail: `${Number(score.customer_image_fit || 0)}/100`,
    },
    {
      id: "winner_benchmark_competitiveness",
      pass: Number(score.benchmark_competitiveness || 0) >= Number((policy.decisionThresholds || {}).autoRecommendMinBenchmarkCompetitiveness || 86),
      detail: `${Number(score.benchmark_competitiveness || 0)}/100`,
    },
    {
      id: "winner_composition_maturity",
      pass: Number(score.composition_maturity || 0) >= Number((policy.decisionThresholds || {}).autoRecommendMinCompositionMaturity || 86),
      detail: `${Number(score.composition_maturity || 0)}/100`,
    },
  ];
  const failed = checks.filter((check) => !check.pass);
  return {
    status: failed.length ? "CALIBRATION_NOT_PASSED" : "CALIBRATED_PASS",
    requiredForAutoRecommend: gate.requiredForAutoRecommend !== false,
    reference: {
      id: reference.id || "",
      label: reference.label || "",
      url: reference.url || "",
      role: reference.role || "",
    },
    checks,
    failedChecks: failed.map((check) => check.id),
    winConditions,
    antiReference,
    currentSiteDiagnosis: diagnosis,
    note: failed.length
      ? "Auto-recommend is blocked until the candidate beats the locked customer-image benchmark."
      : "Customer-image calibration allows auto-recommend if ordinary score and evidence gates also pass.",
  };
}

function buildDecision({ policy, brief, scorecard }) {
  const ranked = scorecard.candidates;
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const thresholds = policy.decisionThresholds || {};
  const screenshotPass = scorecard.screenshotEvidence.status === "pass";
  const calibration = evaluateCalibrationGate({ policy, brief, winner });
  const calibrationPass = !calibration.requiredForAutoRecommend || calibration.status === "CALIBRATED_PASS";
  const scoreGap = runnerUp ? winner.score - runnerUp.score : winner.score;
  let route = "review_inbox";
  let status = "NEEDS_DECISION";
  let humanDecisionRequired = true;
  if (!screenshotPass) {
    route = "failed_validation";
    status = "FAILED_VALIDATION";
  } else if (winner.score < Number(thresholds.rejectBelowScore || 70)) {
    route = "failed_validation";
    status = "FAILED_VALIDATION";
  } else if (
    winner.score >= Number(thresholds.autoRecommendScore || 86)
    && scoreGap >= Number(thresholds.needsHumanDecisionScoreGap || 7)
    && calibrationPass
  ) {
    route = "auto_recommend";
    status = "PASS";
    humanDecisionRequired = false;
  }
  const winningScreenshots = scorecard.screenshotEvidence.items
    .filter((item) => item.candidateId === winner.id)
    .map((item) => ({
      viewport: item.viewport,
      path: item.path,
      width: item.width,
      height: item.height,
    }));
  const candidatePassed = status === "PASS";
  const recommendationLabel = candidatePassed ? winner.label : "No candidate passed calibration";
  const recommendationSummary = candidatePassed
    ? winner.summary
    : `Top-scoring candidate (${winner.label}) is blocked by calibration and score gates.`;
  return {
    schema: "design-quality-operator-decision.v1",
    generatedAt: new Date().toISOString(),
    operatorName: policy.operatorName || "Design Quality Operator",
    status,
    route,
    humanDecisionRequired,
    target: brief.target,
    calibration,
    recommendation: {
      candidateId: winner.id,
      label: recommendationLabel,
      score: winner.score,
      summary: recommendationSummary,
      candidateLabel: winner.label,
      recommended: candidatePassed,
      detailPath: "/design-quality/latest/index.html",
      candidatePath: `candidates/${winner.id}/index.html`,
      screenshots: winningScreenshots,
    },
    presentationPolicy: {
      confidenceLevel: candidatePassed ? "high" : "low",
      showCandidateImages: candidatePassed,
      auditImagesCollapsed: !candidatePassed,
      userFacingLabel: candidatePassed ? "show_recommended_design" : "do_not_show_candidate_images",
      reason: candidatePassed
        ? "The candidate passed calibration and score gates."
        : "The operator must not show low-confidence or failed-validation candidate images as if they were deliverables.",
    },
    why: [
      calibrationPass
        ? "The candidate passes the locked customer-image benchmark and ordinary visual evidence gates."
        : "The Suruga customer-image benchmark is now locked, and the current top candidate does not pass that benchmark.",
      "A real field photo is necessary but not sufficient; composition maturity, service credibility, and hierarchy must also pass.",
      "Auto-recommend remains blocked until the candidate beats the reference on first-view clarity and industrial trust."
    ],
    risks: [
      calibrationPass
        ? "The design image still needs human adoption review before applying to MieNDI production files."
        : "The current generated image should be treated as failure evidence, not a recommended design.",
      "This is a design image/prototype, not a direct MieNDI production patch.",
      "Live Laravel data, exact Blade integration, and final accessibility checks remain separate apply-stage work."
    ],
    rejected: ranked.filter((candidate) => candidate.id !== winner.id).map((candidate) => ({
      candidateId: candidate.id,
      label: candidate.label,
      score: candidate.score,
      reasons: candidate.rejectedReasons,
    })),
    evidence: {
      scorecard: "scorecard.json",
      brief: "brief.json",
      screenshotsStatus: scorecard.screenshotEvidence.status,
      screenshots: winningScreenshots,
      detailPath: "/design-quality/latest/index.html",
    },
    inbox: humanDecisionRequired
      ? {
        title: "Design decision needed",
        recommendation: winner.id,
        options: ranked.slice(0, 2).map((candidate) => ({
          id: candidate.id,
          label: candidate.label,
          score: candidate.score,
          summary: candidate.summary,
        })),
      }
      : {
        title: "No human decision required",
        recommendation: winner.id,
        options: [],
      },
  };
}

function buildRejected(scorecard) {
  return {
    schema: "design-quality-rejected-candidates.v1",
    generatedAt: new Date().toISOString(),
    rejected: scorecard.candidates
      .filter((candidate) => candidate.decision === "rejected" || candidate.rejectedReasons.length)
      .map((candidate) => ({
        candidateId: candidate.id,
        label: candidate.label,
        score: candidate.score,
        reasons: candidate.rejectedReasons,
      })),
  };
}

function buildDetailHtml({ decision, scorecard }) {
  const winner = decision.recommendation;
  const desktop = winner.screenshots.find((item) => item.viewport === "desktop");
  const mobile = winner.screenshots.find((item) => item.viewport === "mobile");
  const passed = winner.recommended === true;
  const title = passed
    ? `${decision.target.label} recommended TOP design image`
    : `${decision.target.label} DQO calibration result`;
  const statusLabel = passed ? "Recommended" : "No accepted candidate";
  const reasonHeading = passed ? "Recommendation reasons" : "Why this did not pass";
  const desktopCaption = passed ? "Recommended desktop image" : "Top candidate desktop evidence";
  const desktopAlt = passed ? "recommended desktop design image" : "top candidate desktop evidence image";
  const mobileAlt = passed ? "recommended mobile design image" : "top candidate mobile evidence image";
  const shotFigures = `
      <figure>
        <figcaption>${escapeHtml(desktopCaption)}</figcaption>
        ${desktop ? `<img src="${escapeHtml(desktop.path)}" alt="${escapeHtml(desktopAlt)}">` : "<p>Desktop screenshot missing.</p>"}
      </figure>
      <figure>
        <figcaption>Mobile image</figcaption>
        ${mobile ? `<img src="${escapeHtml(mobile.path)}" alt="${escapeHtml(mobileAlt)}">` : "<p>Mobile screenshot missing.</p>"}
      </figure>`;
  const shotSection = passed
    ? `<section class="shot-grid">${shotFigures}</section>`
    : `<section class="panel blocked-visual">
      <h2>Candidate images hidden</h2>
      <p>This run did not pass calibration. Low-confidence candidate images are not shown as user-facing design output.</p>
      <details>
        <summary>Open audit evidence only</summary>
        <div class="shot-grid">${shotFigures}</div>
      </details>
    </section>`;
  const rejectedRows = decision.rejected.map((item) => `
    <article class="reject-card">
      <span>${escapeHtml(String(item.score))}</span>
      <h3>${escapeHtml(item.label)}</h3>
      <ul>${item.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
    </article>`).join("");
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Design Quality Operator | ${escapeHtml(decision.target.label)}</title>
  <style>
    :root { color-scheme: light; font-family: "Noto Sans JP", "Yu Gothic", sans-serif; --ink:#15283d; --muted:#637488; --line:#d8e2ec; --panel:#fff; --bg:#f2f6f9; --blue:#2f6fb2; --green:#15865f; --warn:#9b6a00; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); }
    a { color:inherit; }
    .shell { width:min(1240px, calc(100vw - 36px)); margin:0 auto; padding:34px 0 54px; }
    header { display:grid; gap:10px; margin-bottom:22px; }
    .kicker { margin:0; color:var(--blue); font-size:12px; font-weight:900; }
    h1 { margin:0; font-size:clamp(28px,4vw,48px); line-height:1.14; }
    .status-grid { display:grid; grid-template-columns:1fr 1.2fr; gap:16px; margin:22px 0; }
    .panel { border:1px solid var(--line); background:var(--panel); padding:18px; }
    .decision strong { display:inline-flex; padding:7px 10px; background:#e7f5ef; color:var(--green); font-size:13px; }
    .decision p, .panel li { color:var(--muted); line-height:1.65; font-size:13px; font-weight:700; }
    .shot-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(220px,.33fr); gap:16px; align-items:start; }
    figure { margin:0; border:1px solid var(--line); background:white; }
    figcaption { padding:10px 12px; color:var(--muted); font-size:12px; font-weight:900; border-bottom:1px solid var(--line); }
    img { width:100%; display:block; }
    .reject-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-top:16px; }
    .reject-card { border:1px solid var(--line); background:white; padding:16px; }
    .reject-card span { color:var(--warn); font-weight:900; font-size:13px; }
    .reject-card h3 { margin:6px 0 8px; font-size:16px; }
    .blocked-visual { margin:16px 0; border-color:#e4c9c9; background:#fff7f7; }
    .blocked-visual p { color:#854f4f; font-weight:800; line-height:1.7; }
    .blocked-visual details { margin-top:12px; }
    .blocked-visual summary { cursor:pointer; font-weight:900; color:#6f3f3f; }
    .blocked-visual details .shot-grid { margin-top:14px; }
    .links { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
    .links a { display:inline-flex; align-items:center; min-height:38px; padding:0 13px; border:1px solid var(--line); background:white; text-decoration:none; font-weight:900; font-size:12px; }
    @media (max-width: 820px) { .status-grid, .shot-grid, .reject-grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <p class="kicker">${escapeHtml(decision.operatorName)}</p>
      <h1>${escapeHtml(title)}</h1>
    </header>
    <section class="status-grid">
      <article class="panel decision">
        <strong>${escapeHtml(decision.status)} / ${escapeHtml(decision.route)}</strong>
        <p>${escapeHtml(statusLabel)}: ${escapeHtml(winner.label)} (${winner.score}/100)</p>
        ${winner.candidateLabel ? `<p>Top candidate: ${escapeHtml(winner.candidateLabel)}</p>` : ""}
        <p>Human decision: ${decision.humanDecisionRequired ? "required" : "not required"}</p>
        <div class="links">
          <a href="${escapeHtml(winner.candidatePath)}" target="_blank" rel="noopener">Open candidate HTML</a>
          <a href="scorecard.json" target="_blank" rel="noopener">scorecard.json</a>
          <a href="decision.json" target="_blank" rel="noopener">decision.json</a>
        </div>
      </article>
      <article class="panel">
        <h2>${escapeHtml(reasonHeading)}</h2>
        <ul>${decision.why.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </section>
    ${shotSection}
    <section class="panel" style="margin-top:16px">
      <h2>自動棄却</h2>
      <p>通常はここを見なくてよいですが、Operatorが何を落としたかを監査できます。</p>
      <div class="reject-grid">${rejectedRows}</div>
    </section>
    <section class="panel" style="margin-top:16px">
      <h2>残留リスク</h2>
      <ul>${decision.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <p>候補数: ${scorecard.candidates.length} / screenshot evidence: ${escapeHtml(scorecard.screenshotEvidence.status)}</p>
    </section>
  </main>
</body>
</html>`;
}

function writeCandidateFiles({ runRoot, candidates }) {
  for (const candidate of candidates) {
    const candidateRoot = path.join(runRoot, "candidates", candidate.id);
    writeText(path.join(candidateRoot, "index.html"), renderCandidateHtml(candidate));
  }
}

function appendLog(logPath, payload) {
  ensureDir(path.dirname(logPath));
  fs.appendFileSync(logPath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function runDesignQualityOperator(rawArgs = {}) {
  const policy = readJson(defaultPolicyPath);
  const visualGrammar = readJson(defaultVisualGrammarPath);
  const antiTaste = readJson(defaultAntiTastePath);
  const tasteMemory = fs.existsSync(defaultTasteMemoryPath) ? readJson(defaultTasteMemoryPath) : {};
  const targetRoot = targetRootFromArgs(rawArgs, policy);
  const runId = `${normalizedRunId(rawArgs["run-id"])}-mie-ndi-top`;
  const outputRoot = path.resolve(workspaceRoot, safeString(rawArgs["output-root"], 2000) || path.join("output", "design_runs"));
  const runRoot = path.join(outputRoot, runId);
  if (!isPathWithin(workspaceRoot, runRoot)) {
    throw new Error(`output root must stay inside workspace: ${runRoot}`);
  }
  removeDirSafe(runRoot);
  ensureDir(runRoot);

  const brief = buildBrief({ targetRoot, policy, visualGrammar, antiTaste, tasteMemory });
  const candidates = buildCandidateData();
  const assets = prepareAssets(targetRoot, runRoot);
  writeCandidateFiles({ runRoot, candidates });
  writeJson(path.join(runRoot, "brief.json"), { ...brief, assets });

  const skipScreenshots = boolArg(rawArgs["skip-screenshots"], false);
  const requireScreenshots = boolArg(rawArgs["require-screenshots"], false);
  const screenshotResult = skipScreenshots
    ? { status: "skipped", error: "", items: [] }
    : await captureScreenshots({ runRoot, candidates, requireScreenshots });
  const scorecard = buildScorecard(candidates, screenshotResult);
  const decision = buildDecision({ policy, brief, scorecard });
  const rejected = buildRejected(scorecard);
  writeJson(path.join(runRoot, "scorecard.json"), scorecard);
  writeJson(path.join(runRoot, "decision.json"), decision);
  writeJson(path.join(runRoot, "rejected.json"), rejected);
  writeText(path.join(runRoot, "index.html"), buildDetailHtml({ decision, scorecard }));

  const publishWeb = boolArg(rawArgs["publish-web"], true);
  if (publishWeb) {
    const webRoot = path.resolve(workspaceRoot, safeString(rawArgs["web-root"], 2000) || path.join("web", "design-quality", "latest"));
    copyDirectorySafe(runRoot, webRoot);
  }

  if (boolArg(rawArgs.log, true)) {
    appendLog(path.join(workspaceRoot, "logs", "design_operator.jsonl"), {
      event: "design_quality_operator_run",
      at: new Date().toISOString(),
      runId,
      targetRoot,
      status: decision.status,
      route: decision.route,
      recommendation: decision.recommendation && decision.recommendation.candidateId,
      score: decision.recommendation && decision.recommendation.score,
      output: path.relative(workspaceRoot, runRoot).replace(/\\/g, "/"),
    });
  }

  return {
    runRoot,
    runId,
    decision,
    scorecard,
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!["run", "generate", "score"].includes(args.command)) {
    console.error(`Unknown command: ${args.command}`);
    process.exit(1);
  }
  try {
    const result = await runDesignQualityOperator(args);
    console.log(JSON.stringify({
      ok: true,
      runId: result.runId,
      status: result.decision.status,
      route: result.decision.route,
      recommendation: result.decision.recommendation,
      runRoot: result.runRoot,
    }, null, 2));
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBrief,
  buildCandidateData,
  buildDecision,
  buildScorecard,
  main,
  runDesignQualityOperator,
  totalScore,
};

"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultDesignAcceptanceContractPath = path.join(workspaceRoot, "scripts", "config", "design_acceptance_contract.json");
const defaultTasteMemorySeedPath = path.join(workspaceRoot, "scripts", "config", "default_user_taste_memory.json");

const defaultDesignAcceptanceContract = Object.freeze({
  schema: "design-acceptance-contract.v1",
  version: "2026-03-13.r1",
  mode: "intent-first",
  benchmarkComparisonRequired: true,
  visualReviewRequired: true,
  independentReviewRequired: true,
  docSyncRequired: true,
  technicalVerificationRequired: true,
  workspaceLock: {
    requiredForSources: ["web_ui"],
    rejectWhenUnlocked: true,
  },
  promptEnvelope: {
    title: "Intent-First Brief",
    enabledForSources: ["web_ui"],
    completionRule: "Do not claim completion unless the output beats the benchmark, avoids banned patterns, and has screenshot + reviewer evidence.",
  },
  keywords: [
    "design",
    "ui",
    "ux",
    "site",
    "website",
    "landing",
    "brand",
    "visual",
    "look",
    "feel",
    "aesthetic",
    "beautiful",
    "quality",
    "layout",
    "style",
    "aiっぽ",
    "ai感",
    "テンプレ",
    "サイト",
    "デザイン",
    "見た目",
    "雰囲気",
  ],
  prohibitedPatterns: [
    "generic glassmorphism or translucent panel stacks",
    "uniform card grids that flatten hierarchy",
    "template-like blue gradient dashboard language",
    "abstract copy with no concrete proof or realness",
  ],
  requiredArtifacts: [
    "locked intent summary",
    "benchmark decomposition",
    "desktop screenshot review",
    "mobile screenshot review",
    "independent reviewer verdict",
    "technical verification evidence",
    "documentation sync",
  ],
  evaluationAxes: [
    "intent alignment",
    "realness and credibility",
    "typographic hierarchy",
    "information density",
    "benchmark superiority",
  ],
});

const defaultTasteProfile = Object.freeze({
  id: "default",
  label: "Akima Intent Profile",
  northStar: "The harness must understand the user's ideal and ship work that does not feel AI-generated or template-derived.",
  qualityBar: "Do not stop at passing checks. The outcome must feel more convincing, more deliberate, and more real than the stated benchmark.",
  mustHaves: [
    "Intent is translated into explicit acceptance checks before implementation.",
    "Outputs have hierarchy, density, and material realness.",
    "Benchmark strengths are named and surpassed intentionally.",
    "If visual quality is weak, the task is not complete.",
  ],
  avoid: [
    "AI-feeling glassmorphism",
    "uniform card dashboards",
    "badge-heavy template language",
    "abstract copy with no concrete proof",
  ],
  benchmarkUrls: [
    "https://www.suruga-k.jp/",
  ],
  notes: [
    "Build, tests, and HTTP 200 are necessary but never sufficient.",
    "Workspace targeting mistakes must be treated as hard failures.",
  ],
  updatedAt: 0,
});

const defaultTasteMemoryStore = Object.freeze({
  schema: "user-taste-memory.v1",
  version: 1,
  activeProfileId: "default",
  updatedAt: 0,
  profiles: {
    default: defaultTasteProfile,
  },
});

function compactText(value, max = 240) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, Math.max(1, Math.trunc(max)));
}

function safePositiveInt(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.trunc(fallback));
  }
  return Math.max(0, Math.trunc(numeric));
}

function normalizeTextList(value, { maxItems = 8, maxChars = 180 } = {}) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|[,;]+/)
      : [];
  const items = [];
  const seen = new Set();
  for (const raw of source) {
    const normalized = compactText(raw, maxChars);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(normalized);
    if (items.length >= maxItems) {
      break;
    }
  }
  return items;
}

function normalizeUrlList(value, { maxItems = 6 } = {}) {
  return normalizeTextList(value, { maxItems, maxChars: 240 }).filter((entry) => /^https?:\/\//i.test(entry));
}

function readJsonFileOrNull(targetPath) {
  try {
    if (!targetPath || !fs.existsSync(targetPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeDesignAcceptanceContract(source) {
  const input = source && typeof source === "object" ? source : {};
  const workspaceLockInput = input.workspaceLock && typeof input.workspaceLock === "object" ? input.workspaceLock : {};
  const promptEnvelopeInput = input.promptEnvelope && typeof input.promptEnvelope === "object" ? input.promptEnvelope : {};
  return {
    schema: compactText(input.schema, 80) || defaultDesignAcceptanceContract.schema,
    version: compactText(input.version, 80) || defaultDesignAcceptanceContract.version,
    mode: compactText(input.mode, 40).toLowerCase() || defaultDesignAcceptanceContract.mode,
    benchmarkComparisonRequired: input.benchmarkComparisonRequired !== false,
    visualReviewRequired: input.visualReviewRequired !== false,
    independentReviewRequired: input.independentReviewRequired !== false,
    docSyncRequired: input.docSyncRequired !== false,
    technicalVerificationRequired: input.technicalVerificationRequired !== false,
    workspaceLock: {
      requiredForSources: normalizeTextList(workspaceLockInput.requiredForSources || defaultDesignAcceptanceContract.workspaceLock.requiredForSources, { maxItems: 8, maxChars: 60 }),
      rejectWhenUnlocked: workspaceLockInput.rejectWhenUnlocked !== false,
    },
    promptEnvelope: {
      title: compactText(promptEnvelopeInput.title, 120) || defaultDesignAcceptanceContract.promptEnvelope.title,
      enabledForSources: normalizeTextList(promptEnvelopeInput.enabledForSources || defaultDesignAcceptanceContract.promptEnvelope.enabledForSources, { maxItems: 8, maxChars: 60 }),
      completionRule: compactText(promptEnvelopeInput.completionRule, 280) || defaultDesignAcceptanceContract.promptEnvelope.completionRule,
    },
    keywords: normalizeTextList(input.keywords || defaultDesignAcceptanceContract.keywords, { maxItems: 24, maxChars: 40 }),
    prohibitedPatterns: normalizeTextList(input.prohibitedPatterns || defaultDesignAcceptanceContract.prohibitedPatterns, { maxItems: 12, maxChars: 180 }),
    requiredArtifacts: normalizeTextList(input.requiredArtifacts || defaultDesignAcceptanceContract.requiredArtifacts, { maxItems: 12, maxChars: 180 }),
    evaluationAxes: normalizeTextList(input.evaluationAxes || defaultDesignAcceptanceContract.evaluationAxes, { maxItems: 10, maxChars: 120 }),
  };
}

function loadDesignAcceptanceContract(contractPath = defaultDesignAcceptanceContractPath) {
  const loaded = readJsonFileOrNull(contractPath);
  return normalizeDesignAcceptanceContract(loaded || defaultDesignAcceptanceContract);
}

function normalizeTasteProfile(source, fallback = defaultTasteProfile) {
  const input = source && typeof source === "object" ? source : {};
  const base = fallback && typeof fallback === "object" ? fallback : defaultTasteProfile;
  const id = compactText(input.id, 80).toLowerCase().replace(/[^a-z0-9._-]+/g, "_") || compactText(base.id, 80).toLowerCase() || "default";
  const northStarLines = normalizeTextList(
    input.northStarLines || input.northStar,
    { maxItems: 4, maxChars: 180 }
  );
  const mustHaves = normalizeTextList(
    input.mustHaves || input.prefers,
    { maxItems: 8, maxChars: 180 }
  );
  const avoid = normalizeTextList(
    input.avoid || input.rejects,
    { maxItems: 8, maxChars: 180 }
  );
  const benchmarkUrls = normalizeUrlList(
    input.benchmarkUrls || input.benchmarkSites,
    { maxItems: 6 }
  );
  const notes = normalizeTextList(
    input.notes || input.benchmarkNotes,
    { maxItems: 10, maxChars: 200 }
  );
  const requiredProof = normalizeTextList(
    input.requiredProof,
    { maxItems: 10, maxChars: 180 }
  );
  return {
    id,
    label: compactText(input.label, 120) || compactText(base.label, 120) || id,
    northStar: compactText(
      northStarLines.length ? northStarLines.join(" / ") : input.northStar,
      240
    ) || compactText(base.northStar, 240) || "",
    northStarLines: northStarLines.length
      ? northStarLines
      : normalizeTextList(base.northStarLines || base.northStar, { maxItems: 4, maxChars: 180 }),
    qualityBar: compactText(input.qualityBar, 240) || compactText(base.qualityBar, 240) || "",
    mustHaves: mustHaves.length ? mustHaves : normalizeTextList(base.mustHaves || base.prefers, { maxItems: 8, maxChars: 180 }),
    avoid: avoid.length ? avoid : normalizeTextList(base.avoid || base.rejects, { maxItems: 8, maxChars: 180 }),
    benchmarkUrls: benchmarkUrls.length ? benchmarkUrls : normalizeUrlList(base.benchmarkUrls || base.benchmarkSites, { maxItems: 6 }),
    notes: notes.length ? notes : normalizeTextList(base.notes || base.benchmarkNotes, { maxItems: 10, maxChars: 200 }),
    requiredProof: requiredProof.length ? requiredProof : normalizeTextList(base.requiredProof, { maxItems: 10, maxChars: 180 }),
    updatedAt: safePositiveInt(input.updatedAt, base.updatedAt || 0),
  };
}

function coerceStoreSeed(source) {
  if (source && typeof source === "object" && source.profiles && typeof source.profiles === "object") {
    return source;
  }
  return {
    schema: "user-taste-memory.v1",
    version: 1,
    activeProfileId: compactText(source && source.id, 80).toLowerCase() || "default",
    updatedAt: safePositiveInt(source && source.updatedAt, 0),
    profiles: {
      default: normalizeTasteProfile(source, defaultTasteProfile),
    },
  };
}

function normalizeUserTasteMemoryStore(source) {
  const input = coerceStoreSeed(source && typeof source === "object" ? source : defaultTasteMemoryStore);
  const profilesInput = input.profiles && typeof input.profiles === "object" ? input.profiles : {};
  const profiles = {};
  const profileKeys = Object.keys(profilesInput);
  for (const key of profileKeys.slice(0, 12)) {
    const normalizedKey = compactText(key, 80).toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
    if (!normalizedKey) {
      continue;
    }
    profiles[normalizedKey] = normalizeTasteProfile({
      ...(profilesInput[key] && typeof profilesInput[key] === "object" ? profilesInput[key] : {}),
      id: normalizedKey,
    }, defaultTasteProfile);
  }
  if (!Object.keys(profiles).length) {
    profiles.default = normalizeTasteProfile(defaultTasteProfile, defaultTasteProfile);
  }
  const activeProfileIdRaw = compactText(input.activeProfileId, 80).toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  const activeProfileId = profiles[activeProfileIdRaw] ? activeProfileIdRaw : Object.keys(profiles)[0];
  return {
    schema: compactText(input.schema, 80) || defaultTasteMemoryStore.schema,
    version: safePositiveInt(input.version, defaultTasteMemoryStore.version),
    activeProfileId,
    updatedAt: safePositiveInt(input.updatedAt, 0),
    profiles,
  };
}

function loadUserTasteMemoryStore({ memoryPath = "", seedPath = defaultTasteMemorySeedPath } = {}) {
  const loaded = memoryPath ? readJsonFileOrNull(memoryPath) : null;
  if (loaded) {
    return normalizeUserTasteMemoryStore(loaded);
  }
  const seed = readJsonFileOrNull(seedPath);
  if (seed) {
    return normalizeUserTasteMemoryStore(seed);
  }
  return normalizeUserTasteMemoryStore(defaultTasteMemoryStore);
}

function persistUserTasteMemoryStore(memoryPath, store) {
  if (!memoryPath) {
    throw new Error("memoryPath is required");
  }
  const normalized = normalizeUserTasteMemoryStore({
    ...(store && typeof store === "object" ? store : {}),
    updatedAt: Date.now(),
  });
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(memoryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

function activeTasteProfile(store) {
  const normalizedStore = normalizeUserTasteMemoryStore(store);
  return normalizedStore.profiles[normalizedStore.activeProfileId] || normalizedStore.profiles.default || normalizeTasteProfile(defaultTasteProfile);
}

function isDesignSensitiveRequest({ prompt = "", changedPaths = [], contract } = {}) {
  const normalizedContract = normalizeDesignAcceptanceContract(contract || defaultDesignAcceptanceContract);
  const promptText = compactText(prompt, 24000).toLowerCase();
  const pathList = Array.isArray(changedPaths) ? changedPaths : [];
  const promptMatch = normalizedContract.keywords.some((keyword) => promptText.includes(String(keyword).toLowerCase()));
  const pathMatch = pathList.some((entry) => {
    const normalized = String(entry || "").toLowerCase();
    return normalized.startsWith("web/")
      || normalized.endsWith(".css")
      || normalized.endsWith(".scss")
      || normalized.endsWith(".html")
      || normalized.endsWith(".blade.php");
  });
  return Boolean(promptMatch || pathMatch);
}

function requiresWorkspaceLockForSource({ contract, executionSource = "" } = {}) {
  const normalizedContract = normalizeDesignAcceptanceContract(contract || defaultDesignAcceptanceContract);
  const source = compactText(executionSource, 80).toLowerCase();
  if (!source) {
    return false;
  }
  const requiredSources = Array.isArray(normalizedContract.workspaceLock.requiredForSources)
    ? normalizedContract.workspaceLock.requiredForSources.map((entry) => compactText(entry, 80).toLowerCase()).filter(Boolean)
    : [];
  return requiredSources.includes(source);
}

function buildIntentFirstPrompt({ prompt = "", contract, activeProfile } = {}) {
  const normalizedPrompt = compactText(prompt, 24000);
  const normalizedContract = normalizeDesignAcceptanceContract(contract || defaultDesignAcceptanceContract);
  const profile = normalizeTasteProfile(activeProfile || defaultTasteProfile, defaultTasteProfile);
  const lines = [
    normalizedContract.promptEnvelope.title || "Intent-First Brief",
    `North star: ${profile.northStar}`,
    `Quality bar: ${profile.qualityBar}`,
  ];
  if (profile.mustHaves.length) {
    lines.push(`Must keep: ${profile.mustHaves.join(" | ")}`);
  }
  if (profile.avoid.length) {
    lines.push(`Do not ship: ${profile.avoid.join(" | ")}`);
  }
  if (profile.benchmarkUrls.length) {
    lines.push(`Benchmark refs: ${profile.benchmarkUrls.join(" | ")}`);
  }
  if (normalizedContract.promptEnvelope.completionRule) {
    lines.push(`Completion rule: ${normalizedContract.promptEnvelope.completionRule}`);
  }
  lines.push("");
  lines.push("Original request:");
  lines.push(normalizedPrompt);
  return lines.join("\n");
}

function hasVisualReviewEvidence(sampleMcpTools, sampleCommands, visualEvidence) {
  const evidence = visualEvidence && typeof visualEvidence === "object" ? visualEvidence : {};
  const desktopReview = Boolean(evidence.desktopReview);
  const mobileReview = Boolean(evidence.mobileReview);
  if (desktopReview && mobileReview) {
    return true;
  }
  const tools = Array.isArray(sampleMcpTools) ? sampleMcpTools.map((entry) => String(entry || "").toLowerCase()) : [];
  const commands = Array.isArray(sampleCommands) ? sampleCommands.map((entry) => String(entry || "").toLowerCase()) : [];
  const sawVisualTool = tools.some((entry) => entry.includes("playwright") || entry.includes("screenshot") || entry.includes("view_image"));
  const sawDesktopHint = commands.some((entry) => entry.includes("desktop") || /resize\s+(?:8\d{2}|9\d{2}|1\d{3,4})\s+\d+/i.test(entry));
  const sawMobileHint = commands.some((entry) => entry.includes("mobile") || entry.includes("iphone") || entry.includes("android") || /resize\s+(?:3\d{2}|4[0-8]\d)\s+\d+/i.test(entry));
  return sawVisualTool && sawDesktopHint && sawMobileHint;
}

function hasTechnicalEvidence(sampleCommands, commandExecutions) {
  if (Number.isFinite(Number(commandExecutions)) && Number(commandExecutions) > 0) {
    return true;
  }
  const commands = Array.isArray(sampleCommands) ? sampleCommands.map((entry) => String(entry || "").toLowerCase()) : [];
  return commands.some((entry) =>
    entry.includes("test")
      || entry.includes("lint")
      || entry.includes("build")
      || entry.includes("smoke")
      || entry.includes("playwright")
      || entry.includes("artisan")
      || entry.includes("npm run")
      || entry.includes("node scripts/")
  );
}

function evaluateIntentFirstGates({
  contract,
  store,
  prompt = "",
  changedPaths = [],
  workspaceLocked = false,
  docSyncComplete = false,
  visualEvidence = null,
  dispatchChildren = [],
  sampleMcpTools = [],
  sampleCommands = [],
  commandExecutions = 0,
} = {}) {
  const normalizedContract = normalizeDesignAcceptanceContract(contract || defaultDesignAcceptanceContract);
  const profile = activeTasteProfile(store);
  const designSensitive = isDesignSensitiveRequest({ prompt, changedPaths, contract: normalizedContract });
  if (!designSensitive) {
    return {
      applies: false,
      designSensitive: false,
      status: "not_applicable",
      summary: "Intent-first gate not applicable.",
      missingHard: [],
    };
  }
  const children = new Set((Array.isArray(dispatchChildren) ? dispatchChildren : []).map((entry) => String(entry || "").toLowerCase()));
  const missingHard = [];
  if (normalizedContract.workspaceLock.rejectWhenUnlocked && !workspaceLocked) {
    missingHard.push({ id: "workspace_lock", label: "workspace lock", reason: "intent_workspace_lock_missing" });
  }
  if (normalizedContract.benchmarkComparisonRequired && !profile.benchmarkUrls.length) {
    missingHard.push({ id: "benchmark", label: "benchmark", reason: "intent_benchmark_missing" });
  }
  if (normalizedContract.visualReviewRequired && !hasVisualReviewEvidence(sampleMcpTools, sampleCommands, visualEvidence)) {
    missingHard.push({ id: "visual_review", label: "screenshot review", reason: "intent_visual_review_missing" });
  }
  if (normalizedContract.independentReviewRequired && !children.has("reviewer")) {
    missingHard.push({ id: "independent_review", label: "independent reviewer", reason: "intent_reviewer_missing" });
  }
  if (normalizedContract.technicalVerificationRequired && !hasTechnicalEvidence(sampleCommands, commandExecutions)) {
    missingHard.push({ id: "technical_verification", label: "technical verification", reason: "intent_technical_verification_missing" });
  }
  if (normalizedContract.docSyncRequired && !docSyncComplete) {
    missingHard.push({ id: "documentation_sync", label: "documentation sync", reason: "intent_documentation_sync_missing" });
  }
  if (missingHard.length) {
    return {
      applies: true,
      designSensitive: true,
      status: "failed_validation",
      summary: `Intent-first gate missing: ${missingHard.map((entry) => entry.label).join(", ")}.`,
      missingHard,
    };
  }
  return {
    applies: true,
    designSensitive: true,
    status: "pass",
    summary: "Intent-first gate satisfied.",
    missingHard: [],
  };
}

function summarizeIntentFirstRuntime({ contract, store } = {}) {
  const normalizedContract = normalizeDesignAcceptanceContract(contract || defaultDesignAcceptanceContract);
  const normalizedStore = normalizeUserTasteMemoryStore(store || defaultTasteMemoryStore);
  const profile = activeTasteProfile(normalizedStore);
  return {
    mode: normalizedContract.mode,
    workspaceLock: {
      ...normalizedContract.workspaceLock,
      autoLockRecommended: Array.isArray(normalizedContract.workspaceLock.requiredForSources)
        && normalizedContract.workspaceLock.requiredForSources.includes("web_ui"),
    },
    creativeSignals: {
      promptKeywords: normalizedContract.keywords.slice(),
    },
    requiredGates: [
      { id: "workspace_lock", label: "Workspace lock" },
      { id: "taste_memory", label: "Taste memory" },
      { id: "benchmark", label: "Benchmark" },
      { id: "visual_review", label: "Visual review" },
      { id: "independent_review", label: "Independent review" },
      { id: "technical_verification", label: "Technical verification" },
      { id: "documentation_sync", label: "Documentation sync" },
    ],
    contract: {
      schema: normalizedContract.schema,
      version: normalizedContract.version,
      benchmarkComparisonRequired: normalizedContract.benchmarkComparisonRequired,
      visualReviewRequired: normalizedContract.visualReviewRequired,
      independentReviewRequired: normalizedContract.independentReviewRequired,
      docSyncRequired: normalizedContract.docSyncRequired,
      technicalVerificationRequired: normalizedContract.technicalVerificationRequired,
      workspaceLock: normalizedContract.workspaceLock,
      prohibitedPatterns: normalizedContract.prohibitedPatterns.slice(),
      requiredArtifacts: normalizedContract.requiredArtifacts.slice(),
      evaluationAxes: normalizedContract.evaluationAxes.slice(),
    },
    tasteMemory: {
      activeProfileId: normalizedStore.activeProfileId,
      updatedAt: normalizedStore.updatedAt,
      activeProfile: {
        ...profile,
        northStar: profile.northStarLines.slice(),
        benchmarkSites: profile.benchmarkUrls.slice(),
        benchmarkNotes: profile.notes.slice(),
        prefers: profile.mustHaves.slice(),
        rejects: profile.avoid.slice(),
        requiredProof: profile.requiredProof.slice(),
      },
    },
  };
}

module.exports = {
  defaultDesignAcceptanceContractPath,
  defaultTasteMemorySeedPath,
  buildIntentFirstPrompt,
  evaluateIntentFirstGates,
  isDesignSensitiveRequest,
  loadDesignAcceptanceContract,
  loadUserTasteMemoryStore,
  normalizeUserTasteMemoryStore,
  persistUserTasteMemoryStore,
  requiresWorkspaceLockForSource,
  summarizeIntentFirstRuntime,
};

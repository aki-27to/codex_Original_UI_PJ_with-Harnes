"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawnSync } = require("child_process");

const DOCUMENT_TOOLING_LAYOUT = Object.freeze({
  rootDirName: ".tooling/document-tools",
  downloadsDirName: ".tooling/document-tools/downloads",
  venvDirName: ".tooling/document-tools/venv",
  binDirName: ".tooling/document-tools/bin",
  jdkDirName: ".tooling/document-tools/jdk",
  cacheDirName: ".uv-cache",
  bootstrapCommand: "node scripts/document_tooling.js bootstrap",
  pythonVersion: "3.12",
  jdkDownloadUrl: "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk",
});

const TOOL_DEFINITIONS = Object.freeze([
  {
    id: "markitdown",
    packageName: "markitdown",
    aliases: ["markitdown", "mark-it-down", "microsoft-markitdown"],
    displayName: "Microsoft MarkItDown",
    category: "markdown-conversion",
    commandCandidates: ["markitdown"],
    versionArgs: ["--version"],
    installCommand: "pip install \"markitdown[pdf,docx,pptx]\"",
    docsUrl: "https://github.com/microsoft/markitdown",
    repoUrl: "https://github.com/microsoft/markitdown",
    preferredFor: [
      "Quick PDF to Markdown conversion",
      "DOCX/PPTX/XLSX to Markdown",
      "Low-friction mixed office-document ingestion",
    ],
    caveats: [
      "Optimized for Markdown output, not layout-rich JSON",
      "Deep PDF structure extraction is outside the core goal",
    ],
  },
  {
    id: "opendataloader-pdf",
    packageName: "opendataloader-pdf",
    aliases: ["opendataloader", "opendataloader-pdf", "opendataloaderpdf"],
    displayName: "OpenDataLoader PDF",
    category: "structured-pdf-extraction",
    commandCandidates: ["opendataloader-pdf"],
    versionArgs: ["--version"],
    installCommand: "pip install opendataloader-pdf",
    docsUrl: "https://opendataloader.org/",
    repoUrl: "https://github.com/opendataloader-project/opendataloader-pdf",
    preferredFor: [
      "Structured PDF extraction with layout awareness",
      "Markdown or HTML plus JSON with bounding boxes",
      "Accessibility-oriented PDF workflows and tagged PDF pipelines",
    ],
    caveats: [
      "More specialized than generic Markdown converters",
      "Hybrid and accessibility workflows may need extra setup",
    ],
  },
  {
    id: "skillnet",
    packageName: "skillnet-ai",
    aliases: ["skillnet", "skill-net"],
    displayName: "SkillNet",
    category: "skill-lifecycle",
    commandCandidates: ["skillnet"],
    versionArgs: ["--version"],
    installCommand: "pip install skillnet-ai",
    docsUrl: "https://github.com/zjunlp/SkillNet",
    repoUrl: "https://github.com/zjunlp/SkillNet",
    preferredFor: [
      "Search and install existing skills",
      "Create skills from repos, traces, or office documents",
      "Evaluate and analyze skill relationships",
    ],
    caveats: [
      "The value is in skill lifecycle management, not document conversion",
      "Create/evaluate/analyze flows depend on API-backed model access",
    ],
  },
]);

const RECOMMENDED_ROUTES = Object.freeze([
  {
    useCase: "Mixed office documents to Markdown",
    toolId: "markitdown",
    reason: "Fastest route for broad Markdown conversion across PDF, DOCX, PPTX, and spreadsheet inputs.",
  },
  {
    useCase: "Structured PDF extraction and accessibility-heavy workflows",
    toolId: "opendataloader-pdf",
    reason: "Best fit when tables, layout, bounding boxes, or tagged-PDF style structure matter.",
  },
  {
    useCase: "Skill creation, evaluation, and relationship analysis",
    toolId: "skillnet",
    reason: "Built for the skill lifecycle rather than direct document conversion.",
  },
]);

function safeString(value, maxLength = 0) {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!text) {
    return "";
  }
  if (Number.isFinite(Number(maxLength)) && Number(maxLength) > 0) {
    return text.slice(0, Math.max(1, Math.trunc(Number(maxLength))));
  }
  return text;
}

function repoRelative(workspaceRoot, targetPath) {
  if (!workspaceRoot) {
    return String(targetPath || "").replace(/\\/g, "/");
  }
  return path.relative(workspaceRoot, targetPath).replace(/\\/g, "/");
}

function normalizeToolId(value) {
  return safeString(value, 80).toLowerCase();
}

function findToolDefinition(rawToolId) {
  const normalized = normalizeToolId(rawToolId);
  return TOOL_DEFINITIONS.find((entry) => {
    if (entry.id === normalized) {
      return true;
    }
    return Array.isArray(entry.aliases) && entry.aliases.some((alias) => normalizeToolId(alias) === normalized);
  }) || null;
}

function normalizeLocatorOutput(output) {
  return safeString(String(output || ""), 4000)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function normalizeVersionOutput(output) {
  return safeString(String(output || ""), 4000)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function quoteWindowsArg(value) {
  const text = String(value == null ? "" : value);
  if (!text.length) {
    return "\"\"";
  }
  if (!/[\s"]/u.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function spawnCommand(command, args = [], options = {}) {
  const normalizedCommand = safeString(command, 400);
  const normalizedArgs = Array.isArray(args) ? args.map((entry) => String(entry)) : [];
  const baseOptions = {
    encoding: "utf8",
    windowsHide: true,
    timeout: 0,
    ...options,
  };
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(normalizedCommand)) {
    const commandLine = [quoteWindowsArg(normalizedCommand), ...normalizedArgs.map(quoteWindowsArg)].join(" ");
    return spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], baseOptions);
  }
  return spawnSync(normalizedCommand, normalizedArgs, baseOptions);
}

function defaultResolveCommand(command) {
  const normalized = safeString(command, 400);
  if (!normalized) {
    return "";
  }
  if (path.isAbsolute(normalized) || /[\\/]/.test(normalized)) {
    return fs.existsSync(normalized) ? normalized : "";
  }
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnCommand(locator, [normalized], {
    encoding: "utf8",
    timeout: 1500,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return normalizeLocatorOutput(result.stdout);
}

function defaultProbeVersion(command, versionArgs) {
  const args = Array.isArray(versionArgs) && versionArgs.length ? versionArgs : ["--version"];
  const result = spawnCommand(command, args, {
    encoding: "utf8",
    timeout: 2000,
    windowsHide: true,
  });
  if (result.error) {
    return "";
  }
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  return normalizeVersionOutput(combined);
}

function probePackageVersion(pythonPath, packageName) {
  const normalizedPython = safeString(pythonPath, 400);
  const normalizedPackage = safeString(packageName, 120);
  if (!normalizedPython || !normalizedPackage) {
    return "";
  }
  const result = spawnCommand(normalizedPython, [
    "-c",
    "from importlib.metadata import version; import sys; sys.stdout.write(version(sys.argv[1]))",
    normalizedPackage,
  ], {
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return safeString(result.stdout, 160);
}

function getDocumentToolingPaths(workspaceRoot = "") {
  const root = workspaceRoot
    ? path.join(workspaceRoot, DOCUMENT_TOOLING_LAYOUT.rootDirName)
    : DOCUMENT_TOOLING_LAYOUT.rootDirName;
  return {
    toolRoot: root,
    downloadsDir: workspaceRoot
      ? path.join(workspaceRoot, DOCUMENT_TOOLING_LAYOUT.downloadsDirName)
      : DOCUMENT_TOOLING_LAYOUT.downloadsDirName,
    venvDir: workspaceRoot
      ? path.join(workspaceRoot, DOCUMENT_TOOLING_LAYOUT.venvDirName)
      : DOCUMENT_TOOLING_LAYOUT.venvDirName,
    binDir: workspaceRoot
      ? path.join(workspaceRoot, DOCUMENT_TOOLING_LAYOUT.binDirName)
      : DOCUMENT_TOOLING_LAYOUT.binDirName,
    jdkDir: workspaceRoot
      ? path.join(workspaceRoot, DOCUMENT_TOOLING_LAYOUT.jdkDirName)
      : DOCUMENT_TOOLING_LAYOUT.jdkDirName,
    cacheDir: workspaceRoot
      ? path.join(workspaceRoot, DOCUMENT_TOOLING_LAYOUT.cacheDirName)
      : DOCUMENT_TOOLING_LAYOUT.cacheDirName,
  };
}

function getVenvCommandPath(definition, workspaceRoot = "") {
  const paths = getDocumentToolingPaths(workspaceRoot);
  if (process.platform === "win32") {
    return path.join(paths.venvDir, "Scripts", `${definition.id}.exe`);
  }
  return path.join(paths.venvDir, "bin", definition.id);
}

function getWrapperCommandPath(definition, workspaceRoot = "") {
  const paths = getDocumentToolingPaths(workspaceRoot);
  if (process.platform === "win32") {
    return path.join(paths.binDir, `${definition.id}.cmd`);
  }
  return path.join(paths.binDir, definition.id);
}

function buildCommandCandidates(definition, workspaceRoot = "") {
  const candidates = [];
  if (workspaceRoot) {
    candidates.push(getWrapperCommandPath(definition, workspaceRoot));
    candidates.push(getVenvCommandPath(definition, workspaceRoot));
  }
  if (Array.isArray(definition.commandCandidates)) {
    candidates.push(...definition.commandCandidates);
  }
  return candidates.filter(Boolean);
}

function probeTool(definition, {
  workspaceRoot = "",
  resolveCommand = defaultResolveCommand,
  probeVersion = defaultProbeVersion,
} = {}) {
  const commandCandidates = buildCommandCandidates(definition, workspaceRoot);
  let resolvedPath = "";
  let resolvedCommand = "";
  for (const candidate of commandCandidates) {
    const maybePath = safeString(resolveCommand(candidate), 400);
    if (maybePath) {
      resolvedPath = maybePath;
      resolvedCommand = candidate;
      break;
    }
  }
  const installed = Boolean(resolvedPath);
  let version = installed ? safeString(probeVersion(resolvedCommand, definition.versionArgs), 160) : "";
  const localVenvPython = process.platform === "win32"
    ? path.join(getDocumentToolingPaths(workspaceRoot).venvDir, "Scripts", "python.exe")
    : path.join(getDocumentToolingPaths(workspaceRoot).venvDir, "bin", "python");
  if (
    installed
    && definition.packageName
    && workspaceRoot
    && fs.existsSync(localVenvPython)
    && (!version || /^usage:/i.test(version) || /^use /i.test(version))
  ) {
    const packageVersion = probePackageVersion(localVenvPython, definition.packageName);
    if (packageVersion) {
      version = packageVersion;
    }
  }
  return {
    id: definition.id,
    displayName: definition.displayName,
    category: definition.category,
    installed,
    command: resolvedCommand || commandCandidates[0] || "",
    resolvedPath,
    version,
    installCommand: definition.installCommand,
    docsUrl: definition.docsUrl,
    repoUrl: definition.repoUrl,
    preferredFor: Array.isArray(definition.preferredFor) ? definition.preferredFor.slice(0, 6) : [],
    caveats: Array.isArray(definition.caveats) ? definition.caveats.slice(0, 6) : [],
  };
}

function recommendDocumentTool(taskText) {
  const text = normalizeToolId(taskText);
  if (!text) {
    const route = RECOMMENDED_ROUTES[0];
    return {
      toolId: route.toolId,
      reason: route.reason,
      matchedSignals: ["default_markdown_route"],
    };
  }

  const matchedSignals = [];
  const hasPdf = /\bpdf\b/.test(text);
  const hasSkillIntent = /\bskill|skills|evaluate|analy[sz]e|relationship|repo|repository|trajectory|download skill|create skill|compose_with|depend_on\b/.test(text);
  const hasStructuredPdfIntent = /\bbounding|bbox|layout|table|ocr|tagged|pdf\/ua|accessib|scanned|json|coordinate|structure|semantic\b/.test(text);
  const hasMarkdownIntent = /\bmarkdown|docx|pptx|xlsx|xls|word|powerpoint|excel|outlook|convert|conversion|office\b/.test(text);

  if (hasSkillIntent) {
    matchedSignals.push("skill_lifecycle");
    return {
      toolId: "skillnet",
      reason: "The request is about skill discovery, creation, evaluation, or relationship analysis.",
      matchedSignals,
    };
  }
  if (hasPdf && hasStructuredPdfIntent) {
    matchedSignals.push("structured_pdf");
    return {
      toolId: "opendataloader-pdf",
      reason: "The request needs PDF structure or accessibility-aware extraction rather than plain Markdown conversion.",
      matchedSignals,
    };
  }
  if (hasMarkdownIntent || hasPdf) {
    matchedSignals.push(hasPdf ? "pdf_markdown" : "mixed_office_markdown");
    return {
      toolId: "markitdown",
      reason: "The request is best served by a lightweight document-to-Markdown conversion path.",
      matchedSignals,
    };
  }

  matchedSignals.push("fallback_markdown_route");
  return {
    toolId: "markitdown",
    reason: "No specialized structure or skill-lifecycle signal was found, so the generic Markdown route is the safest default.",
    matchedSignals,
  };
}

function buildDocumentToolingRuntimeSnapshot({
  workspaceRoot = "",
  resolveCommand = defaultResolveCommand,
  probeVersion = defaultProbeVersion,
  now = Date.now(),
} = {}) {
  const paths = getDocumentToolingPaths(workspaceRoot);
  const tools = TOOL_DEFINITIONS.map((definition) => probeTool(definition, {
    workspaceRoot,
    resolveCommand,
    probeVersion,
  }));
  const availableCount = tools.filter((entry) => entry.installed).length;
  const missingCount = Math.max(0, tools.length - availableCount);
  const guidePath = workspaceRoot
    ? repoRelative(workspaceRoot, path.join(workspaceRoot, "docs", "DOCUMENT_TOOLING_GUIDE.md"))
    : "docs/DOCUMENT_TOOLING_GUIDE.md";
  const hubScriptPath = workspaceRoot
    ? repoRelative(workspaceRoot, path.join(workspaceRoot, "scripts", "document_tooling.js"))
    : "scripts/document_tooling.js";
  return {
    status: "ready",
    generatedAt: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
    guidePath,
    hubScriptPath,
    bootstrapCommand: DOCUMENT_TOOLING_LAYOUT.bootstrapCommand,
    localInstallMode: "workspace-local",
    toolRoot: workspaceRoot ? repoRelative(workspaceRoot, paths.toolRoot) : paths.toolRoot,
    venvPath: workspaceRoot ? repoRelative(workspaceRoot, paths.venvDir) : paths.venvDir,
    binPath: workspaceRoot ? repoRelative(workspaceRoot, paths.binDir) : paths.binDir,
    jdkPath: workspaceRoot ? repoRelative(workspaceRoot, paths.jdkDir) : paths.jdkDir,
    availableCount,
    missingCount,
    tools,
    recommendedRoutes: RECOMMENDED_ROUTES.map((entry) => ({ ...entry })),
    exampleCommands: {
      bootstrap: DOCUMENT_TOOLING_LAYOUT.bootstrapCommand,
      status: "node scripts/document_tooling.js status",
      recommend: "node scripts/document_tooling.js recommend \"extract tables with bounding boxes from a scanned PDF\"",
      runMarkItDown: "node scripts/document_tooling.js run markitdown -- input.pdf -o output.md",
      runOpenDataLoader: "node scripts/document_tooling.js run opendataloader-pdf -- input.pdf",
      runSkillNet: "node scripts/document_tooling.js run skillnet -- search pdf",
    },
  };
}

function formatDocumentToolingStatus(snapshot) {
  const data = snapshot && typeof snapshot === "object" ? snapshot : buildDocumentToolingRuntimeSnapshot();
  const lines = [];
  lines.push("Document tooling hub");
  lines.push(`- Hub: ${safeString(data.hubScriptPath, 240) || "scripts/document_tooling.js"}`);
  lines.push(`- Guide: ${safeString(data.guidePath, 240) || "docs/DOCUMENT_TOOLING_GUIDE.md"}`);
  lines.push(`- Install mode: ${safeString(data.localInstallMode, 80) || "workspace-local"}`);
  lines.push(`- Tool root: ${safeString(data.toolRoot, 240) || ".tooling/document-tools"}`);
  lines.push(`- Available: ${Number(data.availableCount) || 0}/${Array.isArray(data.tools) ? data.tools.length : 0}`);
  lines.push("");
  for (const tool of Array.isArray(data.tools) ? data.tools : []) {
    lines.push(`${tool.displayName} [${tool.id}]`);
    lines.push(`  status: ${tool.installed ? "available" : "missing"}`);
    lines.push(`  command: ${safeString(tool.command, 120) || "-"}`);
    lines.push(`  version: ${safeString(tool.version, 160) || "-"}`);
    lines.push(`  install: ${safeString(tool.installCommand, 240) || "-"}`);
    lines.push(`  preferred: ${(Array.isArray(tool.preferredFor) ? tool.preferredFor : []).join(" / ") || "-"}`);
    lines.push(`  caveats: ${(Array.isArray(tool.caveats) ? tool.caveats : []).join(" / ") || "-"}`);
    lines.push("");
  }
  lines.push("Recommended routes");
  for (const route of Array.isArray(data.recommendedRoutes) ? data.recommendedRoutes : []) {
    lines.push(`- ${route.useCase}: ${route.toolId} (${route.reason})`);
  }
  if (data.bootstrapCommand) {
    lines.push("");
    lines.push(`Bootstrap: ${data.bootstrapCommand}`);
  }
  return `${lines.join("\n").trim()}\n`;
}

function runToolPassthrough(rawToolId, args = [], {
  workspaceRoot = "",
  resolveCommand = defaultResolveCommand,
  spawn = spawnCommand,
} = {}) {
  const definition = findToolDefinition(rawToolId);
  if (!definition) {
    return {
      ok: false,
      code: 2,
      error: `Unknown tool: ${rawToolId}`,
      availableTools: TOOL_DEFINITIONS.map((entry) => entry.id),
    };
  }
  const probed = probeTool(definition, {
    workspaceRoot,
    resolveCommand,
    probeVersion: () => "",
  });
  if (!probed.installed) {
    return {
      ok: false,
      code: 3,
      error: `${definition.displayName} is not installed.`,
      bootstrapCommand: DOCUMENT_TOOLING_LAYOUT.bootstrapCommand,
      installCommand: definition.installCommand,
      docsUrl: definition.docsUrl,
    };
  }
  const result = spawn(probed.command, Array.isArray(args) ? args : [], {
    stdio: "inherit",
    windowsHide: true,
  });
  const code = Number.isInteger(result.status) ? result.status : 1;
  return {
    ok: code === 0,
    code,
    signal: result.signal || "",
  };
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function findLocalJdkHome(jdkDir) {
  if (!jdkDir || !fs.existsSync(jdkDir)) {
    return "";
  }
  const stack = [jdkDir];
  while (stack.length) {
    const current = stack.shift();
    const javaPath = process.platform === "win32"
      ? path.join(current, "bin", "java.exe")
      : path.join(current, "bin", "java");
    if (fs.existsSync(javaPath)) {
      return current;
    }
    let children = [];
    try {
      children = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      children = [];
    }
    for (const child of children) {
      if (child.isDirectory()) {
        stack.push(path.join(current, child.name));
      }
    }
  }
  return "";
}

function downloadFile(url, destinationPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error(`Too many redirects while downloading ${url}`));
          return;
        }
        downloadFile(response.headers.location, destinationPath, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed for ${url} with status ${response.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(destinationPath);
      response.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close(resolve);
      });
      fileStream.on("error", (error) => {
        reject(error);
      });
    });
    request.on("error", reject);
  });
}

function writeWrapper(definition, workspaceRoot = "", jdkHome = "") {
  const paths = getDocumentToolingPaths(workspaceRoot);
  ensureDir(paths.binDir);
  const wrapperPath = getWrapperCommandPath(definition, workspaceRoot);
  const venvCommand = getVenvCommandPath(definition, workspaceRoot);
  if (process.platform === "win32") {
    const lines = [
      "@echo off",
      "setlocal",
      `set "VENV_COMMAND=${venvCommand}"`,
    ];
    if (definition.id === "opendataloader-pdf") {
      if (jdkHome) {
        lines.push(`set "JAVA_HOME=${jdkHome}"`);
        lines.push('set "PATH=%JAVA_HOME%\\bin;%PATH%"');
      } else {
        lines.push(`set "JDK_ROOT=${paths.jdkDir}"`);
        lines.push('for /d %%D in ("%JDK_ROOT%\\*") do if exist "%%~fD\\bin\\java.exe" set "JAVA_HOME=%%~fD"');
        lines.push('if defined JAVA_HOME set "PATH=%JAVA_HOME%\\bin;%PATH%"');
      }
    }
    lines.push('"%VENV_COMMAND%" %*');
    fs.writeFileSync(wrapperPath, `${lines.join("\r\n")}\r\n`, "utf8");
    return wrapperPath;
  }
  const unixLines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
  ];
  if (definition.id === "opendataloader-pdf" && jdkHome) {
    unixLines.push(`export JAVA_HOME=${JSON.stringify(jdkHome)}`);
    unixLines.push('export PATH="$JAVA_HOME/bin:$PATH"');
  }
  unixLines.push(`exec ${JSON.stringify(venvCommand)} "$@"`);
  fs.writeFileSync(wrapperPath, `${unixLines.join("\n")}\n`, "utf8");
  fs.chmodSync(wrapperPath, 0o755);
  return wrapperPath;
}

async function bootstrapDocumentTooling({
  workspaceRoot = "",
  force = false,
  pythonVersion = DOCUMENT_TOOLING_LAYOUT.pythonVersion,
} = {}) {
  if (!workspaceRoot) {
    throw new Error("bootstrapDocumentTooling requires workspaceRoot");
  }
  const paths = getDocumentToolingPaths(workspaceRoot);
  ensureDir(paths.toolRoot);
  ensureDir(paths.downloadsDir);
  ensureDir(paths.cacheDir);
  const uvArgs = [
    "venv",
    paths.venvDir,
    "--managed-python",
    "--python",
    pythonVersion,
    "--seed",
    "--allow-existing",
    "--cache-dir",
    paths.cacheDir,
  ];
  const venvResult = spawnCommand("uv", uvArgs, {
    stdio: "inherit",
  });
  if (venvResult.status !== 0) {
    throw new Error(`uv venv failed with code ${venvResult.status}`);
  }
  const venvPython = process.platform === "win32"
    ? path.join(paths.venvDir, "Scripts", "python.exe")
    : path.join(paths.venvDir, "bin", "python");
  const installArgs = [
    "pip",
    "install",
    "--python",
    venvPython,
    "--cache-dir",
    paths.cacheDir,
    "--refresh",
    "markitdown[pdf,docx,pptx]",
    "opendataloader-pdf",
    "skillnet-ai",
  ];
  if (force) {
    installArgs.splice(5, 0, "--reinstall");
  }
  const installResult = spawnCommand("uv", installArgs, {
    stdio: "inherit",
  });
  if (installResult.status !== 0) {
    throw new Error(`uv pip install failed with code ${installResult.status}`);
  }
  let jdkHome = findLocalJdkHome(paths.jdkDir);
  if (!jdkHome || force) {
    if (force && fs.existsSync(paths.jdkDir)) {
      fs.rmSync(paths.jdkDir, { recursive: true, force: true });
    }
    ensureDir(paths.jdkDir);
    const archivePath = path.join(paths.downloadsDir, "temurin-17-jdk.zip");
    await downloadFile(DOCUMENT_TOOLING_LAYOUT.jdkDownloadUrl, archivePath);
    const expandResult = spawnCommand("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${paths.jdkDir.replace(/'/g, "''")}' -Force`,
    ], {
      stdio: "inherit",
    });
    if (expandResult.status !== 0) {
      throw new Error(`JDK archive extraction failed with code ${expandResult.status}`);
    }
    jdkHome = findLocalJdkHome(paths.jdkDir);
  }
  if (!jdkHome) {
    throw new Error("Local JDK installation was not detected after extraction");
  }
  const wrappers = TOOL_DEFINITIONS.map((definition) => writeWrapper(definition, workspaceRoot, jdkHome));
  return {
    ok: true,
    workspaceRoot,
    pythonVersion,
    toolRoot: paths.toolRoot,
    venvPath: paths.venvDir,
    jdkHome,
    wrappers,
    snapshot: buildDocumentToolingRuntimeSnapshot({ workspaceRoot }),
  };
}

module.exports = {
  DOCUMENT_TOOLING_LAYOUT,
  TOOL_DEFINITIONS,
  buildDocumentToolingRuntimeSnapshot,
  bootstrapDocumentTooling,
  defaultProbeVersion,
  defaultResolveCommand,
  findToolDefinition,
  formatDocumentToolingStatus,
  getDocumentToolingPaths,
  recommendDocumentTool,
  runToolPassthrough,
};

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  BackendStatus,
  CurrentLogsPayload,
  DiagnosticsPayload,
  ExecEventPayload,
  ExecMessage,
  ImageAttachmentPayload,
  ProposalManifest,
  RestartResult,
  RuntimePayload,
  WorkspaceMutationResult,
} from "./types";

const CHAT_STORAGE_KEY = "harnes-desktop-chats-v1";
const HARNES_SIDEBAR_STORAGE_KEY = "harnes-desktop-sidebar-open-v1";
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

const COMMANDS = [
  "/goal",
  "/goal clear",
  "/goal pause",
  "/goal resume",
  "/goal complete",
  "/status",
  "/diff",
  "/resume --last",
  "/fork",
  "/fast status",
  "/agent list",
];

const UI_IMPROVEMENT_PROMPT = `目的: UIをいきなり改修せず、採択判断できる顧客向けHTML/CSSデザイン提案を作る
対象: <対象サイト・画面・repoを書く>
参照: <顧客サイト・参考URL・スクショ・既存画面を書く>

成果物: 顧客にそのまま見せられるHTML/CSS設計書。業種、顧客用途、情報設計、ファーストビュー、色、文字、余白、写真/素材の扱い、主要導線、判断ポイントを含める。

制約: 採択前は対象repoに一切書き込まない。提案書はHarnes repo側の output/design_proposals/<target>/<run-id>/ に生成し、最新版を web/design-proposals/latest/index.html と manifest.json に反映する。HarnesUIのDesign Proposal Studioから確認できる状態にする。DQOは主導線に出さず、必要なら裏の品質補助だけに使う。

品質基準: 平均的なAI風の白背景カードUI、薄い影、丸すぎる角丸、意味のないグラデーションで済ませない。見た目だけでなく、顧客に合う理由と採択判断に必要な根拠が伝わる設計にする。

成功条件: status=ready_for_review。manifestに target, targetPath, proposalTitle, generatedAt, proposalPath, publicPath=/design-proposals/latest/index.html, targetRepoMutated=false を入れる。プレビューとmanifestが200で開ける。desktop/mobileで崩れがない。対象repoに新規変更がない。

最終報告: 生成場所、公開URL、検証結果、対象repo未変更を短く報告する。`;

const fallbackBackend: BackendStatus = {
  status: "starting",
  backendUrl: "http://127.0.0.1:57525",
  port: 57525,
  owned: false,
  pid: 0,
  message: "Waiting for Electron bridge.",
  updatedAt: new Date().toISOString(),
};

const defaultSettings = {
  model: "gpt-5.5",
  modelReasoningEffort: "xhigh",
  approvalPolicy: "on-request",
  sandboxMode: "workspace-write",
  webSearchMode: "cached",
  fastModeEnabled: true,
  automaticApprovalReviewEnabled: false,
  workspacePath: "",
};

const MODEL_OPTIONS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2",
];

type ChatStatus = "idle" | "running" | "completed" | "failed" | "interrupted" | "needs_input";
type WorkStateTone = "idle" | "working" | "completed" | "attention";

type ChatRecord = {
  id: string;
  title: string;
  messages: ExecMessage[];
  status: ChatStatus;
  requestId?: string;
  idempotencyKey?: string;
  activity?: string;
  forceNewSession: boolean;
  updatedAt: string;
};

type ActiveRequest = {
  requestId: string;
  chatId: string;
  assistantMessageId: string;
};

type RunSettings = typeof defaultSettings;

type WorkStateView = {
  tone: WorkStateTone;
  label: string;
  detail: string;
  listLabel: string;
};

function joinUrl(base: string, pathname: string) {
  return new URL(pathname, base.endsWith("/") ? base : `${base}/`).toString();
}

async function readJson<T>(base: string, pathname: string): Promise<T> {
  const response = await fetch(joinUrl(base, pathname), { cache: "no-store" });
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function statusClass(status: string) {
  if (status === "running") return "running";
  if (status === "restarting") return "restarting";
  if (status === "failed") return "failed";
  return "starting";
}

function statusText(status: string) {
  if (status === "running") return "接続済み";
  if (status === "restarting") return "再起動中";
  if (status === "failed") return "失敗";
  return "起動中";
}

function asText(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function compactText(value: unknown, fallback = "-") {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  return text.trim().replace(/\s+/g, " ").slice(0, 180) || fallback;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowLabel() {
  return new Date().toLocaleTimeString();
}

function timeLabelFromIso(value: unknown, fallback = "--:--") {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString();
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`;
  return `${Math.round(value / (1024 * 102.4)) / 10} MB`;
}

function createMessage(role: ExecMessage["role"], title: string, content: string): ExecMessage {
  return { id: makeId("msg"), role, title, content, time: nowLabel() };
}

function createChat(title = "新しい依頼"): ChatRecord {
  const now = new Date().toISOString();
  return {
    id: makeId("chat"),
    title,
    messages: [],
    status: "idle",
    forceNewSession: true,
    updatedAt: now,
  };
}

function normalizeChatStatus(status: unknown): ChatStatus {
  return ["idle", "running", "completed", "failed", "interrupted", "needs_input"].includes(String(status || ""))
    ? String(status) as ChatStatus
    : "idle";
}

function chatStatusLabel(status: ChatStatus) {
  if (status === "running") return "作業中";
  if (status === "completed") return "完了";
  if (status === "failed") return "要確認";
  if (status === "interrupted") return "中断";
  if (status === "needs_input") return "返信で続行";
  return "待機中";
}

function friendlyActivityText(activity: unknown, status: ChatStatus) {
  const text = typeof activity === "string" ? activity.trim() : "";
  const normalized = text.toLowerCase();
  if (!text || normalized === "ready" || normalized === status || normalized === `status=${status}`) return "";
  if (normalized === "stream ended") return "完了を確認中です。";
  if (normalized.includes("submitting")) return "送信中です。";
  if (normalized.includes("streaming")) return "応答を受信中です。";
  if (normalized.startsWith("status=")) return "";
  if (normalized === "user interrupted") return "停止しました。";
  if (normalized.startsWith("turn") || normalized.startsWith("item") || normalized.startsWith("activity") || normalized.startsWith("plan")) {
    return "処理中です。";
  }
  return compactText(text, "");
}

function runtimeActiveExecCount(runtime: RuntimePayload | null) {
  const count = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
  };
  return Math.max(
    0,
    count(runtime?.activeExecRequests),
    count(runtime?.serverProcess?.activeExecRequests),
    count(runtime?.turnRuntime?.activeExecRequests),
  );
}

function workStateForChat(chat: ChatRecord | undefined, { activeForChat = false, runtimeBusy = false } = {}): WorkStateView {
  const status = chat ? chat.status : "idle";
  const activity = friendlyActivityText(chat?.activity, status);
  if (activeForChat) {
    return {
      tone: "working",
      label: "作業中",
      detail: activeForChat ? (activity || "応答中です。停止できます。") : (activity || "処理の完了を確認中です。"),
      listLabel: "作業中",
    };
  }
  if (status === "running") {
    return {
      tone: "attention",
      label: "状態確認中",
      detail: activity || "Runtime更新で実行中か完了かを確認しています。",
      listLabel: "状態確認中",
    };
  }
  if (status === "completed") {
    return {
      tone: "completed",
      label: "完了",
      detail: "最後の依頼は完了しています。次の依頼を送信できます。",
      listLabel: "完了",
    };
  }
  if (status === "failed") {
    return {
      tone: "attention",
      label: "要確認",
      detail: activity || "直近の依頼は失敗しました。内容を確認してください。",
      listLabel: "要確認",
    };
  }
  if (status === "interrupted") {
    return {
      tone: "attention",
      label: "中断",
      detail: "直近の依頼は停止しました。次の依頼を送信できます。",
      listLabel: "中断",
    };
  }
  if (status === "needs_input") {
    return {
      tone: "completed",
      label: "返信で続行",
      detail: "失敗ではありません。必要な情報や判断を返信すると続きから再開できます。",
      listLabel: "返信で続行",
    };
  }
  if (runtimeBusy) {
    return {
      tone: "working",
      label: "作業中",
      detail: "backendで実行中です。",
      listLabel: chatStatusLabel(status),
    };
  }
  return {
    tone: "idle",
    label: "待機中",
    detail: "依頼を入力できます。",
    listLabel: "待機中",
  };
}

function loadStoredChats(): ChatRecord[] {
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [createChat()];
    const chats = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: asText(item.id, makeId("chat")),
        title: asText(item.title, "Mission"),
        messages: Array.isArray(item.messages) ? item.messages.slice(-100) : [],
        status: normalizeChatStatus(item.status) === "running" && String(item.activity || "").toLowerCase() === "stream ended"
          ? "completed"
          : normalizeChatStatus(item.status),
        requestId: typeof item.requestId === "string" ? item.requestId : "",
        idempotencyKey: typeof item.idempotencyKey === "string" ? item.idempotencyKey : "",
        activity: typeof item.activity === "string" ? item.activity : "",
        forceNewSession: item.forceNewSession !== false,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      })) as ChatRecord[];
    return chats.length ? chats : [createChat()];
  } catch {
    return [createChat()];
  }
}

function loadStoredSidebarOpen() {
  try {
    return window.localStorage.getItem(HARNES_SIDEBAR_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function deriveTitle(prompt: string) {
  const text = prompt.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 42) : "Mission";
}

function summarizeLogData(data: unknown) {
  if (!data || typeof data !== "object") return compactText(data, "No data");
  const source = data as Record<string, unknown>;
  const direct = [
    source.status,
    source.currentPhase,
    source.current_phase,
    source.verdict,
    source.summary,
    source.title,
  ].map((item) => compactText(item)).filter((item) => item !== "-");
  if (direct.length) return direct.slice(0, 2).join(" / ");
  return Object.keys(source).slice(0, 6).join(", ") || "JSON loaded";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nestedRecord(source: Record<string, unknown> | undefined, key: string) {
  const value = source?.[key];
  return isRecord(value) ? value : undefined;
}

function boolLabel(value: unknown, fallback = "-") {
  if (value === true || value === 1 || value === "1") return "ON";
  if (value === false || value === 0 || value === "0") return "OFF";
  return compactText(value, fallback);
}

function summarizeNestedObject(value: unknown) {
  if (!isRecord(value)) return compactText(value, "-");
  const fields = Object.entries(value)
    .filter(([, fieldValue]) => !isRecord(fieldValue) && !Array.isArray(fieldValue))
    .slice(0, 4)
    .map(([key, fieldValue]) => `${key}: ${boolLabel(fieldValue)}`);
  return fields.join(" / ") || `${Object.keys(value).length} fields`;
}

function summarizeDiagnostics(data: DiagnosticsPayload | null) {
  if (!data || typeof data !== "object") {
    return [{ key: "diagnostics", value: "未取得" }];
  }
  const checks = isRecord(data.checks) ? data.checks : data;
  return Object.entries(checks as Record<string, unknown>).slice(0, 8).map(([key, value]) => ({
    key,
    value: summarizeNestedObject(value),
  }));
}

function diagnosticToolVersion(data: DiagnosticsPayload | null, toolName: string) {
  if (!data || typeof data !== "object") return "";
  const source = data as Record<string, unknown>;
  const tools = nestedRecord(source, "tools");
  const tool = nestedRecord(tools, toolName);
  return typeof tool?.version === "string" && tool.version.trim() ? tool.version.trim() : "";
}

function codexCliVersionLabel(data: DiagnosticsPayload | null) {
  const version = diagnosticToolVersion(data, "codex");
  if (!version) return "codex-cli 未読込";
  return /\bcodex(?:-cli)?\b/i.test(version) ? version : `codex-cli ${version}`;
}

function summarizeDiagnosticsHealth(data: DiagnosticsPayload | null) {
  if (!data || typeof data !== "object") {
    return {
      status: "NOT LOADED",
      className: "warn",
      reason: "Diagnostics have not been loaded yet.",
      tools: "tools unavailable",
      profile: "-",
      policy: "-",
      shadow: "-",
      generatedAt: "-",
      detailCount: 0,
    };
  }
  const source = data as Record<string, unknown>;
  const tools = nestedRecord(source, "tools");
  const codex = nestedRecord(tools, "codex");
  const node = nestedRecord(tools, "node");
  const defaults = nestedRecord(source, "defaults");
  const executionVisibility = nestedRecord(source, "executionVisibility");
  const fullUtilization = nestedRecord(executionVisibility, "fullUtilization");
  const nonInteractiveUserInput = nestedRecord(source, "nonInteractiveUserInput");
  const adversarialShadow = nestedRecord(source, "adversarialShadow");
  const loop = nestedRecord(adversarialShadow, "loop");
  const codexReady = codex?.available !== false && Boolean(codex);
  const nodeReady = node?.available !== false && Boolean(node);
  const runtimeReady = fullUtilization?.ready !== false && fullUtilization?.ready !== 0;
  const unavailable = !codexReady || !nodeReady;
  const status = unavailable ? "UNAVAILABLE" : runtimeReady ? "READY" : "WARN";
  const className = unavailable ? "failed" : runtimeReady ? "pass" : "warn";
  const codexVersion = asText(codex?.version, codexReady ? "codex ready" : "codex unavailable");
  const nodeVersion = asText(node?.version, nodeReady ? "node ready" : "node unavailable");
  const shadowEnabled = boolLabel(adversarialShadow?.enabled);
  const loopEnabled = boolLabel(loop?.enabled);
  return {
    status,
    className,
    reason: unavailable
      ? "Required local tools need attention before execution is reliable."
      : runtimeReady
        ? "Codex, Node, and the execution profile are ready."
        : "Runtime diagnostics loaded, but profile readiness is incomplete.",
    tools: `${codexVersion} / ${nodeVersion}`,
    profile: asText(executionVisibility?.profile, asText(defaults?.executionProfile, "-")),
    policy: asText(nonInteractiveUserInput?.policy, asText(defaults?.requestUserInputPolicy, "-")),
    shadow: `${asText(adversarialShadow?.mode, "shadow")} ${shadowEnabled} / loop ${loopEnabled}`,
    generatedAt: asText(source.timestamp, asText(source.generatedAt, "-")),
    detailCount: Object.keys(source).length,
  };
}

function logDataByName(logs: CurrentLogsPayload | null, name: string) {
  const entry = logs?.entries?.find((item) => item.name === name && item.ok && item.data && typeof item.data === "object");
  return entry?.data as Record<string, unknown> | undefined;
}

function textField(source: Record<string, unknown> | undefined, key: string) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function evidenceStatusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("safe") || normalized.includes("pass") || normalized.includes("approved") || normalized.includes("completed")) return "pass";
  if (normalized.includes("block") || normalized.includes("fail") || normalized.includes("not_ready")) return "failed";
  return "warn";
}

function summarizeEvidence(logs: CurrentLogsPayload | null) {
  const entries = logs?.entries || [];
  const operator = logDataByName(logs, "operator_summary.json");
  const signoff = logDataByName(logs, "latest_signoff_summary.json");
  const latestRun = logDataByName(logs, "latest_run_summary.json");
  const finalOutcome = latestRun?.finalOutcome && typeof latestRun.finalOutcome === "object"
    ? latestRun.finalOutcome as Record<string, unknown>
    : undefined;
  const refs = operator?.refs && typeof operator.refs === "object" ? operator.refs as Record<string, unknown> : undefined;
  const safeReasons = Array.isArray(operator?.whyThisIsSafe) ? operator.whyThisIsSafe.map((item) => compactText(item)).filter((item) => item !== "-") : [];
  const attentionReasons = Array.isArray(operator?.whyThisMayNeedAttention) ? operator.whyThisMayNeedAttention.map((item) => compactText(item)).filter((item) => item !== "-") : [];
  const status = textField(operator, "topLineDecision")
    || textField(operator, "recommendedDecision")
    || textField(operator, "signoffStatus")
    || textField(signoff, "finalDecision")
    || (signoff?.allPassed === true ? "PASS" : signoff?.allPassed === false ? "BLOCKED" : "")
    || textField(finalOutcome, "taskOutcomeStatus")
    || (entries.length ? "AVAILABLE" : "未読込");
  const primaryEvidence = textField(refs, "latestSignoffSummary")
    || textField(refs, "latestRunSummary")
    || (entries.some((entry) => entry.name === "latest_signoff_summary.json") ? "logs/current/latest_signoff_summary.json" : "")
    || entries[0]?.path
    || "-";
  const reason = safeReasons[0]
    || attentionReasons[0]
    || (entries.length ? `${entries.length} evidence files loaded.` : "current log surfaceは未読込です。");
  return {
    status,
    className: evidenceStatusClass(status),
    generatedAt: textField(operator, "generatedAt") || textField(signoff, "generatedAt") || logs?.generatedAt || "-",
    primaryEvidence,
    reason,
    detailCount: entries.length,
  };
}

function terminalStatus(status: string) {
  return ["completed", "failed", "interrupted", "needs_input"].includes(status);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("画像データの読み込み結果が不正です。"));
    };
    reader.onerror = () => reject(new Error("画像データの読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

async function buildImagePayload(file: File): Promise<ImageAttachmentPayload> {
  if (!file.type.toLowerCase().startsWith("image/")) {
    throw new Error(`${file.name || "file"} は画像ではありません。`);
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`${file.name || "image"} は ${formatBytes(MAX_IMAGE_SIZE_BYTES)} を超えています。`);
  }
  return {
    name: file.name || "image",
    mimeType: file.type.toLowerCase(),
    sizeBytes: file.size,
    dataUrl: await fileToDataUrl(file),
  };
}

function composeUserMessage(prompt: string, images: ImageAttachmentPayload[]) {
  const imageLines = images.map((image) => `[image] ${image.name} (${formatBytes(image.sizeBytes)})`);
  return [prompt.trim(), ...imageLines].filter(Boolean).join("\n");
}

function workspaceGuardLabel(runtime: RuntimePayload | null) {
  const guard = runtime?.workspaceGuard;
  if (!guard) return "lock 状態未取得";
  const locked = guard.locked === true || Boolean(guard.root || guard.lockRoot);
  const root = asText(guard.root || guard.lockRoot, "");
  return locked ? `locked: ${root || "workspace"}` : "unlocked";
}

export default function App() {
  const [backend, setBackend] = useState<BackendStatus>(fallbackBackend);
  const [runtime, setRuntime] = useState<RuntimePayload | null>(null);
  const [proposal, setProposal] = useState<ProposalManifest | null>(null);
  const [logs, setLogs] = useState<CurrentLogsPayload | null>(null);
  const [evidenceDetailsOpen, setEvidenceDetailsOpen] = useState(false);
  const [diagnosticsDetailsOpen, setDiagnosticsDetailsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [restartMessage, setRestartMessage] = useState("待機中");
  const [workspaceMessage, setWorkspaceMessage] = useState("workspace lock は未操作です。");
  const [attachmentError, setAttachmentError] = useState("");
  const [mission, setMission] = useState("");
  const [settings, setSettings] = useState<RunSettings>(defaultSettings);
  const [attachments, setAttachments] = useState<ImageAttachmentPayload[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(loadStoredSidebarOpen);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runtimeRefreshState, setRuntimeRefreshState] = useState({ loading: false, lastAt: "" });
  const initialChats = useMemo(() => loadStoredChats(), []);
  const [chats, setChats] = useState<ChatRecord[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState(() => initialChats[0]?.id || "");
  const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>([]);
  const requestMap = useRef(new Map<string, ActiveRequest>());
  const settingsInitialized = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const backendUrl = backend.backendUrl || fallbackBackend.backendUrl;
  const activeChat = chats.find((chat) => chat.id === activeChatId) || chats[0];
  const activeChatRequest = useMemo(() => (
    activeChat ? activeRequests.find((request) => request.chatId === activeChat.id) || null : null
  ), [activeChat, activeRequests]);
  const hasActiveRequests = activeRequests.length > 0;
  const existingWebUiUrl = useMemo(() => joinUrl(backendUrl, "/01.HarnesUI/index.html"), [backendUrl]);
  const proposalUrl = useMemo(() => joinUrl(backendUrl, proposal?.publicPath || "/design-proposals/latest/index.html"), [backendUrl, proposal]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    window.localStorage.setItem(HARNES_SIDEBAR_STORAGE_KEY, sidebarOpen ? "true" : "false");
  }, [sidebarOpen]);

  useEffect(() => {
    if (!runtime || settingsInitialized.current) return;
    settingsInitialized.current = true;
    setSettings((current) => ({
      ...current,
      model: asText(runtime.execApi?.defaultModel, current.model),
      modelReasoningEffort: asText(runtime.execApi?.modelReasoningEffort, current.modelReasoningEffort),
      approvalPolicy: asText(runtime.approvalPolicy, current.approvalPolicy),
      sandboxMode: asText(runtime.sandboxMode, current.sandboxMode),
      fastModeEnabled: typeof runtime.fastModeEnabled === "boolean" ? runtime.fastModeEnabled : current.fastModeEnabled,
      automaticApprovalReviewEnabled: typeof runtime.automaticApprovalReviewEnabled === "boolean"
        ? runtime.automaticApprovalReviewEnabled
        : current.automaticApprovalReviewEnabled,
      workspacePath: asText(runtime.workspaceRoot, current.workspacePath),
    }));
  }, [runtime]);

  const patchChat = useCallback((chatId: string, updater: (chat: ChatRecord) => ChatRecord) => {
    setChats((current) => current.map((chat) => (chat.id === chatId ? updater(chat) : chat)));
  }, []);

  const updateMessage = useCallback((chatId: string, messageId: string, updater: (content: string) => string) => {
    patchChat(chatId, (chat) => ({
      ...chat,
      updatedAt: new Date().toISOString(),
      messages: chat.messages.map((message) => (
        message.id === messageId ? { ...message, content: updater(message.content) } : message
      )),
    }));
  }, [patchChat]);

  const refresh = useCallback(async () => {
    setRuntimeRefreshState((current) => ({ ...current, loading: true }));
    try {
      const nextRuntime = window.harnesDesktop
        ? await window.harnesDesktop.getRuntime()
        : await readJson<RuntimePayload>(backendUrl, "/api/runtime");
      setRuntime(nextRuntime);
      const nextProposal = window.harnesDesktop
        ? await window.harnesDesktop.getProposalManifest().catch(() => null)
        : await readJson<ProposalManifest>(backendUrl, "/design-proposals/latest/manifest.json").catch(() => null);
      setProposal(nextProposal);
      const nextLogs = window.harnesDesktop ? await window.harnesDesktop.getCurrentLogs().catch(() => null) : null;
      setLogs(nextLogs);
      const nextDiagnostics = window.harnesDesktop ? await window.harnesDesktop.getDiagnostics().catch(() => null) : null;
      setDiagnostics(nextDiagnostics);
      setLoadError("");
      setRuntimeRefreshState({ loading: false, lastAt: new Date().toISOString() });
    } catch (error) {
      setRuntime(null);
      setLoadError(error instanceof Error ? error.message : "Runtime load failed");
      setRuntimeRefreshState((current) => ({ ...current, loading: false }));
    }
  }, [backendUrl]);

  useEffect(() => {
    let cancelled = false;
    window.harnesDesktop?.getBackendStatus().then((status) => {
      if (!cancelled) setBackend(status);
    }).catch(() => {
      if (!cancelled) setBackend(fallbackBackend);
    });
    const unsubscribe = window.harnesDesktop?.onBackendStatus((status) => setBackend(status));
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.harnesDesktop?.onExecEvent((payload: ExecEventPayload) => {
      const active = requestMap.current.get(payload.requestId);
      if (!active) return;
      const event = payload.event || {};
      const type = String(event.type || "");
      const text = typeof event.text === "string" ? event.text : "";
      if (type === "delta" && text) {
        updateMessage(active.chatId, active.assistantMessageId, (current) => `${current}${text}`);
      } else if (type === "final") {
        updateMessage(active.chatId, active.assistantMessageId, () => text);
      } else if (type === "error") {
        updateMessage(active.chatId, active.assistantMessageId, (current) => `${current}${current ? "\n" : ""}[error] ${text || "runtime error"}`);
      }
      if (type === "status") {
        const nextStatus = String(event.status || "running") as ChatStatus;
        patchChat(active.chatId, (chat) => ({
          ...chat,
          status: terminalStatus(nextStatus) ? nextStatus : "running",
          activity: `status=${nextStatus}`,
          forceNewSession: nextStatus === "completed" ? false : chat.forceNewSession,
          updatedAt: new Date().toISOString(),
        }));
        if (terminalStatus(nextStatus)) {
          requestMap.current.delete(payload.requestId);
          setActiveRequests((current) => current.filter((request) => request.requestId !== payload.requestId));
          void refresh();
        }
      } else if (["turn", "item", "activity", "plan", "tokenUsage", "diff"].includes(type)) {
        patchChat(active.chatId, (chat) => ({
          ...chat,
          status: "running",
          activity: compactText(`${type}${event.label ? `: ${event.label}` : ""}${event.detail ? ` / ${event.detail}` : ""}`, "activity"),
          updatedAt: new Date().toISOString(),
        }));
      } else if (type === "stream-end") {
        patchChat(active.chatId, (chat) => ({
          ...chat,
          status: chat.status === "running" ? "completed" : chat.status,
          activity: terminalStatus(chat.status) ? chat.activity : "completed",
          forceNewSession: chat.status === "running" ? false : chat.forceNewSession,
          updatedAt: new Date().toISOString(),
        }));
        requestMap.current.delete(payload.requestId);
        setActiveRequests((current) => current.filter((request) => request.requestId !== payload.requestId));
        void refresh();
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [patchChat, refresh, updateMessage]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const layoutOk = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
    const isVisible = (selector: string) => {
      const element = document.querySelector(selector);
      return Boolean(element && window.getComputedStyle(element).display !== "none" && element.getClientRects().length);
    };
    const restartVisible = isVisible(".restart-panel");
    const workspaceVisible = isVisible(".workspace-panel");
    const diagnosticsVisible = isVisible(".diagnostics-panel");
    const logsVisible = isVisible(".logs-panel");
    const sidebarVisible = isVisible(".sidebar");
    const proposalDockVisible = isVisible(".proposal-dock");
    const runtimePanelVisible = isVisible(".runtime-panel");
    const settingsVisible = isVisible(".settings-panel");
    const missionMetaVisible = isVisible(".work-state-meta");
    const oldWebStatusVisible = isVisible(".old-web-status");
    const oldWebStatusLabel = compactText(document.querySelector(".old-web-status strong")?.textContent, "");
    const runtimePanelLabel = compactText(document.querySelector(".runtime-panel h2")?.textContent, "");
    const runningStatusSpinner = document.querySelector(".old-web-status.running .old-web-status-spinner");
    const readyStatusSpinnerStopped = backend.status !== "running"
      || Boolean(runningStatusSpinner && window.getComputedStyle(runningStatusSpinner).animationName === "none");
    const runtimeRefreshExplained = Boolean(document.querySelector(".runtime-refresh-note"));
    const attachmentRowsReady = Boolean(document.querySelector(".attachment-panel"));
    window.__harnesElectronSmoke = {
      runtimeOk: Boolean(runtime && runtime.mode === "app-server"),
      proposalLinkVisible: Boolean(proposalUrl),
      backendStatus: backend.status,
      runtimeMode: runtime?.mode || "",
      proposalTitle: proposal?.proposalTitle || "",
      logsOk: Boolean(logs?.entries?.length),
      execControlsVisible: true,
      runtimePanelVisible,
      settingsVisible,
      restartVisible,
      workspaceVisible,
      diagnosticsVisible,
      logsVisible,
      sidebarVisible,
      proposalDockVisible,
      operatorPanelsHidden: !restartVisible && !workspaceVisible && !diagnosticsVisible && !logsVisible,
      commandPaletteVisible: true,
      attachmentsVisible: true,
      missionMetaVisible,
      oldWebStatusVisible,
      oldWebStatusLabel,
      runtimePanelLabel,
      readyStatusSpinnerStopped,
      runtimeRefreshExplained,
      attachmentRowsReady,
      layoutOk,
    };
  }, [backend.status, logs?.entries?.length, proposal?.proposalTitle, proposalUrl, runtime, sidebarOpen, runtimeRefreshState.lastAt]);

  const openLocal = useCallback((target: string) => {
    if (window.harnesDesktop) {
      window.harnesDesktop.openExternal(target).catch((error) => setLoadError(error instanceof Error ? error.message : "Open failed"));
      return;
    }
    window.open(target, "_blank", "noopener");
  }, []);

  const createNewChat = useCallback(() => {
    const next = createChat();
    setChats((current) => [next, ...current]);
    setActiveChatId(next.id);
    setMission("");
    setAttachments([]);
  }, []);

  const deleteActiveChat = useCallback(() => {
    if (!activeChat) return;
    setChats((current) => {
      const next = current.filter((chat) => chat.id !== activeChat.id);
      const fallback = next[0] || createChat();
      setActiveChatId(fallback.id);
      return next.length ? next : [fallback];
    });
  }, [activeChat]);

  const clearActiveChat = useCallback(() => {
    if (!activeChat) return;
    patchChat(activeChat.id, (chat) => ({
      ...chat,
      messages: [],
      status: "idle",
      activity: "",
      requestId: "",
      idempotencyKey: "",
      forceNewSession: true,
      updatedAt: new Date().toISOString(),
    }));
  }, [activeChat, patchChat]);

  const updateSetting = useCallback(<K extends keyof RunSettings>(key: K, value: RunSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const insertMissionText = useCallback((text: string) => {
    setMission((current) => {
      const prefix = current.trim() ? `${current.trimEnd()}\n\n` : "";
      return `${prefix}${text}`;
    });
  }, []);

  const insertCommandText = useCallback((text: string) => {
    insertMissionText(text);
    setCommandMenuOpen(false);
  }, [insertMissionText]);

  const handleAttachmentPick = useCallback(async (files: FileList | null) => {
    setAttachmentError("");
    const selected = Array.from(files || []);
    if (!selected.length) return;
    try {
      const payloads = await Promise.all(selected.map(buildImagePayload));
      setAttachments((current) => [...current, ...payloads].slice(0, 8));
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "画像添付に失敗しました。");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const submitMission = useCallback(async () => {
    const prompt = mission.trim();
    if (!activeChat || activeChatRequest) return;
    if (!prompt && !attachments.length) {
      setLoadError("依頼本文、slash command、または画像を入力してください。");
      return;
    }
    if (!window.harnesDesktop) {
      setLoadError("Electron bridge is required for /api/exec submission.");
      return;
    }
    setLoadError("");
    const images = attachments;
    const requestId = makeId("electron-request");
    const assistant = createMessage("assistant", "Codex", "");
    const user = createMessage("user", "You", composeUserMessage(prompt, images));
    const requestRecord = { requestId, chatId: activeChat.id, assistantMessageId: assistant.id };
    requestMap.current.set(requestId, requestRecord);
    setActiveRequests((current) => [
      ...current.filter((request) => request.chatId !== activeChat.id && request.requestId !== requestId),
      requestRecord,
    ]);
    patchChat(activeChat.id, (chat) => ({
      ...chat,
      title: chat.messages.length ? chat.title : deriveTitle(prompt || images[0]?.name || "image"),
      messages: [...chat.messages, user, assistant],
      status: "running",
      requestId,
      activity: "submitting /api/exec",
      updatedAt: new Date().toISOString(),
    }));
    setMission("");
    setAttachments([]);
    try {
      const result = await window.harnesDesktop.submitExec({
        requestId,
        prompt: prompt || "添付画像を確認してください。",
        images,
        sandboxMode: settings.sandboxMode,
        approvalPolicy: settings.approvalPolicy,
        fastModeEnabled: settings.fastModeEnabled,
        automaticApprovalReviewEnabled: settings.automaticApprovalReviewEnabled,
        webSearch: settings.webSearchMode !== "disabled",
        webSearchMode: settings.webSearchMode,
        model: settings.model,
        modelReasoningEffort: settings.modelReasoningEffort,
        agentName: asText(runtime?.activeAgent, "default"),
        forceNewSession: activeChat.forceNewSession || activeChat.messages.length === 0,
        cwd: settings.workspacePath || asText(runtime?.workspaceRoot, ""),
        executionProfile: "custom",
        executionIntent: "electron-ui-interactive",
      });
      patchChat(activeChat.id, (chat) => ({
        ...chat,
        idempotencyKey: result.idempotencyKey,
        activity: "streaming /api/exec",
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      requestMap.current.delete(requestId);
      setActiveRequests((current) => current.filter((request) => request.requestId !== requestId));
      setAttachments(images);
      patchChat(activeChat.id, (chat) => ({
        ...chat,
        status: "failed",
        activity: error instanceof Error ? error.message : "submit failed",
        messages: chat.messages.map((message) => (
          message.id === assistant.id
            ? { ...message, content: `[error] ${error instanceof Error ? error.message : "submit failed"}` }
            : message
        )),
        updatedAt: new Date().toISOString(),
      }));
    }
  }, [activeChat, activeChatRequest, attachments, mission, patchChat, runtime?.activeAgent, runtime?.workspaceRoot, settings]);

  const activeExec = runtimeActiveExecCount(runtime);
  const activeChatWorkState = workStateForChat(activeChat, {
    activeForChat: Boolean(activeChatRequest),
    runtimeBusy: activeExec > 0 && !hasActiveRequests,
  });
  const canSubmitMission = Boolean(activeChat && !activeChatRequest);
  const missionMetaItems = useMemo(() => {
    if (!activeChat) return [];
    return [`状態: ${activeChatWorkState.label}`, activeChatWorkState.detail].filter(Boolean);
  }, [activeChat, activeChatWorkState.detail, activeChatWorkState.label]);

  const handleMissionKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey) || event.repeat || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSubmitMission) void submitMission();
  }, [canSubmitMission, submitMission]);

  const stopActiveRequest = useCallback(async () => {
    if (!activeChatRequest || !window.harnesDesktop) return;
    const result = await window.harnesDesktop.cancelExec(activeChatRequest.requestId);
    patchChat(activeChatRequest.chatId, (chat) => ({
      ...chat,
      status: result.ok ? "interrupted" : chat.status,
      activity: result.ok ? "user interrupted" : result.error || "stop failed",
      updatedAt: new Date().toISOString(),
    }));
    requestMap.current.delete(activeChatRequest.requestId);
    setActiveRequests((current) => current.filter((request) => request.requestId !== activeChatRequest.requestId));
  }, [activeChatRequest, patchChat]);

  const restartBackend = useCallback(async () => {
    setRestartMessage("再起動を要求しました。復帰を確認中です。");
    try {
      const result: RestartResult | undefined = await window.harnesDesktop?.restartBackend();
      if (!result) {
        setRestartMessage("再起動はElectron版でのみ利用できます。");
        return;
      }
      setBackend(result.state);
      setRestartMessage(result.ok ? "再起動が完了しました。" : `再起動に失敗しました: ${result.error || result.state.message}`);
      await refresh();
    } catch (error) {
      setRestartMessage(error instanceof Error ? error.message : "再起動に失敗しました。");
    }
  }, [refresh]);

  const lockWorkspace = useCallback(async () => {
    const pathValue = settings.workspacePath.trim();
    if (!pathValue) {
      setWorkspaceMessage("lockするworkspace pathが未入力です。");
      return;
    }
    try {
      const result: WorkspaceMutationResult | undefined = await window.harnesDesktop?.lockWorkspace(pathValue);
      setWorkspaceMessage(result?.ok === false ? compactText(result.error, "workspace lock failed") : `workspaceを固定しました: ${pathValue}`);
      await refresh();
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "workspace lock failed");
    }
  }, [refresh, settings.workspacePath]);

  const unlockWorkspace = useCallback(async () => {
    try {
      const result: WorkspaceMutationResult | undefined = await window.harnesDesktop?.unlockWorkspace();
      setWorkspaceMessage(result?.ok === false ? compactText(result.error, "workspace unlock failed") : "workspace lockを解除しました。");
      await refresh();
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "workspace unlock failed");
    }
  }, [refresh]);

  const routeSummary = runtime?.execApi?.evalApi?.runPath || "POST /api/eval/run";
  const proposalSummary = proposal?.summary || [];
  const diagnosticRows = summarizeDiagnostics(diagnostics);
  const diagnosticsHealth = summarizeDiagnosticsHealth(diagnostics);
  const evidenceSummary = summarizeEvidence(logs);
  const hasProposal = Boolean(proposal?.proposalTitle || proposal?.publicPath || proposalSummary.length);
  const runtimeModeLabel = runtime?.mode === "app-server" ? "接続済み" : "未接続";
  const runtimeModelLabel = `${asText(runtime?.execApi?.defaultModel, settings.model)} / ${asText(runtime?.execApi?.modelReasoningEffort, settings.modelReasoningEffort)}`;
  const runSettingsSummary = `${settings.sandboxMode} / ${settings.approvalPolicy} / FAST ${settings.fastModeEnabled ? "ON" : "OFF"}`;
  const codexVersionLabel = codexCliVersionLabel(diagnostics);
  const runtimeRefreshLabel = timeLabelFromIso(runtimeRefreshState.lastAt, "未取得");
  const topbarStatusDetail = compactText(backend.message, runtime?.mode === "app-server" ? "backend ready" : "runtime未読込");
  const showServerRecovery = backend.status !== "running";
  const showRuntimeIssue = Boolean(diagnostics) && diagnosticsHealth.className !== "pass";
  const showEvidenceIssue = evidenceSummary.className === "failed";
  const showRightRail = true;

  return (
    <main className="desktop-shell app-mode">
      <header className="topbar">
        <div>
          <p className="eyebrow">Harnes desktop application</p>
          <h1>Harnes Desktop</h1>
        </div>
        <div className="topbar-operational">
          <div className={`status-pill old-web-status ${statusClass(backend.status)}`} aria-live="polite">
            <span className="old-web-status-spinner" aria-hidden="true" />
            <strong>{statusText(backend.status)}</strong>
            <span className="old-web-status-separator">---</span>
            <span className="old-web-status-detail">{topbarStatusDetail}</span>
            <span className="old-web-status-time">{timeLabelFromIso(backend.updatedAt)}</span>
            <span className="old-web-version">Ver {codexVersionLabel}</span>
          </div>
          <button
            className="secondary old-web-restart"
            type="button"
            title="backendを再起動し、復帰後にruntimeを再取得します。実行中の依頼がある場合は押せません。"
            onClick={restartBackend}
            disabled={backend.status === "restarting" || activeExec > 0 || hasActiveRequests}
          >
            Web再起動
          </button>
        </div>
      </header>

      <section className={`app-grid ${sidebarOpen ? "" : "sidebar-collapsed"} ${showRightRail ? "" : "right-rail-hidden"}`}>
        <aside className={`sidebar-shell ${sidebarOpen ? "expanded" : "collapsed"}`}>
          <button
            aria-label={sidebarOpen ? "サイドバーを隠す" : "サイドバーを表示"}
            className="sidebar-edge-toggle"
            title={sidebarOpen ? "サイドバーを隠す" : "サイドバーを表示"}
            type="button"
            onClick={() => setSidebarOpen((current) => !current)}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true" />
          </button>
          {sidebarOpen ? (
            <div className="sidebar">
              {hasProposal ? (
                <section className="proposal-dock">
                  <p className="eyebrow">Design proposal</p>
                  <h2>{proposal?.proposalTitle || "最新デザイン案"}</h2>
                  <p>{proposalSummary[0] || "プレビューできます。"}</p>
                  <button className="primary" type="button" onClick={() => openLocal(proposalUrl)}>プレビュー</button>
                </section>
              ) : null}
              <section className="sidebar-section">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Chats</p>
                    <h2>依頼一覧</h2>
                  </div>
                  <button className="secondary icon-button" type="button" onClick={createNewChat}>New</button>
                </div>
                <div className="chat-list">
                  {chats.map((chat) => (
                    <button
                      key={chat.id}
                      className={`chat-row ${chat.id === activeChat?.id ? "active" : ""}`}
                      type="button"
                      onClick={() => setActiveChatId(chat.id)}
                    >
                      <strong>{chat.title}</strong>
                      <span>{workStateForChat(chat, { activeForChat: activeRequests.some((request) => request.chatId === chat.id) }).listLabel} / {chat.messages.length} messages</span>
                    </button>
                  ))}
                </div>
                <div className="sidebar-actions">
                  <button className="secondary" type="button" onClick={deleteActiveChat}>Delete</button>
                  <button className="secondary" type="button" onClick={clearActiveChat}>Clear</button>
                </div>
              </section>
            </div>
          ) : (
            <div className="sidebar-rail" aria-label="サイドバーショートカット">
              {hasProposal ? (
                <button className="rail-button proposal-rail-button" type="button" onClick={() => openLocal(proposalUrl)} title="最新デザイン案を開く" aria-label="最新デザイン案を開く">P</button>
              ) : null}
              <button className="rail-button" type="button" onClick={createNewChat} title="新規依頼" aria-label="新規依頼">+</button>
            </div>
          )}
        </aside>

        <section className="workbench">
          <section className="panel conversation-panel full-span">
            <div className="section-head">
              <div>
                <p className="eyebrow">Conversation</p>
                <h2>{activeChat?.messages.length ? `${activeChat.messages.length} messages` : "まだ会話はありません"}</h2>
              </div>
              <div className="conversation-actions">
                <button className="secondary" type="button" onClick={clearActiveChat}>会話をクリア</button>
              </div>
            </div>
            <div className="timeline">
              {(activeChat?.messages.length ? activeChat.messages : [createMessage("system", "System", "依頼を送ると、この枠に進行と最終結果が流れます。")]).map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <header>
                    <strong>{message.title}</strong>
                    <span>{message.time}</span>
                  </header>
                  <pre>{message.content || (message.role === "assistant" ? "ストリーム待機中..." : "")}</pre>
                </article>
              ))}
            </div>
          </section>

          <section className="panel mission-panel full-span">
            <textarea
              value={mission}
              onChange={(event) => setMission(event.target.value)}
              onKeyDown={handleMissionKeyDown}
              onPaste={(event) => {
                const files = event.clipboardData?.files;
                if (files?.length) void handleAttachmentPick(files);
              }}
              placeholder="依頼を書く。Electron main process経由で既存の POST /api/exec に送信します。"
            />
            <div className="composer-toolbar">
              <div className="composer-tools">
                <div className="command-strip">
                  <button
                    aria-expanded={commandMenuOpen}
                    aria-haspopup="menu"
                    className="secondary small-button command-menu-trigger"
                    type="button"
                    onClick={() => setCommandMenuOpen((current) => !current)}
                  >
                    /commands
                  </button>
                  {commandMenuOpen ? (
                    <div className="command-menu" role="menu">
                      <button className="command-menu-item primary-command" role="menuitem" type="button" onClick={() => insertCommandText(UI_IMPROVEMENT_PROMPT)}>UI改善</button>
                      <div className="command-menu-divider" />
                      {COMMANDS.map((command) => (
                        <button className="command-menu-item" key={command} role="menuitem" type="button" onClick={() => insertCommandText(command)}>{command}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input
                  className="hidden-file-input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => void handleAttachmentPick(event.currentTarget.files)}
                />
                <button className="secondary small-button attachment-trigger" type="button" onClick={() => fileInputRef.current?.click()}>画像添付</button>
                {missionMetaItems.length ? (
                  <div className={`mission-meta work-state-meta ${activeChatWorkState.tone}`} aria-live="polite">
                    {missionMetaItems.map((item) => <span key={item}>{item}</span>)}
                  </div>
                ) : null}
              </div>
              <div className="composer-submit-actions">
                <button className="danger-button" type="button" onClick={stopActiveRequest} disabled={!activeChatRequest}>停止</button>
                <button className="primary" type="button" onClick={submitMission} disabled={!canSubmitMission}>送信</button>
              </div>
            </div>
            <section className="attachment-panel" aria-live="polite">
              {attachments.length ? (
                <>
                  <div className="attachment-panel-head">
                    <strong>{attachments.length}件の画像を添付中</strong>
                    <button className="secondary small-button" type="button" onClick={() => setAttachments([])}>すべて外す</button>
                  </div>
                  <div className="attachment-list">
                    {attachments.map((image, index) => (
                      <article className="attachment-item" key={`${image.name}-${image.sizeBytes}-${index}`}>
                        <img className="attachment-thumb" src={image.dataUrl} alt={`${image.name} のプレビュー`} />
                        <div className="attachment-copy">
                          <strong>{image.name}</strong>
                          <span>{formatBytes(image.sizeBytes)} / {image.mimeType || "image"}</span>
                        </div>
                        <button
                          className="secondary small-button attachment-remove"
                          type="button"
                          onClick={() => setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                        >
                          削除
                        </button>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
            {attachmentError ? <p className="notice danger">{attachmentError}</p> : null}
          </section>
        </section>

        <aside className={`right-rail ${showRightRail ? "" : "empty"}`}>
          <section className="panel runtime-panel compact-runtime-panel">
            <div className="section-head compact-runtime-head">
              <div>
                <p className="eyebrow">Runtime</p>
                <h2>{runtimeModeLabel}</h2>
              </div>
              <button
                className="secondary runtime-refresh-button"
                type="button"
                title="/api/runtime、diagnostics、logs、design proposalを再取得します。"
                onClick={refresh}
                disabled={runtimeRefreshState.loading}
              >
                {runtimeRefreshState.loading ? "更新中..." : "Runtime更新"}
              </button>
            </div>
            <p className="runtime-refresh-note">更新対象: /api/runtime、診断、logs、デザイン案。最終更新: {runtimeRefreshLabel}</p>
            <div className="runtime-summary-row">
              <span>Model {runtimeModelLabel}</span>
              <span>{runSettingsSummary}</span>
              <span>Active {activeExec}</span>
            </div>
            {loadError ? <p className="notice danger">{loadError}</p> : null}
          </section>

          <section className={`panel settings-panel run-settings-panel ${settingsOpen ? "settings-open" : ""}`}>
            <div className="settings-summary">
              <div className="settings-summary-title">
                <p className="eyebrow">Execution settings</p>
                <h2>実行設定</h2>
              </div>
              <button
                aria-expanded={settingsOpen}
                className="secondary small-button settings-disclosure-button"
                type="button"
                onClick={() => setSettingsOpen((current) => !current)}
              >
                {settingsOpen ? "閉じる" : "開く"}
              </button>
              <span className="settings-summary-text">{runSettingsSummary}</span>
            </div>
            {settingsOpen ? (
            <div className="settings-detail-body">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">Details</p>
                  <h2>送信設定</h2>
                </div>
                <button className="secondary" type="button" onClick={() => openLocal(existingWebUiUrl)}>旧Web UI</button>
              </div>
              <div className="settings-grid">
                <label>
                  <span>モデル</span>
                  <select value={settings.model} onChange={(event) => updateSetting("model", event.target.value)}>
                    {MODEL_OPTIONS.includes(settings.model) ? null : <option value={settings.model}>{settings.model}</option>}
                    {MODEL_OPTIONS.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                </label>
                <label>
                  <span>推論</span>
                  <select value={settings.modelReasoningEffort} onChange={(event) => updateSetting("modelReasoningEffort", event.target.value)}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="xhigh">xhigh</option>
                  </select>
                </label>
                <label>
                  <span>承認</span>
                  <select value={settings.approvalPolicy} onChange={(event) => updateSetting("approvalPolicy", event.target.value)}>
                    <option value="on-request">on-request</option>
                    <option value="never">never</option>
                    <option value="untrusted">untrusted</option>
                  </select>
                </label>
                <label>
                  <span>Sandbox</span>
                  <select value={settings.sandboxMode} onChange={(event) => updateSetting("sandboxMode", event.target.value)}>
                    <option value="workspace-write">workspace-write</option>
                    <option value="read-only">read-only</option>
                    <option value="danger-full-access">danger-full-access</option>
                  </select>
                </label>
                <label>
                  <span>Web検索</span>
                  <select value={settings.webSearchMode} onChange={(event) => updateSetting("webSearchMode", event.target.value)}>
                    <option value="disabled">disabled</option>
                    <option value="cached">cached</option>
                    <option value="live">live</option>
                  </select>
                </label>
                <label>
                  <span>Workspace</span>
                  <input value={settings.workspacePath} onChange={(event) => updateSetting("workspacePath", event.target.value)} placeholder="C:\\Users\\akima\\dev" />
                </label>
              </div>
              <div className="toggle-row">
                <label className="toggle-label">
                  <input type="checkbox" checked={settings.fastModeEnabled} onChange={(event) => updateSetting("fastModeEnabled", event.target.checked)} />
                  <span>FAST mode</span>
                </label>
                <label className="toggle-label">
                  <input type="checkbox" checked={settings.automaticApprovalReviewEnabled} onChange={(event) => updateSetting("automaticApprovalReviewEnabled", event.target.checked)} />
                  <span>自動承認レビュー</span>
                </label>
                <button className="secondary" type="button" onClick={lockWorkspace}>Lock</button>
                <button className="secondary" type="button" onClick={unlockWorkspace}>Unlock</button>
              </div>
              <p className="notice">Backend: {backendUrl}</p>
              <p className="notice">経路: POST /api/exec と {routeSummary}</p>
              <p className="notice">{workspaceGuardLabel(runtime)} / {workspaceMessage}</p>
            </div>
            ) : null}
          </section>

          <section className={`panel restart-panel ${showServerRecovery ? "" : "operator-only-panel"}`}>
            <p className="eyebrow">Server control</p>
            <h2>再起動状態</h2>
            <p>{backend.message}</p>
            <p className="restart-message">{restartMessage}</p>
            <button className="primary" type="button" onClick={restartBackend} disabled={backend.status === "restarting" || activeExec > 0 || hasActiveRequests}>
              {backend.status === "restarting" ? "再起動中..." : "サーバ再起動"}
            </button>
          </section>

          <section className="panel workspace-panel operator-only-panel">
            <p className="eyebrow">Workspace</p>
            <h2>{asText(runtime?.workspaceRoot, "Workspace未読込")}</h2>
            <div className="chip-row">
              <span>{asText(runtime?.activeAgent, "agent")}</span>
              <span>{asText(runtime?.activePostureProfile, "posture")}</span>
              <span>{asText(runtime?.serviceTier, "tier")}</span>
            </div>
          </section>

          <section className={`panel diagnostics-panel ${showRuntimeIssue ? "" : "operator-only-panel"}`}>
            <div className="section-head">
              <div>
                <p className="eyebrow">Diagnostics</p>
                <h2>診断</h2>
              </div>
              <button className="secondary" type="button" onClick={refresh}>再読込</button>
            </div>
            <div className={`diagnostics-summary ${diagnosticsHealth.className}`}>
              <span>Runtime health</span>
              <strong>{diagnosticsHealth.status}</strong>
              <p>{diagnosticsHealth.reason}</p>
              <div className="chip-row compact">
                <span>Tools: {diagnosticsHealth.tools}</span>
                <span>Profile: {diagnosticsHealth.profile}</span>
                <span>Input: {diagnosticsHealth.policy}</span>
                <span>Shadow: {diagnosticsHealth.shadow}</span>
              </div>
              <p>Updated: {diagnosticsHealth.generatedAt}</p>
            </div>
            <button className="secondary small-button diagnostics-toggle" type="button" onClick={() => setDiagnosticsDetailsOpen((current) => !current)}>
              {diagnosticsDetailsOpen ? "詳細を隠す" : `詳細を表示 (${diagnosticsHealth.detailCount})`}
            </button>
            {diagnosticsDetailsOpen ? (
              <div className="diagnostic-list diagnostics-details">
                {diagnosticRows.map((row) => (
                  <article key={row.key}>
                    <strong>{row.key}</strong>
                    <span>{row.value}</span>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className={`panel logs-panel ${showEvidenceIssue ? "" : "operator-only-panel"}`}>
            <div className="section-head">
              <div>
                <p className="eyebrow">Logs / Evidence</p>
                <h2>Evidence</h2>
              </div>
              <button className="secondary" type="button" onClick={refresh}>再読込</button>
            </div>
            <div className={`evidence-summary ${evidenceSummary.className}`}>
              <span>最新状態</span>
              <strong>{evidenceSummary.status}</strong>
              <p>{evidenceSummary.reason}</p>
              <div className="chip-row compact">
                <span>更新: {evidenceSummary.generatedAt}</span>
                <span>証拠: {evidenceSummary.primaryEvidence}</span>
              </div>
            </div>
            <button className="secondary small-button evidence-toggle" type="button" onClick={() => setEvidenceDetailsOpen((current) => !current)}>
              {evidenceDetailsOpen ? "詳細を隠す" : `詳細を表示 (${evidenceSummary.detailCount})`}
            </button>
            {evidenceDetailsOpen ? (
              <div className="log-list evidence-details">
                {(logs?.entries || []).map((entry) => (
                  <article key={entry.name} className={`log-row ${entry.ok ? "" : "failed"}`}>
                    <strong>{entry.name}</strong>
                    <span>{entry.path}</span>
                    <p>{entry.ok ? summarizeLogData(entry.data) : entry.error}</p>
                  </article>
                ))}
                {!logs?.entries?.length ? <p className="notice">current log surfaceは未読込です。</p> : null}
              </div>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  );
}

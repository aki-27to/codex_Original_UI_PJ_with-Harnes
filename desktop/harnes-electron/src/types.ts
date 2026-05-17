export type BackendStatus = {
  status: "starting" | "running" | "restarting" | "failed";
  backendUrl: string;
  port: number;
  owned: boolean;
  pid: number;
  message: string;
  updatedAt: string;
};

export type RuntimePayload = {
  mode?: string;
  workspaceRoot?: string;
  activeAgent?: string;
  activePostureProfile?: string;
  serviceTier?: string;
  approvalPolicy?: string;
  sandboxMode?: string;
  fastModeEnabled?: boolean;
  automaticApprovalReviewEnabled?: boolean;
  activeExecRequests?: number;
  workspaceGuard?: {
    locked?: boolean;
    root?: string;
    lockRoot?: string;
    [key: string]: unknown;
  };
  serverProcess?: {
    pid?: number;
    uptimeMs?: number;
    activeExecRequests?: number;
  };
  execApi?: {
    defaultModel?: string;
    modelReasoningEffort?: string;
    evalApi?: {
      runPath?: string;
    };
  };
  turnRuntime?: {
    activeExecRequests?: number;
    latestTurn?: {
      status?: string;
      title?: string;
    } | null;
  };
};

export type ExecMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  title: string;
  content: string;
  time: string;
};

export type ExecSubmitPayload = {
  requestId: string;
  prompt: string;
  images?: ImageAttachmentPayload[];
  sandboxMode?: string;
  approvalPolicy?: string;
  fastModeEnabled?: boolean;
  automaticApprovalReviewEnabled?: boolean;
  webSearch?: boolean;
  webSearchMode?: string;
  model?: string;
  modelReasoningEffort?: string;
  agentName?: string;
  forceNewSession?: boolean;
  cwd?: string;
  executionProfile?: string;
  executionIntent?: string;
  idempotencyKey?: string;
};

export type ImageAttachmentPayload = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

export type ExecSubmitResult = {
  ok: boolean;
  requestId: string;
  idempotencyKey: string;
};

export type ExecEventPayload = {
  requestId: string;
  event: {
    type?: string;
    text?: string;
    status?: string;
    label?: string;
    detail?: string;
    steps?: unknown[];
    [key: string]: unknown;
  };
};

export type ProposalManifest = {
  target?: string;
  targetPath?: string;
  proposalTitle?: string;
  status?: string;
  generatedAt?: string;
  proposalPath?: string;
  publicPath?: string;
  manifestPath?: string;
  targetRepoMutated?: boolean;
  summary?: string[];
};

export type CurrentLogEntry = {
  name: string;
  path: string;
  ok: boolean;
  data?: unknown;
  error?: string;
};

export type CurrentLogsPayload = {
  ok: boolean;
  root: string;
  generatedAt: string;
  entries: CurrentLogEntry[];
};

export type DiagnosticsPayload = {
  ok?: boolean;
  generatedAt?: string;
  summary?: string;
  checks?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WorkspaceMutationResult = {
  ok?: boolean;
  workspaceGuard?: RuntimePayload["workspaceGuard"];
  error?: string;
  [key: string]: unknown;
};

export type RestartResult = {
  ok: boolean;
  state: BackendStatus;
  error?: string;
};

export type HarnesDesktopApi = {
  getBackendStatus: () => Promise<BackendStatus>;
  getRuntime: () => Promise<RuntimePayload>;
  getProposalManifest: () => Promise<ProposalManifest>;
  getCurrentLogs: () => Promise<CurrentLogsPayload>;
  getDiagnostics: () => Promise<DiagnosticsPayload>;
  submitExec: (payload: ExecSubmitPayload) => Promise<ExecSubmitResult>;
  cancelExec: (requestId: string) => Promise<{ ok: boolean; requestId?: string; error?: string }>;
  restartBackend: () => Promise<RestartResult>;
  lockWorkspace: (targetPath: string) => Promise<WorkspaceMutationResult>;
  unlockWorkspace: () => Promise<WorkspaceMutationResult>;
  openExternal: (target: string) => Promise<{ ok: boolean; url: string }>;
  onBackendStatus: (callback: (status: BackendStatus) => void) => () => void;
  onExecEvent: (callback: (payload: ExecEventPayload) => void) => () => void;
};

declare global {
  interface Window {
    harnesDesktop?: HarnesDesktopApi;
    __harnesElectronSmoke?: {
      runtimeOk: boolean;
      proposalLinkVisible: boolean;
      backendStatus: string;
      runtimeMode: string;
      proposalTitle: string;
      logsOk?: boolean;
      execControlsVisible?: boolean;
      runtimePanelVisible?: boolean;
      settingsVisible?: boolean;
      diagnosticsVisible?: boolean;
      logsVisible?: boolean;
      restartVisible?: boolean;
      workspaceVisible?: boolean;
      sidebarVisible?: boolean;
      proposalDockVisible?: boolean;
      operatorPanelsHidden?: boolean;
      commandPaletteVisible?: boolean;
      attachmentsVisible?: boolean;
      workStateVisible?: boolean;
      oldWebStatusVisible?: boolean;
      runtimeRefreshExplained?: boolean;
      attachmentRowsReady?: boolean;
      layoutOk?: boolean;
    };
  }
}

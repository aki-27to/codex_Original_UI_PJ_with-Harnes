import React, { useEffect, useMemo, useState } from 'react';

type TabKey = 'chat' | 'debug' | 'evals' | 'lab';

type RuntimeBootstrap = {
  runtime: any;
  defaultSettings: any;
  memory: any;
  feedback: any[];
  preferences: any[];
  reports: any[];
};

const STORAGE_KEY = 'talkApp.rd.state.v1';

function resolveApiBasePath(): string {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  if (pathname === '/apps/talkapp' || pathname.startsWith('/apps/talkapp/')) {
    return '/apps/talkapp/api';
  }
  return '/api';
}

function buildApiPath(pathname: string): string {
  const suffix = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${resolveApiBasePath()}${suffix}`;
}

const FEEDBACK_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '刺さった', value: 'hit' },
  { label: 'まあまあ', value: 'okay' },
  { label: '薄い', value: 'thin' },
  { label: 'AIっぽい', value: 'ai_smell' },
  { label: '言いすぎ', value: 'too_much' },
  { label: 'もっと短く', value: 'shorter' },
  { label: 'もっと尖れ', value: 'sharper' },
  { label: '今の方向は違う', value: 'wrong_direction' },
];

const MODE_LABELS: Record<string, string> = {
  smalltalk: '雑談',
  'deep-dive': '深掘り',
  brainstorm: '壁打ち',
  aftertalk: '感想戦',
  planning: '企画会議',
  'spicy-review': '辛口レビュー',
  'fact-first': '事実優先',
};

const ENGINE_LABELS: Record<string, string> = {
  baseline: 'baseline',
  improved: 'improved',
  'cost-save': 'cost-save',
};

const PROVIDER_LABELS: Record<string, string> = {
  auto: '自動',
  'codex-exec': 'codex-exec',
  responses: 'responses',
};

const TAB_LABELS: Record<TabKey, string> = {
  chat: '会話',
  debug: 'デバッグ',
  evals: '評価',
  lab: 'フィードバック',
};

const RUNTIME_PROVIDER_LABELS: Record<string, string> = {
  auto: 'auto',
  harness: 'harness',
  'codex-exec': 'codex-exec',
  responses: 'responses',
};

export function App() {
  const [tab, setTab] = useState<TabKey>('chat');
  const [bootstrap, setBootstrap] = useState<RuntimeBootstrap | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [sessionMemory, setSessionMemory] = useState<any>({
    recentTopics: [],
    recentFeedbackSignals: [],
    recentStyles: [],
  });
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [lab, setLab] = useState<any>({ feedback: [], goldens: [], antiExamples: [], failures: [] });
  const [importState, setImportState] = useState({ filename: 'examples.json', content: '', target: 'golden' });

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, messages, sessionMemory }));
  }, [settings, messages, sessionMemory]);

  const latestAssistant = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === 'assistant') ?? null;
  }, [messages]);

  async function bootstrapApp() {
    const saved = readSavedState();
    const response = await fetch(buildApiPath('/bootstrap'));
    const data = await response.json();
    setBootstrap(data);
    setSettings(saved?.settings ?? data.defaultSettings);
    setMessages(saved?.messages ?? []);
    setSessionMemory(saved?.sessionMemory ?? {
      recentTopics: [],
      recentFeedbackSignals: [],
      recentStyles: [],
    });
    setReports(data.reports ?? []);
    await refreshLab();
  }

  async function refreshLab() {
    const response = await fetch(buildApiPath('/lab'));
    setLab(await response.json());
  }

  async function sendMessage(regenerate = false) {
    if (!settings) {
      return;
    }

    const nextContent = regenerate
      ? [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
      : input.trim();

    if (!nextContent) {
      return;
    }

    const nextMessages = regenerate
      ? messages.filter((message, index, arr) => !(index === arr.length - 1 && message.role === 'assistant'))
      : [
          ...messages,
          { id: crypto.randomUUID(), role: 'user', content: nextContent, createdAt: new Date().toISOString() },
        ];

    setMessages(nextMessages);
    if (!regenerate) {
      setInput('');
    }

    setPending(true);
    const response = await fetch(buildApiPath('/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: nextMessages,
        settings,
        sessionMemory,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessages([
        ...nextMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.error || '会話に失敗しました。',
          createdAt: new Date().toISOString(),
        },
      ]);
      setPending(false);
      return;
    }

    const assistantMessage = {
      id: data.replyId,
      role: 'assistant',
      content: data.text,
      createdAt: new Date().toISOString(),
      metadata: {
        debug: data.debug,
        provider: data.provider,
        model: data.model,
        responseId: data.responseId,
        citations: data.citations,
      },
    };

    setMessages([...nextMessages, assistantMessage]);
    setSessionMemory(data.debug?.memorySnapshot?.session ?? sessionMemory);
    setPending(false);
  }

  async function sendFeedback(label: string, reply: any) {
    const pairedUser = findPairedUserMessage(reply);
    await fetch(buildApiPath('/feedback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replyId: reply.id,
        label,
        messageText: pairedUser?.content ?? '',
        replyText: reply.content,
        note: '',
      }),
    });
    await refreshLab();
  }

  async function choosePair(reply: any, chosenCandidateId: string) {
    const candidates = reply.metadata?.debug?.candidates ?? [];
    if (candidates.length < 2) {
      return;
    }
    await fetch(buildApiPath('/preferences'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replyId: reply.id,
        leftCandidateId: candidates[0].id,
        rightCandidateId: candidates[1].id,
        chosenCandidateId,
      }),
    });
    await refreshLab();
  }

  async function runEvals() {
    if (!settings) {
      return;
    }
    const response = await fetch(buildApiPath('/evals/run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    setReports(await response.json());
    await refreshLab();
  }

  async function importExamples() {
    await fetch(buildApiPath('/examples/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importState),
    });
    await refreshLab();
  }

  async function promoteFeedback(feedbackId: string, target: 'golden' | 'anti') {
    await fetch(buildApiPath('/examples/promote'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackId, target }),
    });
    await refreshLab();
  }

  async function resetMemory() {
    await fetch(buildApiPath('/memory'), { method: 'DELETE' });
    const response = await fetch(buildApiPath('/memory'));
    const memory = await response.json();
    setBootstrap((current) => (current ? { ...current, memory } : current));
  }

  if (!bootstrap || !settings) {
    return (
      <div className="app-shell app-shell-loading">
        <div className="loading-note">読み込み中です。</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="side-panel">
        <header className="side-header">
          <p className="overline">会話の調整画面</p>
          <h1>talkApp</h1>
          <p className="intro">会話の窓口と評価を同じ画面で触れるようにした、作業用のUIです。</p>
        </header>

        <section className="section-block">
          <div className="section-title">会話モード</div>
          <div className="section-group">
            <div className="group-title">会話の流れ</div>
            <select value={settings.mode} onChange={(event) => setSettings({ ...settings, mode: event.target.value })}>
              {Object.entries(MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label className="field">
              <span>会話エンジン</span>
              <select value={settings.engineVariant} onChange={(event) => setSettings({ ...settings, engineVariant: event.target.value })}>
                {Object.entries(ENGINE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="section-group">
            <div className="group-title">窓口とモデル</div>
            <label className="field">
              <span>会話の窓口</span>
              <select value={settings.provider} onChange={(event) => setSettings({ ...settings, provider: event.target.value })}>
                {Object.entries(RUNTIME_PROVIDER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>会話モデル</span>
              <input value={settings.runtimeModel} onChange={(event) => setSettings({ ...settings, runtimeModel: event.target.value })} />
            </label>

            <label className="field">
              <span>採点モデル</span>
              <input value={settings.gradingModel} onChange={(event) => setSettings({ ...settings, gradingModel: event.target.value })} />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.webSearch}
                onChange={(event) => setSettings({ ...settings, webSearch: event.target.checked })}
              />
              <span>外部検索を使う</span>
            </label>
          </div>
        </section>

        <section className="section-block">
          <div className="section-title">話し方の調整</div>
          {Object.entries(settings.sliders).map(([key, value]) => (
            <label key={key} className="slider-row">
              <span>{sliderLabel(key)}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Number(value)}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    sliders: { ...settings.sliders, [key]: Number(event.target.value) },
                  })}
              />
              <strong>{String(value)}</strong>
            </label>
          ))}
        </section>

        <section className="section-block">
          <div className="section-title">現在の状態</div>
          <dl className="meta-list">
            <div>
              <dt>窓口</dt>
              <dd>{bootstrap.runtime.selectedProvider || '未選択'}</dd>
            </div>
            <div>
              <dt>responses</dt>
              <dd>{bootstrap.runtime.providers.responses.ready ? '利用可' : bootstrap.runtime.providers.responses.error}</dd>
            </div>
            <div>
              <dt>harness</dt>
              <dd>{bootstrap.runtime.providers.harness.ready ? '蛻ｩ逕ｨ蜿ｯ' : bootstrap.runtime.providers.harness.error}</dd>
            </div>
            <div>
              <dt>codex-exec</dt>
              <dd>
                {bootstrap.runtime.providers['codex-exec'].ready
                  ? '利用可'
                  : bootstrap.runtime.providers['codex-exec'].error}
              </dd>
            </div>
          </dl>
          <button className="text-button" onClick={resetMemory}>
            記憶を初期化
          </button>
        </section>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="overline">会話品質を詰めるための画面</p>
            <h2>{TAB_LABELS[tab]}</h2>
          </div>
          <nav className="tab-nav" aria-label="画面切り替え">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
              <button key={key} className={tab === key ? 'tab-link current' : 'tab-link'} onClick={() => setTab(key)}>
                {TAB_LABELS[key]}
              </button>
            ))}
          </nav>
        </header>

        {tab === 'chat' && (
          <section className="view view-chat">
            <div className="toolbar">
              <div className="toolbar-copy">
                <span>{MODE_LABELS[settings.mode]}</span>
                <span>{settings.runtimeModel}</span>
                <span>{bootstrap.runtime.selectedProvider || '未接続'}</span>
              </div>
              <div className="toolbar-actions">
                <button className="text-button" onClick={() => downloadSession(messages)}>
                  書き出し
                </button>
                <button className="text-button" onClick={() => void sendMessage(true)}>
                  再生成
                </button>
              </div>
            </div>

            <div className="chat-log">
              {messages.map((message) => (
                <article key={message.id} className={`message-row ${message.role}`}>
                  <div className="message-meta">
                    <strong>{message.role === 'assistant' ? settings.assistantName : 'あなた'}</strong>
                    {message.metadata?.provider && <span>{message.metadata.provider}</span>}
                  </div>
                  <div className="message-copy">{message.content}</div>
                  {message.role === 'assistant' && (
                    <div className="feedback-row">
                      {FEEDBACK_OPTIONS.map((option) => (
                        <button key={option.value} className="mini-button" onClick={() => void sendFeedback(option.value, message)}>
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {message.role === 'assistant' && message.metadata?.debug?.candidates?.length >= 2 && (
                    <div className="compare-block">
                      <div className="compare-title">候補を比べる</div>
                      <div className="compare-grid">
                        {message.metadata.debug.candidates.slice(0, 2).map((candidate: any, index: number) => (
                          <button
                            key={candidate.id}
                            className="compare-option"
                            onClick={() => void choosePair(message, candidate.id)}
                          >
                            <strong>{index === 0 ? 'A' : 'B'}</strong>
                            <span>{candidate.draft}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              ))}
              {pending && (
                <article className="message-row assistant pending-row">
                  <div className="message-meta">
                    <strong>{settings.assistantName}</strong>
                  </div>
                  <div className="message-copy">考え中です。</div>
                </article>
              )}
            </div>

            <div className="composer">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="そのままの言い方で入れてください。雑談でも、企画の詰まりでも大丈夫です。"
              />
              <button className="primary-button" disabled={pending} onClick={() => void sendMessage(false)}>
                送信
              </button>
            </div>
          </section>
        )}

        {tab === 'debug' && (
          <section className="view">
            {latestAssistant?.metadata?.debug ? (
              <div className="line-grid">
                <LinePanel title="推定">
                  <pre>{JSON.stringify(latestAssistant.metadata.debug.analysis, null, 2)}</pre>
                </LinePanel>
                <LinePanel title="ステージとムーブ">
                  <pre>
                    {JSON.stringify(
                      {
                        stage: latestAssistant.metadata.debug.stage,
                        moves: latestAssistant.metadata.debug.moves,
                        rationale: latestAssistant.metadata.debug.rationale,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </LinePanel>
                <LinePanel title="grounding 判定">
                  <pre>{JSON.stringify(latestAssistant.metadata.debug.grounding, null, 2)}</pre>
                </LinePanel>
                <LinePanel title="弾いたパターン">
                  <pre>{JSON.stringify(latestAssistant.metadata.debug.detectors, null, 2)}</pre>
                </LinePanel>
                <LinePanel title="記憶スナップショット">
                  <pre>{JSON.stringify(latestAssistant.metadata.debug.memorySnapshot, null, 2)}</pre>
                </LinePanel>
                <LinePanel title="候補一覧">
                  <pre>{JSON.stringify(latestAssistant.metadata.debug.candidates, null, 2)}</pre>
                </LinePanel>
              </div>
            ) : (
              <div className="empty-note">まだデバッグ対象の返答がありません。</div>
            )}
          </section>
        )}

        {tab === 'evals' && (
          <section className="view">
            <div className="toolbar">
              <div className="toolbar-copy">
                <span>baseline と improved の比較</span>
              </div>
              <div className="toolbar-actions">
                <button className="primary-button" onClick={() => void runEvals()}>
                  評価を回す
                </button>
              </div>
            </div>
            <div className="report-list">
              {reports.map((report) => (
                <article key={report.id} className="report-row">
                  <h3>{report.loops?.join(', ')}</h3>
                  <dl className="report-metrics">
                    <div>
                      <dt>dataset</dt>
                      <dd>{report.datasetName}</dd>
                    </div>
                    <div>
                      <dt>pairwise</dt>
                      <dd>{report.pairwiseWinRate}%</dd>
                    </div>
                    <div>
                      <dt>interestingness</dt>
                      <dd>{report.improvements?.interestingnessLiftPct}%</dd>
                    </div>
                    <div>
                      <dt>ai smell</dt>
                      <dd>{report.improvements?.aiSmellDropPct}%</dd>
                    </div>
                    <div>
                      <dt>groundedness</dt>
                      <dd>{report.improvements?.groundednessDelta}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'lab' && (
          <section className="view">
            <div className="line-grid">
              <LinePanel title="example を取り込む">
                <input value={importState.filename} onChange={(event) => setImportState({ ...importState, filename: event.target.value })} />
                <select value={importState.target} onChange={(event) => setImportState({ ...importState, target: event.target.value })}>
                  <option value="golden">golden</option>
                  <option value="anti">anti</option>
                </select>
                <textarea value={importState.content} onChange={(event) => setImportState({ ...importState, content: event.target.value })} />
                <button className="text-button" onClick={() => void importExamples()}>
                  取り込む
                </button>
              </LinePanel>

              <LinePanel title="いま集まっている評価">
                <div className="stack-list">
                  {lab.feedback.slice(0, 12).map((item: any) => (
                    <article key={item.id} className="stack-row">
                      <strong>{feedbackLabel(item.label)}</strong>
                      <div>{item.replyText}</div>
                      <div className="inline-actions">
                        <button className="mini-button" onClick={() => void promoteFeedback(item.id, 'golden')}>
                          goldenへ
                        </button>
                        <button className="mini-button" onClick={() => void promoteFeedback(item.id, 'anti')}>
                          antiへ
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </LinePanel>

              <LinePanel title="goldens">
                <div className="stack-list">
                  {lab.goldens.slice(0, 10).map((item: any) => (
                    <article key={item.id} className="stack-row">
                      <strong>{item.category}</strong>
                      <div>{item.good}</div>
                    </article>
                  ))}
                </div>
              </LinePanel>

              <LinePanel title="anti examples / failures">
                <div className="stack-list">
                  {lab.antiExamples.slice(0, 6).map((item: any) => (
                    <article key={item.id} className="stack-row">
                      <strong>{item.category}</strong>
                      <div>{item.bad}</div>
                    </article>
                  ))}
                  {lab.failures.slice(0, 6).map((item: any) => (
                    <article key={item.id} className="stack-row">
                      <strong>{item.category}</strong>
                      <div>{item.reply}</div>
                    </article>
                  ))}
                </div>
              </LinePanel>
            </div>
          </section>
        )}
      </main>
    </div>
  );

  function findPairedUserMessage(reply: any) {
    const index = messages.findIndex((message) => message.id === reply.id);
    if (index <= 0) {
      return null;
    }
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (messages[cursor].role === 'user') {
        return messages[cursor];
      }
    }
    return null;
  }
}

function LinePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="line-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function sliderLabel(key: string) {
  const labels: Record<string, string> = {
    warmth: '温度',
    sharpness: '切れ味',
    humor: 'ユーモア',
    density: '密度',
    challenge: '反論',
    brevity: '短さ',
    weirdness: 'ズラし',
  };
  return labels[key] || key;
}

function feedbackLabel(value: string) {
  return FEEDBACK_OPTIONS.find((item) => item.value === value)?.label || value;
}

function readSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function downloadSession(messages: any[]) {
  const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `talkapp-session-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

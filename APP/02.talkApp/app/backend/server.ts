import express from 'express';
import path from 'node:path';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { appConfig } from '../../src/shared/config.js';
import { createDefaultSettings } from '../../src/shared/defaultSettings.js';
import { frontendDistDir, goldensPath, antiExamplesPath, failuresPath, evalReportsDir, persistentMemoryPath } from '../../src/shared/paths.js';
import {
  ChatMessage,
  ChatRole,
  ChatSettings,
  FeedbackLabel,
  RuntimeProvider,
  SessionMemory,
} from '../../src/shared/types.js';
import { compactText, createId, nowIso, sanitizeText } from '../../src/shared/utils.js';
import { getRuntimeStatus, chooseProvider } from '../../src/runtime/createRuntime.js';
import { runBaselineEngine } from '../../src/conversation/baselineEngine.js';
import { runImprovedEngine } from '../../src/conversation/replyEngine.js';
import { addFeedback, listFeedback, promoteFeedback } from '../../src/feedback/feedbackStore.js';
import { addPreferencePair, listPreferencePairs } from '../../src/feedback/preferencePairs.js';
import { importExamples } from '../../src/feedback/exampleImporter.js';
import { loadPersistentMemory, savePersistentMemory } from '../../src/conversation/memoryStore.js';
import { readJsonFile } from '../../src/storage/fileStore.js';
import { runEvalLoops } from '../../src/evals/runners/runEvalSuite.js';

const app = express();

app.use(express.json({ limit: '2mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, port: appConfig.port, host: appConfig.host });
});

app.get('/api/runtime', async (_req, res, next) => {
  try {
    const runtime = await getRuntimeStatus();
    res.json({
      ...runtime,
      defaultSettings: createDefaultSettings(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/bootstrap', async (_req, res, next) => {
  try {
    const runtime = await getRuntimeStatus();
    const memory = await loadPersistentMemory();
    const feedback = await listFeedback();
    const preferences = await listPreferencePairs();
    const reports = await loadEvalReports();
    res.json({
      runtime,
      defaultSettings: createDefaultSettings(),
      memory,
      feedback: feedback.slice(0, 50),
      preferences: preferences.slice(0, 50),
      reports,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chat', async (req, res, next) => {
  try {
    const messages = sanitizeMessages(req.body?.messages);
    if (!messages.length) {
      res.status(400).json({ error: 'At least one user message is required.' });
      return;
    }

    const settings = mergeSettings(req.body?.settings);
    const sessionMemory = sanitizeSessionMemory(req.body?.sessionMemory);
    const runtime = await getRuntimeStatus();
    const provider = chooseProvider(
      settings.provider,
      runtime.providers.harness.ready,
      runtime.providers['codex-exec'].ready,
      runtime.providers.responses.ready,
    );
    if (!provider) {
      res.status(503).json({ error: 'No AI runtime is ready. Start the harness, sign in to Codex CLI, or configure OPENAI_API_KEY.' });
      return;
    }

    const effectiveModel = resolveModel(settings, provider);
    const result = settings.engineVariant === 'baseline'
      ? await runBaselineEngine({
          messages,
          settings,
          provider,
          model: effectiveModel,
          sessionMemory,
        })
      : await runImprovedEngine({
          messages,
          settings,
          provider,
          model: effectiveModel,
          sessionMemory,
        });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/feedback', async (_req, res, next) => {
  try {
    res.json(await listFeedback());
  } catch (error) {
    next(error);
  }
});

app.post('/api/feedback', async (req, res, next) => {
  try {
    const label = req.body?.label as FeedbackLabel;
    const entry = await addFeedback({
      replyId: sanitizeText(req.body?.replyId, createId('reply')),
      label,
      messageText: sanitizeText(req.body?.messageText),
      replyText: sanitizeText(req.body?.replyText),
      note: sanitizeText(req.body?.note, '', 500),
    });
    res.json(entry);
  } catch (error) {
    next(error);
  }
});

app.post('/api/preferences', async (req, res, next) => {
  try {
    const entry = await addPreferencePair({
      replyId: sanitizeText(req.body?.replyId, createId('reply')),
      leftCandidateId: sanitizeText(req.body?.leftCandidateId),
      rightCandidateId: sanitizeText(req.body?.rightCandidateId),
      chosenCandidateId: sanitizeText(req.body?.chosenCandidateId),
    });
    res.json(entry);
  } catch (error) {
    next(error);
  }
});

app.get('/api/preferences', async (_req, res, next) => {
  try {
    res.json(await listPreferencePairs());
  } catch (error) {
    next(error);
  }
});

app.get('/api/memory', async (_req, res, next) => {
  try {
    res.json(await loadPersistentMemory());
  } catch (error) {
    next(error);
  }
});

app.delete('/api/memory', async (_req, res, next) => {
  try {
    const reset = {
      interests: {},
      styleLikes: {},
      styleDislikes: {},
      responseWins: {},
      responseLosses: {},
      tempoPreference: 'balanced' as const,
      updatedAt: nowIso(),
    };
    await savePersistentMemory(reset);
    res.json(reset);
  } catch (error) {
    next(error);
  }
});

app.get('/api/lab', async (_req, res, next) => {
  try {
    const [feedback, goldens, antiExamples, failures] = await Promise.all([
      listFeedback(),
      readJsonFile(goldensPath, []),
      readJsonFile(antiExamplesPath, []),
      readJsonFile(failuresPath, []),
    ]);

    res.json({
      feedback,
      goldens,
      antiExamples,
      failures,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/examples/import', async (req, res, next) => {
  try {
    const result = await importExamples({
      content: sanitizeText(req.body?.content, '', 200_000),
      filename: sanitizeText(req.body?.filename, 'import.json'),
      target: req.body?.target === 'anti' ? 'anti' : 'golden',
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/examples/promote', async (req, res, next) => {
  try {
    await promoteFeedback(
      sanitizeText(req.body?.feedbackId),
      req.body?.target === 'anti' ? 'anti' : 'golden',
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/evals/reports', async (_req, res, next) => {
  try {
    res.json(await loadEvalReports());
  } catch (error) {
    next(error);
  }
});

app.post('/api/evals/run', async (req, res, next) => {
  try {
    const settings = mergeSettings(req.body?.settings);
    const reports = await runEvalLoops(settings);
    res.json(reports);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(frontendDistDir, { extensions: ['html'] }));

app.use(async (_req, res) => {
  const indexPath = path.join(frontendDistDir, 'index.html');
  try {
    const html = await readFile(indexPath, 'utf8');
    res.type('html').send(html);
  } catch {
    res.status(500).send('Frontend build is missing. Run npm run build.');
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  res.status(500).json({ error: message });
});

async function loadEvalReports() {
  await mkdir(evalReportsDir, { recursive: true });
  const files = (await readdir(evalReportsDir)).filter((file) => file.endsWith('.json'));
  const reports: any[] = [];
  for (const file of files) {
    const raw = await readJsonFile(path.join(evalReportsDir, file), null);
    if (raw) {
      reports.push(raw);
    }
  }
  return reports.sort((left: any, right: any) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

function sanitizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .filter((item) => item && typeof item === 'object')
    .map((item: any): ChatMessage => ({
      id: sanitizeText(item.id, createId('msg')),
      role: (item.role === 'assistant' ? 'assistant' : item.role === 'system' ? 'system' : 'user') as ChatRole,
      content: sanitizeText(item.content),
      createdAt: sanitizeText(item.createdAt, nowIso()),
      responseId: sanitizeText(item.responseId, ''),
    }))
    .filter((item) => item.content);
}

function mergeSettings(input: unknown): ChatSettings {
  const defaults = createDefaultSettings();
  const value = (input && typeof input === 'object' ? input : {}) as Partial<ChatSettings>;
  return {
    ...defaults,
    ...value,
    sliders: {
      ...defaults.sliders,
      ...(value.sliders ?? {}),
    },
    provider: sanitizeProvider(value.provider),
    runtimeModel: sanitizeText(value.runtimeModel, defaults.runtimeModel, 80),
    gradingModel: sanitizeText(value.gradingModel, defaults.gradingModel, 80),
    projectContext: sanitizeText(value.projectContext, defaults.projectContext, 6000),
    collaborationNotes: sanitizeText(value.collaborationNotes, defaults.collaborationNotes, 2000),
    relationship: sanitizeText(value.relationship, defaults.relationship, 240),
    speechStyle: sanitizeText(value.speechStyle, defaults.speechStyle, 240),
  };
}

function sanitizeProvider(provider: unknown): RuntimeProvider {
  return provider === 'responses' || provider === 'codex-exec' || provider === 'harness' || provider === 'auto' ? provider : 'auto';
}

function sanitizeSessionMemory(input: unknown): SessionMemory | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const value = input as SessionMemory;
  return {
    recentTopics: Array.isArray(value.recentTopics) ? value.recentTopics.map((item) => compactText(String(item), 80)) : [],
    recentFeedbackSignals: Array.isArray(value.recentFeedbackSignals) ? value.recentFeedbackSignals.map((item) => compactText(String(item), 80)) : [],
    recentStyles: Array.isArray(value.recentStyles) ? value.recentStyles.map((item) => compactText(String(item), 80)) : [],
    lastStage: value.lastStage,
  };
}

function resolveModel(settings: ChatSettings, provider: RuntimeProvider | ''): string {
  if (settings.runtimeModel.trim()) {
    return settings.runtimeModel.trim();
  }
  if (provider === 'responses') {
    return appConfig.defaultResponsesModel;
  }
  return appConfig.defaultCodexModel;
}

app.listen(appConfig.port, appConfig.host, () => {
  console.log(`[talk-app-rd] listening on http://${appConfig.host}:${appConfig.port}`);
  console.log(`[talk-app-rd] frontend=${frontendDistDir}`);
  console.log(`[talk-app-rd] memory=${persistentMemoryPath}`);
});

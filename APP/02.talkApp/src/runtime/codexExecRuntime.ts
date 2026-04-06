import { existsSync, readFileSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { appConfig } from '../shared/config.js';
import { createId } from '../shared/utils.js';
import { codexChatSchemaPath, repoRoot } from '../shared/paths.js';
import { RuntimeGenerateOptions, RuntimeGenerateResult } from './types.js';

let readyCache: Promise<boolean> | null = null;
let activeRuns = 0;

function resolveWindowsInvocation() {
  const appData = process.env.APPDATA ?? '';
  if (!appData) {
    return null;
  }

  const cmdPath = path.join(appData, 'npm', 'codex.cmd');
  if (!existsSync(cmdPath)) {
    return null;
  }

  try {
    const source = readFileSync(cmdPath, 'utf8');
    const rootMatch = source.match(/SET\s+"CODEX_ROOT=([^"\r\n]+)"/i);
    const jsMatch = source.match(/"([^"\r\n]+node_modules\\@openai\\codex\\bin\\codex\.js)"/i);
    const codexRoot = rootMatch ? rootMatch[1] : '';
    const codexJsPath = jsMatch ? jsMatch[1] : '';
    const nodeExe = codexRoot ? path.join(codexRoot, 'node.exe') : '';
    if (!codexJsPath || !existsSync(codexJsPath)) {
      return null;
    }
    return {
      command: nodeExe && existsSync(nodeExe) ? nodeExe : 'node',
      argsPrefix: [codexJsPath],
    };
  } catch {
    return null;
  }
}

function getInvocation() {
  if (process.platform === 'win32') {
    const windows = resolveWindowsInvocation();
    if (windows) {
      return windows;
    }
  }
  return { command: 'codex', argsPrefix: [] as string[] };
}

export async function assertCodexExecReady(): Promise<boolean> {
  if (readyCache) {
    return readyCache;
  }

  readyCache = new Promise<boolean>((resolve, reject) => {
    const invocation = getInvocation();
    const child = spawn(invocation.command, [...invocation.argsPrefix, '--version'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-2000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
        return;
      }
      reject(new Error(stderr || 'codex command is unavailable'));
    });
  }).catch((error) => {
    readyCache = null;
    throw error;
  });

  return readyCache ?? Promise.resolve(false);
}

export async function generateWithCodexExec(options: RuntimeGenerateOptions): Promise<RuntimeGenerateResult> {
  await assertCodexExecReady();
  if (activeRuns >= appConfig.codexExecMaxRuns) {
    throw new Error('codex-exec is busy. Retry in a few seconds.');
  }

  activeRuns += 1;
  const tmpFile = path.join(os.tmpdir(), `${createId('talkapp_codex')}.txt`);
  const invocation = getInvocation();
  const args = [
    ...invocation.argsPrefix,
    'exec',
    '-C',
    repoRoot,
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--color',
    'never',
    '--ephemeral',
    '--output-schema',
    codexChatSchemaPath,
    '-o',
    tmpFile,
    '-m',
    options.model || appConfig.defaultCodexModel,
  ];

  try {
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn(invocation.command, args, {
        cwd: repoRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`codex exec timed out after ${appConfig.codexExecTimeoutMs}ms`));
      }, appConfig.codexExecTimeoutMs);

      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${String(chunk)}`.slice(-4000);
      });

      child.on('error', reject);
      child.on('close', async (code) => {
        clearTimeout(timeout);
        try {
          const output = (await readFile(tmpFile, 'utf8')).trim();
          if (code !== 0) {
            reject(new Error(stderr || `codex exec failed with exit code ${code}`));
            return;
          }
          if (!output) {
            reject(new Error('codex exec returned no assistant text.'));
            return;
          }
          const parsed = JSON.parse(output) as { reply?: string };
          if (!parsed.reply || typeof parsed.reply !== 'string') {
            reject(new Error('codex exec returned invalid reply payload.'));
            return;
          }
          resolve(parsed.reply.trim());
        } catch {
          reject(new Error('Failed to read codex exec output.'));
        }
      });

      child.stdin.write(options.prompt, 'utf8');
      child.stdin.end();
    });

    return {
      text,
      provider: 'codex-exec',
      model: options.model || appConfig.defaultCodexModel,
      responseId: '',
      citations: [],
      warning: options.useWebSearch ? 'Live web search is not available under codex-exec.' : '',
    };
  } finally {
    activeRuns = Math.max(0, activeRuns - 1);
    await unlink(tmpFile).catch(() => {});
  }
}

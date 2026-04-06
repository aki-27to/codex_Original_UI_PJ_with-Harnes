import esbuild from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const frontendDir = path.join(repoRoot, 'app', 'frontend');
const distDir = path.join(frontendDir, 'dist');
const watch = process.argv.includes('--watch');

await mkdir(distDir, { recursive: true });
await copyFile(path.join(frontendDir, 'index.html'), path.join(distDir, 'index.html'));

const ctx = await esbuild.context({
  entryPoints: [path.join(frontendDir, 'main.tsx')],
  bundle: true,
  outfile: path.join(distDir, 'bundle.js'),
  format: 'esm',
  jsx: 'automatic',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  loader: {
    '.css': 'css',
  },
});

if (watch) {
  await ctx.watch();
  console.log('[buildFrontend] watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('[buildFrontend] built frontend bundle');
}

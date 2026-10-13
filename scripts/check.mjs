// Sanity checks for the extension package. Run locally or in CI: node scripts/check.mjs
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (msg) => errors.push(msg);
const exists = (p) => existsSync(join(root, p)) || fail(`missing file: ${p}`);

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) fail(`invalid version: ${manifest.version}`);
if (manifest.description.length > 132) fail(`description is ${manifest.description.length} chars; the store allows 132`);

// Every file the manifest points at must exist.
Object.values(manifest.icons ?? {}).forEach(exists);
Object.values(manifest.action?.default_icon ?? {}).forEach(exists);
exists(manifest.background.service_worker);
manifest.content_scripts.flatMap((c) => c.js).forEach(exists);

// Extension pages, and the scripts they load.
for (const page of ['offscreen.html', 'permission.html']) {
  exists(page);
  const html = readFileSync(join(root, page), 'utf8');
  for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) exists(src);
}

// Syntax-check our own scripts (vendor code is shipped as-is).
for (const file of ['background.js', 'content.js', 'offscreen.js', 'permission.js']) {
  try {
    execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'pipe' });
  } catch (err) {
    fail(`syntax error in ${file}:\n${err.stderr}`);
  }
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ Chess Voice ${manifest.version} looks good`);

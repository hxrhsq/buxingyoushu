const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const files = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const values = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap((line) => {
  const match = /^([A-Z_0-9]+)\s*=\s*(.*)$/.exec(line);
  if (!match || !/(_KEY|_CODE|_ID)$/.test(match[1])) return [];
  const value = match[2].trim().replace(/^['"]|['"]$/g, '');
  return value.length >= 12 ? [{ name: match[1], value }] : [];
});
const hits = [];
for (const file of files) {
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 1000).includes(0)) continue;
  const text = bytes.toString('utf8');
  const normalized = text.trimEnd() + '\n';
  if (normalized !== text) fs.writeFileSync(file, normalized);
  for (const secret of values) if (normalized.includes(secret.value)) hits.push({ file, variable: secret.name });
  if (/\bsk-(?:ws-)?[A-Za-z0-9]{20,}\b/.test(normalized)) hits.push({ file, pattern: 'api-key-literal' });
}
if (hits.length) { console.log(JSON.stringify({ secretsDetected: hits })); process.exit(1); }
execFileSync('git', ['add', '--', ...files]);
console.log(JSON.stringify({ reviewedFiles: files.length, configuredSecretValuesMatched: 0, runtimeArtifactsStaged: files.filter((f) => /^(?:\.env\.local|\.data\/|\.playwright-cli\/|output\/)/.test(f)) }));

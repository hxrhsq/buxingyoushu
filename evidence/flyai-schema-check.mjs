/**
 * 飞猪酒店返回结构探针（2026-11-22）。
 *
 * 目的：回答「酒店/门票的调用方式是什么，返回里到底有没有佣金字段与归因链接」。
 * 一次真实 search-hotel 调用（用户 key，1 次），输出**只打印脱敏后的结构与参数名**：
 *   - URL 保留 origin+path，query 只留参数名与值长度，不留可用 token；
 *   - 任何等于 FLYAI_API_KEY 的子串一律替换；
 *   - 原始 JSON 不落盘，只落盘这份脱敏结果。
 * 跑法：node evidence/flyai-schema-check.mjs [dest-name] [key-words]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), "..");
const FLAGS = process.argv.slice(2).filter((a) => a.startsWith("--"));
const POSITIONAL = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const IS_POI = FLAGS.includes("--poi");
const DEST = POSITIONAL[0] ?? "杭州";
const KEYWORDS = POSITIONAL[1] ?? "西湖";

function readKey() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return null;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^FLYAI_API_KEY=(.*)$/.exec(line.trim());
    if (m) return m[1].replace(/^["']|["']$/g, "").trim() || null;
  }
  return null;
}

function resolveEntry() {
  const roots = [
    path.join(ROOT, "node_modules"),
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "node_modules") : null,
  ].filter(Boolean);
  for (const root of roots) {
    const dir = path.join(root, "@fly-ai", "flyai-cli");
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.flyai;
    if (rel && fs.existsSync(path.resolve(dir, rel))) return path.resolve(dir, rel);
  }
  return null;
}

const apiKey = readKey();
const entry = resolveEntry();
if (!apiKey || !entry) {
  console.log(JSON.stringify({ ok: false, reason: !apiKey ? "没读到 FLYAI_API_KEY" : "找不到 flyai CLI 入口" }));
  process.exit(1);
}
const args = IS_POI
  ? ["search-poi", "--city-name", DEST, "--category", "文创街区"]
  : ["search-hotel", "--dest-name", DEST, "--key-words", KEYWORDS];
console.log(`调用：flyai ${args.join(" ")}（1 次真实调用，key 不外泄）`);
const inherited = ["PATH", "HOME", "USERPROFILE", "SystemRoot", "TEMP", "TMP", "COMSPEC", "LANG", "TZ"];
const env = {};
for (const name of inherited) if (process.env[name] !== undefined) env[name] = process.env[name];
env.FLYAI_API_KEY = apiKey;

const started = Date.now();
const child = spawn(process.execPath, [entry, ...args], { cwd: os.tmpdir(), windowsHide: true, env });
let stdout = "";
child.stdout.on("data", (c) => { stdout += c; });
child.stderr.on("data", () => { /* 混淆包会往 stderr 吐噪音，一律不打印 */ });
let settled = false;
child.on("close", () => report(stdout));
setTimeout(() => { child.kill("SIGKILL"); report(stdout); }, 60_000);

/** 递归脱敏：URL 只留参数名，疑似凭据的键值整体遮掉。 */
const SENSITIVE_KEY = /(key|token|secret|sign|auth|cookie|password|session|uid|userId|nick)/i;
function maskValue(value, keyName = "") {
  if (typeof value === "string") {
    if (value === apiKey) return "<API_KEY>";
    if (SENSITIVE_KEY.test(keyName)) return `‹masked len=${value.length}›`;
    if (/^https?:\/\//.test(value)) return maskUrl(value);
    if (value.length > 60) return `${value.slice(0, 40)}…(共${value.length}字)`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => maskValue(item, keyName));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = maskValue(v, k);
    return out;
  }
  return value;
}

function maskUrl(url) {
  try {
    const u = new URL(url);
    const params = [...u.searchParams.keys()];
    const shape = params.length
      ? `?${params.map((name) => `${name}=‹${String(u.searchParams.get(name).length)}位›`).join("&")}`
      : "";
    return `${u.origin}${u.pathname}${shape}`;
  } catch {
    return url.slice(0, 40);
  }
}

function report(raw) {
  if (settled) return;
  settled = true;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* 下面如实报 */ }
  if (!parsed) {
    console.log(`没有可解析的 JSON（stdout ${raw.length} 字节，耗时 ${Date.now() - started}ms）。原文前 300 字：`);
    console.log(raw.replace(new RegExp(apiKey, "g"), "<API_KEY>").slice(0, 300));
    process.exit(1);
  }
  const items = parsed?.data?.itemList ?? parsed?.itemList ?? null;
  const scan = JSON.stringify(parsed).replace(new RegExp(apiKey, "g"), "<API_KEY>");
  const hits = {};
  for (const word of ["commission", "cps", "alliance", "promot", "affiliate", "track", "click", "spm", "scm", "pid", "jumpUrl", "shareUrl", "inviteCode", "佣金", "推广", "归因", "分佣", "返利"]) {
    const count = (scan.match(new RegExp(word, "gi")) || []).length;
    if (count) hits[word] = count;
  }
  const sample = Array.isArray(items) && items.length ? maskValue(items[0]) : null;
  /** 佣金到底挂在哪些路径上（顶层？嵌套在 ticketInfo 里？）——按路径列出来，并给一条含佣金的完整脱敏样本 */
  const paths = [];
  const walk = (node, prefix) => {
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        const p = `${prefix}.${k}`;
        if (/commission|佣金/i.test(k)) paths.push({ path: p, value: maskValue(v, k) });
        walk(v, p);
      }
    } else if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${prefix}[${index}]`));
    }
  };
  walk(parsed, "$");
  const withCommission = Array.isArray(items) ? items.find((item) => JSON.stringify(item).includes("commission")) ?? null : null;
  const summary = {
    checkedAt: new Date().toISOString(),
    command: `flyai ${args.map((a) => `"${a}"`).join(" ")}`,
    paid: true,
    flyaiCalls: 1,
    durationMs: Date.now() - started,
    status: parsed.status ?? parsed.code ?? null,
    message: parsed.message ?? null,
    topKeys: Object.keys(parsed),
    dataKeys: parsed?.data ? Object.keys(parsed.data) : null,
    itemCount: Array.isArray(items) ? items.length : null,
    itemKeys: Array.isArray(items) && items.length ? Object.keys(items[0]) : null,
    commissionKeywordHits: hits,
    commissionPaths: paths,
    commissionSample: withCommission ? maskValue(withCommission) : null,
    redactedFirstItem: sample,
  };
  console.log(JSON.stringify(summary, null, 2));
  const outFile = IS_POI ? "flyai-poi-sample-redacted.json" : "flyai-hotel-sample-redacted.json";
  fs.writeFileSync(path.join(ROOT, "evidence", outFile), JSON.stringify(summary, null, 2));
  console.log(`\n脱敏结果已写入 evidence/${outFile}（原始 JSON 未落盘）`);
}

/**
 * 收尾探针：只查文案与遮挡，不产生任何付费调用（全程 0 次 POST）。
 * 跑法：`node evidence/phase8-copy-probe.mjs`（线上：`BASE_URL=https://你的域名 node …`）
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE = path.join(ROOT, "evidence");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

const CLI_CANDIDATES = [
  process.env.PLAYWRIGHT_CLI_PACKAGE,
  path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "@playwright", "cli", "package.json"),
  path.join(os.homedir(), ".npm-global", "lib", "node_modules", "@playwright", "cli", "package.json"),
  "/usr/local/lib/node_modules/@playwright/cli/package.json",
  "/usr/lib/node_modules/@playwright/cli/package.json",
].filter(Boolean);

function loadPlaywright() {
  for (const candidate of CLI_CANDIDATES) {
    try {
      return createRequire(candidate)("playwright");
    } catch {
      // 换下一个候选
    }
  }
  return createRequire(import.meta.url)("playwright");
}

const { chromium } = loadPlaywright();

const BROWSER_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROME,
  path.join(os.homedir(), "AppData", "Local", "ms-playwright", "chromium-1228", "chrome-win64", "chrome.exe"),
  path.join(os.homedir(), ".cache", "ms-playwright", "chromium-1228", "chrome-linux", "chrome"),
].filter(Boolean);
const EXEC = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${JSON.stringify(detail)}` : ""}`);
}

const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const context = await browser.newContext({ viewport: { ...DESKTOP } });
const page = await context.newPage();

const posts = [];
page.on("request", (request) => {
  if (request.method() === "POST") posts.push(new URL(request.url()).pathname);
});
const dialogs = [];
page.on("dialog", async (dialog) => {
  dialogs.push(dialog.message());
  await dialog.dismiss();
});

// ── 1. 桌面端：三处新文案是否真的在屏幕上 ─────────────────────────
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("main", { timeout: 60000 });
await page.waitForTimeout(3000);
const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, "");
const copyChecks = [
  ["手绘底图的提示不再说「左侧」", "尚未做高德核验，这里是手绘示意底图，不是真实地图"],
  ["「重新发现」的空态不再和已生成的路线打架", "这一步还没单独调用过飞猪"],
  ["核验成本按类别数量说清", "一次核验按勾选的类别数量真实请求高德约 36 次（单类）～62 次（双类）"],
];
for (const [name, needle] of copyChecks) {
  check(name, bodyText.includes(needle.replace(/\s+/g, "")));
}
check(
  "页面文本里不残留「左侧地图／上方行程」这类只在桌面成立的指向词",
  !/左侧地图|上方行程|上方「高德核验路线」|页面底部的开发调试面板|屏幕底部/.test(bodyText),
);

// ── 2. 手机端：滚到底，最后一段内容不能被钉住的按钮条压住 ──────────
await page.setViewportSize({ ...MOBILE });
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(800);
const clearance = await page.evaluate(() => {
  const bar = document.querySelector("div.fixed.inset-x-0");
  const col = bar?.parentElement;
  if (!bar || !col) return { error: "找不到钉住的主流程按钮条" };
  const rest = [...col.children].filter((node) => node !== bar);
  const last = rest[rest.length - 1]?.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  return {
    barTop: Math.round(barRect.top),
    barHeight: Math.round(barRect.height),
    lastLabel: rest[rest.length - 1]?.querySelector("h2")?.textContent?.trim() ?? null,
    lastBottom: last ? Math.round(last.bottom) : null,
    viewport: window.innerHeight,
  };
});
check(
  "滚到底后最后一段内容完整露在按钮条之上",
  !clearance.error && clearance.lastBottom !== null && clearance.lastBottom <= clearance.barTop,
  clearance,
);
await page.screenshot({ path: path.join(EVIDENCE, "phase8-08-mobile-bottom-clearance.png") });

// ── 3. 全程没有付费调用、没有弹窗 ─────────────────────────────────
check("探针没有发出任何 POST（0 次核验、0 个百炼回合）", posts.length === 0, { posts });
check("高德 SDK 仍然没有弹窗", dialogs.length === 0, { dialogs });

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} 通过${failed.length ? `；未通过：${failed.map((f) => f.name).join("、")}` : ""}`,
);
await browser.close();
process.exit(failed.length ? 1 : 0);

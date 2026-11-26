/**
 * 选择器 mockup 的可点走查（2026-11-21）。
 *
 * 只验证 docs/mockups/city-start-picker.html 自己的交互：城市切换、两种目标切换、
 * 冷跑成本提示、无脚本报错。零网络、零付费。
 * 跑法：node evidence/mockup-city-picker-check.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = pathToFileURL(path.join(ROOT, "docs", "mockups", "city-start-picker.html")).href;

const CLI = [
  process.env.PLAYWRIGHT_CLI_PACKAGE,
  path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "@playwright", "cli", "package.json"),
].filter(Boolean);
function loadPlaywright() {
  for (const c of CLI) { try { return createRequire(c)("playwright"); } catch { /* next */ } }
  return createRequire(import.meta.url)("playwright");
}
const { chromium } = loadPlaywright();

let pass = 0, fail = 0;
const rows = [];
function check(name, ok, detail) {
  if (ok) pass += 1; else fail += 1;
  rows.push({ name, ok, detail: detail ?? null });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
}

const BROWSER_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROME,
  path.join(os.homedir(), "AppData", "Local", "ms-playwright", "chromium-1228", "chrome-win64", "chrome.exe"),
  path.join(os.homedir(), ".cache", "ms-playwright", "chromium-1228", "chrome-linux", "chrome"),
].filter(Boolean);
const EXEC = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));

// 可见浏览器：本机只装了完整 chromium（无 headless-shell），项目验收也一律在可见视口里做
const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(FILE);
await page.waitForTimeout(300);

const ctx = () => page.locator("#ctxMain").innerText();
const result = () => page.locator("#result").innerText();

check("默认上下文是青岛", (await ctx()).includes("青岛") && (await ctx()).includes("劈柴院"), await ctx());
check("默认路线是 4 站且含真实站名", (await result()).includes("4 站") && (await result()).includes("银鱼巷"));

await page.locator("#ctxBtn").click();
check("点「修改」弹出单问题弹层", (await page.locator("#sheet").isVisible()) && (await page.locator(".xk-sheet__q").innerText()).includes("今天去哪个城市"));
check("三颗城市胶囊都在", (await page.locator("[data-city]").count()) === 3, `count=${await page.locator("[data-city]").count()}`);

await page.locator('[data-city="苏州"]').click();
check("切到苏州后起点只读显示平江路", (await page.locator("#rowStart").innerText()).includes("平江路"));
check("苏州默认路线 3 站且含十全街", (await result()).includes("3 站") && (await result()).includes("十全街"));

await page.locator("#modeWalk").click();
check("苏州少走路版 2 站且含观前街", (await result()).includes("2 站") && (await result()).includes("观前街"));
check("苏州上限不可行写的是「排不出」", (await result()).includes("排不出"));

await page.locator('[data-city="杭州"]').click();
check("切到杭州路线含大兜路", (await result()).includes("大兜路历史文化街区"));
check("杭州少走路版回到默认口径（切城重置）", (await result()).includes("3 站"));

await page.locator("#cacheCold").click();
const cold = await page.locator("#costLine").innerText();
check("冷跑提示写清次数与免费额度", cold.includes("36 次") && cold.includes("免费额度"), cold.replace(/\s+/g, " ").slice(0, 90));

await page.locator("#okBtn").click();
check("确认后弹层收起", !(await page.locator("#sheet").isVisible()));
await page.screenshot({ path: path.join(ROOT, "evidence", "mockup-city-picker.png"), fullPage: true });

check("全程没有脚本报错", errors.length === 0, errors.join(" / "));
await browser.close();
console.log(`\n${pass}/${pass + fail} mockup 走查通过${fail ? `（${fail} 项失败）` : ""}`);

// 存档：交接文档引用过「13/13」和截图字节数，没有 JSON 就等于没证据（2026-11-22 只读审计指出）
const shotPath = path.join(ROOT, "evidence", "mockup-city-picker.png");
const summary = {
  checkedAt: new Date().toISOString(),
  paid: false,
  network: "零网络：只加载本地 file:// 原型，不发任何请求",
  script: "mockup-city-picker-check.mjs",
  mockupFile: "docs/mockups/city-start-picker.html",
  total: pass + fail,
  passed: pass,
  checks: rows,
  pageErrors: errors,
  screenshot: fs.existsSync(shotPath) ? { file: "evidence/mockup-city-picker.png", bytes: fs.statSync(shotPath).size } : null,
  knownLimits: "只验证原型自己的交互与文案；卡上的路线数字来自 objective-compare-*.json，原型本身不代表已实现进前端",
};
fs.writeFileSync(new URL("./mockup-city-picker-check.json", import.meta.url), JSON.stringify(summary, null, 2));
console.log("结果已写入 evidence/mockup-city-picker-check.json");
process.exit(fail ? 1 : 0);

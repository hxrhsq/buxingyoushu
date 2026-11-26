/**
 * 分段提示卡端到端走查：扬州生成路线 → 展开「分段怎么走」→ 校验内容并截图。
 * 会真实调用：扬州核验一次（若服务端无缓存）。跑法：node evidence/route-steps-check.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
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
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${String(detail).slice(0, 140)}` : ""}`);
}

const EXEC = [
  process.env.PLAYWRIGHT_CHROME,
  path.join(os.homedir(), "AppData", "Local", "ms-playwright", "chromium-1228", "chrome-win64", "chrome.exe"),
].filter(Boolean).find((p) => fs.existsSync(p));

const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('div[role="group"][aria-label="选择城市"] button', { hasText: "扬州" }).click();
  await page.getByRole("button", { name: "按这个条件生成路线" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("分段怎么走"), null, { timeout: 240000 });

  const summaries = page.locator("summary", { hasText: "分段怎么走" });
  const count = await summaries.count();
  check("路线里出现分段提示入口", count > 0, `count=${count}`);

  await summaries.first().click();
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => document.body.innerText);
  check("展开后出现真实分段指示", /沿.+步行|向南步行|向北步行|右转|左转/.test(text));
  check("分段里带分钟数", /（约 \d+ 分钟）/.test(text));
  check("分段指示不是只有一条", (text.match(/步行\d+米/g) ?? []).length >= 2, (text.match(/步行\d+米/g) ?? []).join(" / "));
  check("没有编造「轮椅可通行」", !text.includes("轮椅可通行"));

  await page.screenshot({ path: path.join(ROOT, "evidence", "route-steps.png"), fullPage: true });
  check("全程没有脚本报错", errors.length === 0, errors.join(" / "));
} catch (caught) {
  check("流程执行到底", false, String(caught).slice(0, 300));
  try { console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500)); } catch { /* 页面可能已关闭 */ }
} finally {
  await browser.close();
}

console.log(`\n${pass}/${pass + fail} 分段提示走查通过${fail ? `（${fail} 项失败）` : ""}`);
fs.writeFileSync(new URL("./route-steps-check.json", import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  baseUrl: BASE,
  script: "route-steps-check.mjs",
  total: pass + fail,
  passed: pass,
  checks: rows,
  pageErrors: errors,
}, null, 2));
console.log("结果已写入 evidence/route-steps-check.json");
process.exit(fail ? 1 : 0);
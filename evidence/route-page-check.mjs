/**
 * 路线页回归（2026-11-22）：返回首页按钮 + AI 讲解小字清理。
 *
 * 会真实调用：济南核验一次（高德）+「我到了」讲解一次（百炼）。用户已放宽额度。
 * 跑法：npm run build && npm run start，然后 node evidence/route-page-check.mjs
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
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${String(detail).slice(0, 120)}` : ""}`);
}

const BROWSER_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROME,
  path.join(os.homedir(), "AppData", "Local", "ms-playwright", "chromium-1228", "chrome-win64", "chrome.exe"),
  path.join(os.homedir(), ".cache", "ms-playwright", "chromium-1228", "chrome-linux", "chrome"),
].filter(Boolean);
const EXEC = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));

const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const bodyText = () => page.evaluate(() => document.body.innerText);
const homeLink = page.getByRole("link", { name: "返回首页" });

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("首屏就有「返回首页」", (await homeLink.count()) === 1);

  await page.getByRole("button", { name: "按这个条件生成路线" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("我到了"), null, { timeout: 240000 });
  check("生成路线后出现「我到了」", true);
  check("路线页也有「返回首页」", (await homeLink.count()) === 1);

  await page.getByRole("button", { name: "我到了" }).first().click();
  await page.waitForFunction(
    () => /走到这里时|下一步|针对「/.test(document.body.innerText),
    null,
    { timeout: 180000 },
  );
  const text = await bodyText();
  check("讲解卡片不再显示「数字对账」", !text.includes("数字对账"));
  check("不再显示「内容不是飞猪或高德的原始数据」", !text.includes("内容不是飞猪或高德的原始数据"));
  check("不再显示「不是手机 GPS 定位」", !text.includes("不是手机 GPS 定位"));
  check("仍保留「百炼 · 千问」徽标", text.includes("百炼 · 千问"));
  await page.screenshot({ path: path.join(ROOT, "evidence", "route-page.png"), fullPage: true });

  await homeLink.click();
  await page.waitForFunction(() => document.body.innerText.includes("按这个条件生成路线"), null, { timeout: 15000 });
  const homeText = await bodyText();
  check("点「返回首页」回到首屏", homeText.includes("按这个条件生成路线"));
  check("首屏不再残留「我到了」", !homeText.includes("我到了"));
  check("首屏城市三选一重新出现", homeText.includes("选择城市") || (await page.locator('div[role="group"][aria-label="选择城市"] button').count()) === 3);
  await page.screenshot({ path: path.join(ROOT, "evidence", "home-after-return.png"), fullPage: true });
  check("全程没有脚本报错", errors.length === 0, errors.join(" / "));
} catch (caught) {
  check("流程执行到底", false, String(caught).slice(0, 300));
  try { console.log((await bodyText()).slice(0, 1200)); } catch { /* 页面可能已关闭 */ }
} finally {
  await browser.close();
}

console.log(`\n${pass}/${pass + fail} 路线页回归通过${fail ? `（${fail} 项失败）` : ""}`);
fs.writeFileSync(new URL("./route-page-check.json", import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  baseUrl: BASE,
  paid: "济南核验一次 + 百炼讲解一次（真实调用）",
  script: "route-page-check.mjs",
  total: pass + fail,
  passed: pass,
  checks: rows,
  pageErrors: errors,
}, null, 2));
console.log("结果已写入 evidence/route-page-check.json");
process.exit(fail ? 1 : 0);
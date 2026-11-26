/**
 * 「必去 / 不去」地点条件端到端走查。
 * 会真实调用：百炼读句每场景 1 次 + 济南核验（首场景冷跑，之后命中缓存）。
 * 跑法：node evidence/place-conditions-check.mjs
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

async function runScenario({ text, button, expectPresent, expectAbsent, expectNote, shot }) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByLabel("说说爸妈的情况").fill(text);
  await page.getByRole("button", { name: "读一下" }).click();
  await page.waitForSelector('[data-testid="place-conditions"]', { timeout: 30000 });
  await page.locator('[data-testid="place-conditions"] button', { hasText: button }).first().click();
  await page.getByRole("button", { name: "按这个条件生成路线" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("我到了"), null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  const body = await page.evaluate(() => document.body.innerText);
  if (expectPresent) check(`路线包含「${expectPresent}」`, body.includes(expectPresent));
  if (expectAbsent) check(`路线不包含「${expectAbsent}」`, !body.includes(expectAbsent));
  if (expectNote) check("找不到的地点有明确提示", body.includes("没找到或没通过核验"), expectNote);
  if (shot) await page.screenshot({ path: path.join(ROOT, "evidence", shot), fullPage: true });
}

try {
  await runScenario({
    text: "我妈膝盖不好，想去后宰门街",
    button: "必去",
    expectPresent: "后宰门街",
    shot: "place-must-visit.png",
  });
  await runScenario({
    text: "我妈膝盖不好，不想去芙蓉街",
    button: "不去",
    expectAbsent: "芙蓉街",
    shot: "place-never-accept.png",
  });
  await runScenario({
    text: "我妈膝盖不好，想去河坊街",
    button: "必去",
    expectNote: "河坊街",
  });
  check("全程没有脚本报错", errors.length === 0, errors.join(" / "));
} catch (caught) {
  check("流程执行到底", false, String(caught).slice(0, 300));
  try { console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500)); } catch { /* 页面可能已关闭 */ }
} finally {
  await browser.close();
}

console.log(`\n${pass}/${pass + fail} 地点条件走查通过${fail ? `（${fail} 项失败）` : ""}`);
fs.writeFileSync(new URL("./place-conditions-check.json", import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  baseUrl: BASE,
  script: "place-conditions-check.mjs",
  total: pass + fail,
  passed: pass,
  checks: rows,
  pageErrors: errors,
}, null, 2));
console.log("结果已写入 evidence/place-conditions-check.json");
process.exit(fail ? 1 : 0);
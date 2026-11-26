/**
 * 住一晚卡片的端到端走查（2026-11-22）。
 * 会真实调用：济南核验一次（若服务端无缓存）+ 酒店查询（命中缓存则 0 新增）。
 * 跑法：npm run build && npm run start，然后 node evidence/hotel-card-check.mjs
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
  await page.getByRole("button", { name: "按这个条件生成路线" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("住一晚"), null, { timeout: 240000 });
  await page.waitForFunction(() => /飞猪详情|没查到第一站附近/.test(document.body.innerText), null, { timeout: 60000 });
  const text = await page.evaluate(() => document.body.innerText);

  check("路线页出现「住一晚」", text.includes("住一晚"));
  check("展示按步行排序的说明", text.includes("步行排序"));
  check("出现酒店与步行分钟", /到第一站步行 \d+ 分钟/.test(text), (text.match(/到第一站步行 \d+ 分钟 · \d+ 米/g) ?? []).join(" / "));
  check("有「飞猪详情」入口", text.includes("飞猪详情"));
  check("标注「含推广链接」", text.includes("含推广链接"));
  check("不显示佣金金额字段", !text.includes("commissionMoneyYuan") && !text.includes("佣金 4") && !text.includes("佣金："));
  const sponsored = await page.locator('a[rel*="sponsored"]').count();
  check("酒店外链带 sponsored 归因标识", sponsored > 0, `count=${sponsored}`);
  await page.screenshot({ path: path.join(ROOT, "evidence", "hotel-card.png"), fullPage: true });
  check("全程没有脚本报错", errors.length === 0, errors.join(" / "));
} catch (caught) {
  check("流程执行到底", false, String(caught).slice(0, 300));
  try { console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1200)); } catch { /* 页面可能已关闭 */ }
} finally {
  await browser.close();
}

console.log(`\n${pass}/${pass + fail} 住一晚卡片走查通过${fail ? `（${fail} 项失败）` : ""}`);
fs.writeFileSync(new URL("./hotel-card-check.json", import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  baseUrl: BASE,
  script: "hotel-card-check.mjs",
  total: pass + fail,
  passed: pass,
  checks: rows,
  pageErrors: errors,
}, null, 2));
console.log("结果已写入 evidence/hotel-card-check.json");
process.exit(fail ? 1 : 0);
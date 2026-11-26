/**
 * 首页三城切换的真实浏览器走查（2026-11-22）。
 *
 * 只点城市按钮，不点「生成我的路线」：全程零高德、零飞猪、零百炼调用。
 * 验证 HOME_CITIES = 济南/南京/扬州，默认济南，切换后首屏片区名跟着变。
 * 跑法：npm run build && npm run start，然后 node evidence/home-city-switch-check.mjs
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
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
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

const group = page.locator('div[role="group"][aria-label="选择城市"]');
const cityButton = (name) => group.locator("button", { hasText: name });
const headline = () => page.locator("h2").first().innerText();
async function waitDistrict(district) {
  await page.waitForFunction((d) => document.querySelector("h2")?.textContent?.includes(d), district, { timeout: 5000 });
}

await page.goto(BASE, { waitUntil: "networkidle" });
await waitDistrict("历下古城");

check("默认城市是济南且片区为历下古城", (await headline()).includes("历下古城"), await headline());
check("首屏三个城市按钮都在", (await group.locator("button").count()) === 3, `count=${await group.locator("button").count()}`);
check("济南按钮默认选中", (await cityButton("济南").getAttribute("aria-pressed")) === "true");

await cityButton("南京").click();
await waitDistrict("秦淮老城南");
check("切到南京后片区为秦淮老城南", (await headline()).includes("秦淮老城南"), await headline());
check("南京按钮选中、济南取消", (await cityButton("南京").getAttribute("aria-pressed")) === "true"
  && (await cityButton("济南").getAttribute("aria-pressed")) === "false");

await cityButton("扬州").click();
await waitDistrict("广陵古城");
check("切到扬州后片区为广陵古城", (await headline()).includes("广陵古城"), await headline());

await cityButton("济南").click();
await waitDistrict("历下古城");
check("切回济南后片区恢复历下古城", (await headline()).includes("历下古城"), await headline());

await page.screenshot({ path: path.join(ROOT, "evidence", "home-city-switch.png"), fullPage: true });
check("全程没有脚本报错", errors.length === 0, errors.join(" / "));
await browser.close();

console.log(`\n${pass}/${pass + fail} 首页三城切换走查通过${fail ? `（${fail} 项失败）` : ""}`);
const shotPath = path.join(ROOT, "evidence", "home-city-switch.png");
fs.writeFileSync(new URL("./home-city-switch-check.json", import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  baseUrl: BASE,
  paid: false,
  network: "只加载首页与静态资源；没有触发核验/发现/智能体",
  script: "home-city-switch-check.mjs",
  total: pass + fail,
  passed: pass,
  checks: rows,
  pageErrors: errors,
  screenshot: fs.existsSync(shotPath) ? { file: "evidence/home-city-switch.png", bytes: fs.statSync(shotPath).size } : null,
}, null, 2));
console.log("结果已写入 evidence/home-city-switch-check.json");
process.exit(fail ? 1 : 0);
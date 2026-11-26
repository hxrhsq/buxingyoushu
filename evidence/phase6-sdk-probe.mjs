/**
 * 高德 SDK 可用性探针：不拦截任何请求，只看真实网络下 SDK 能不能加载，
 * 以及加载不成功时界面有没有明确退回演示模式。
 */
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("C:/Users/huangsh/AppData/Roaming/npm/node_modules/@playwright/cli/package.json");
const { chromium } = require("playwright");
const EXEC = "C:/Users/huangsh/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const EVIDENCE = "C:/Users/huangsh/Documents/Qoder/2026-10-18/1b7b268e/evidence";

const fails = [];
const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("requestfailed", (r) => fails.push(`FAILED ${r.url().slice(0, 110)} :: ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.status() >= 400) fails.push(`HTTP ${r.status()} ${r.url().slice(0, 110)}`);
});
page.on("console", (m) => {
  if (m.type() === "error") fails.push(`console ${m.text().slice(0, 160)}`);
});

await page.goto(`${process.env.BASE_URL ?? "http://127.0.0.1:3000"}/`, { waitUntil: "domcontentloaded" });
console.log(
  "map-config:",
  (await page.evaluate(() => fetch("/api/map-config").then((r) => r.text()))).replace(/"jsKey":"[^"]*"/, '"jsKey":"‹已隐藏›"'),
);
await page.click("text=开始核验（真实调用高德）");
await page.waitForSelector("text=在地图定位", { timeout: 180000 });
await page.waitForTimeout(20000);

const state = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    containers: document.querySelectorAll(".amap-container").length,
    canvases: document.querySelectorAll(".amap-container canvas").length,
    scripts: Array.from(document.querySelectorAll("script")).map((s) => s.src).filter((s) => s.includes("amap")).map((s) => s.replace(/key=[^&]+/, "key=‹已隐藏›")),
    badge: text.includes("演示模式") ? text.split("\n").filter((l) => l.includes("演示模式") || l.includes("加载失败")).slice(0, 4) : null,
    footer: text.split("\n").filter((l) => l.includes("底图：")).slice(0, 2),
  };
});
console.log(JSON.stringify(state, null, 1));
console.log("异常记录:", fails.slice(0, 12).join("\n") || "无");
await page.screenshot({ path: path.join(EVIDENCE, "phase6-14-sdk-availability.png") });
await browser.close();

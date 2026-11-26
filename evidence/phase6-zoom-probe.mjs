/**
 * 缩放专项探针：高德 2.0 到底怎么响应滚轮 / 双击 / 工具栏按钮。
 * 只在独立 Chromium 里跑，不碰用户自己的标签页。
 */
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("C:/Users/huangsh/AppData/Roaming/npm/node_modules/@playwright/cli/package.json");
const { chromium } = require("playwright");
const EVIDENCE = "C:/Users/huangsh/Documents/Qoder/2026-10-18/1b7b268e/evidence";
const EXEC = "C:/Users/huangsh/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe";

const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${process.env.BASE_URL ?? "http://127.0.0.1:3000"}/`, { waitUntil: "domcontentloaded" });
await page.click("text=开始核验（真实调用高德）");
await page.waitForSelector("text=在地图定位", { timeout: 180000 });
await page.waitForSelector(".amap-container canvas", { timeout: 30000 });
await page.waitForTimeout(2000);

const zoom = () => page.evaluate(() => document.querySelector(".amap-container").amap.getZoom());
const status = await page.evaluate(() => {
  const m = document.querySelector(".amap-container").amap;
  const s = m.getStatus ? m.getStatus() : null;
  return { statusKeys: s ? Object.keys(s) : [], status: s, opts: m.getOptions ? Object.keys(m.getOptions()) : [] };
});
console.log("map status:", JSON.stringify(status.status), "option keys:", status.opts.join(","));

let z0 = await zoom();
await page.mouse.move(500, 420);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(800);
console.log(`plain wheel: ${z0} -> ${await zoom()}`);

z0 = await zoom();
await page.keyboard.down("Control");
await page.mouse.move(500, 420);
await page.mouse.wheel(0, -400);
await page.keyboard.up("Control");
await page.waitForTimeout(800);
console.log(`ctrl+wheel: ${z0} -> ${await zoom()}`);

z0 = await zoom();
await page.dblclick(".amap-container canvas", { position: { x: 200, y: 200 } });
await page.waitForTimeout(800);
console.log(`dblclick: ${z0} -> ${await zoom()}`);

for (const sel of [".amap-toolbar-zoom-in", ".amap-plus", "[class*='zoom-in']"]) {
  const n = await page.locator(sel).count();
  if (!n) continue;
  z0 = await zoom();
  await page.locator(sel).first().click();
  await page.waitForTimeout(700);
  console.log(`toolbar ${sel} (${n}): ${z0} -> ${await zoom()}`);
  break;
}

z0 = await zoom();
await page.evaluate(() => document.querySelector(".amap-container").amap.zoomIn());
await page.waitForTimeout(700);
console.log(`api zoomIn: ${z0} -> ${await zoom()}`);

await page.screenshot({ path: path.join(EVIDENCE, "phase6-11-zoom-probe.png") });
await browser.close();

/**
 * 滚轮缩放专项：验证「滚轮落在标记 HTML 上时高德不缩放，落在底图空白处才缩放」这个解释。
 */
import { createRequire } from "node:module";

const require = createRequire("C:/Users/huangsh/AppData/Roaming/npm/node_modules/@playwright/cli/package.json");
const { chromium } = require("playwright");
const EXEC = "C:/Users/huangsh/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe";

const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${process.env.BASE_URL ?? "http://127.0.0.1:3000"}/`, { waitUntil: "domcontentloaded" });
await page.click("text=开始核验（真实调用高德）");
await page.waitForSelector("text=在地图定位", { timeout: 180000 });
await page.waitForSelector(".amap-container canvas", { timeout: 30000 });
await page.waitForTimeout(2000);

const zoom = () => page.evaluate(() => document.querySelector(".amap-container").amap.getZoom());
const box = await page.locator(".amap-container").boundingBox();
const target = await page.locator('.amap-container [aria-label^="1 "]').boundingBox();

for (const [label, x, y] of [
  ["标记 HTML 正中", target.x + target.width / 2, target.y + 11],
  ["底图空白处", box.x + 120, box.y + box.height - 120],
]) {
  const z0 = await zoom();
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(900);
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className || "(无 class)", { x: Math.round(x), y: Math.round(y) });
  console.log(`${label}: ${z0} -> ${await zoom()}  (elementFromPoint class="${hit}")`);
}
await browser.close();

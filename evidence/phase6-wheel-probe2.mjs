/**
 * 滚轮缩放到底是被高德忽略，还是被自动化驱动忽略：
 * 同一张真实地图上比较「CDP 合成滚轮」「多次小步滚轮」「页面自己 dispatch 的 WheelEvent」，
 * 并读取 map.getStatus().scrollWheel 作为配置侧证据。
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
await page.waitForTimeout(2500);

const zoom = () => page.evaluate(() => document.querySelector(".amap-container").amap.getZoom());
const canvas = await page.locator(".amap-container canvas").boundingBox();
const cx = canvas.x + canvas.width / 2;
const cy = canvas.y + canvas.height / 2;

console.log(
  "scrollWheel 配置:",
  JSON.stringify(
    await page.evaluate(() => {
      const s = document.querySelector(".amap-container").amap.getStatus();
      return { scrollWheel: s.scrollWheel, zoomEnable: s.zoomEnable, gestureCursor: s.gestureCursor };
    }),
  ),
);

for (const [label, deltaY, steps] of [
  ["单次 -300", -300, 1],
  ["连续 4 次 -120", -120, 4],
  ["大幅 -1000", -1000, 1],
]) {
  const z0 = await zoom();
  await page.mouse.move(cx, cy);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(600);
  console.log(`CDP 合成滚轮 ${label}: ${z0} -> ${await zoom()}`);
}

const z1 = await zoom();
const dispatched = await page.evaluate(
  ({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, bubbles: true, cancelable: true, clientX: x, clientY: y }));
    return el.className;
  },
  { x: Math.round(cx), y: Math.round(cy) },
);
await page.waitForTimeout(900);
console.log(`页面 dispatch WheelEvent（打在 ${dispatched} 上）: ${z1} -> ${await zoom()}`);

await browser.close();

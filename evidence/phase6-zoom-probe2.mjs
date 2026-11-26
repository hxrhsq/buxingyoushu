/**
 * 缩放输入源探针：滚轮事件到底有没有到达页面？工具栏按钮的真实 class 是什么？
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
await page.waitForTimeout(1500);

await page.evaluate(() => {
  window.__wheel = [];
  document.addEventListener("wheel", (e) => window.__wheel.push({ y: Math.round(e.clientY), dy: e.deltaY, ctrl: e.ctrlKey, target: e.target.className }), true);
});
const zoom = () => page.evaluate(() => document.querySelector(".amap-container").amap.getZoom());
const box = await page.locator(".amap-container").boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

await page.mouse.move(cx, cy);
let z0 = await zoom();
await page.mouse.wheel(0, -240);
await page.waitForTimeout(1000);
console.log(`wheel@map-center ${z0} -> ${await zoom()}`, await page.evaluate(() => window.__wheel));

await page.evaluate(() => (window.__wheel = []));
z0 = await zoom();
await page.mouse.click(cx, cy);
await page.keyboard.press("=");
await page.waitForTimeout(600);
await page.keyboard.press("+");
await page.waitForTimeout(900);
console.log(`keyboard + after click ${z0} -> ${await zoom()}`, await page.evaluate(() => window.__wheel));

z0 = await zoom();
const toolbar = await page.evaluate(() => {
  const el = document.querySelector("[class*='toolbar']");
  return el ? { cls: el.className, html: el.outerHTML.slice(0, 400) } : null;
});
console.log("toolbar:", JSON.stringify(toolbar));
if (toolbar) {
  await page.locator(`.${String(toolbar.cls).split(" ")[0]} >> nth=0`).first().click({ position: { x: 8, y: 8 } }).catch((e) => console.log("toolbar click failed:", e.message.slice(0, 80)));
  await page.waitForTimeout(900);
  console.log(`toolbar click ${z0} -> ${await zoom()}`);
}

await browser.close();

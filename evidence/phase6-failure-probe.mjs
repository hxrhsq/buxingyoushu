/**
 * 异常路径验收：高德 SDK 加载失败时，界面必须退回「明确标注的演示模式」，
 * 且不得显示任何伪造的真实路线。用请求拦截模拟 CDN 不可达，人肉点击是复现不出来的。
 */
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("C:/Users/huangsh/AppData/Roaming/npm/node_modules/@playwright/cli/package.json");
const { chromium } = require("playwright");
const EVIDENCE = "C:/Users/huangsh/Documents/Qoder/2026-10-18/1b7b268e/evidence";
const EXEC = "C:/Users/huangsh/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe";

const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.route("**/maps**", (route) => route.abort("failed"));
await context.route("**/webapi.amap.com/**", (route) => route.abort("failed"));
const page = await context.newPage();

await page.goto(`${process.env.BASE_URL ?? "http://127.0.0.1:3000"}/`, { waitUntil: "domcontentloaded" });
await page.click("text=开始核验（真实调用高德）");
await page.waitForSelector("text=在地图定位", { timeout: 180000 });
await page.waitForTimeout(6000);

const text = await page.evaluate(() => document.body.innerText);
const shot = await page.screenshot({ path: path.join(EVIDENCE, "phase6-12-sdk-failure-fallback.png") });
console.log(JSON.stringify({
  hasRealMap: await page.locator(".amap-container").count(),
  mentionsLoadFailure: text.includes("加载失败"),
  mentionsDemoMode: text.includes("演示") || text.includes("手绘示意"),
  mentionsNoFakeRoute: text.includes("不显示伪造") || text.includes("不是真实地图") || text.includes("手绘示意"),
  shotFile: "phase6-12-sdk-failure-fallback.png",
  size: [shot.length],
}));
console.log("--- 地图区域文案 ---");
console.log(text.split("\n").filter((l) => l.includes("地图") || l.includes("示意") || l.includes("失败")).slice(0, 12).join("\n"));

await browser.close();

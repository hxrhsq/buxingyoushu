/**
 * 住宿卡图片诊断：接口 mainPic → 图片可达性 → 浏览器里 <img> 的加载状态。
 * 会真实调用：济南核验（若服务端无缓存）+ 酒店查询（命中缓存则 0 新增）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const post = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
};

const verify = await post("http://127.0.0.1:3000/api/verify", { cityName: "济南", categories: ["文创街区"] });
const first = verify.report.itinerary.stops[0];
const hotels = await post("http://127.0.0.1:3000/api/hotels", {
  cityName: "济南",
  stopName: first.name,
  stopPosition: first.position,
});
console.log("酒店 cost", JSON.stringify(hotels.cost));
for (const hotel of hotels.hotels ?? []) {
  console.log("-", hotel.name, "| mainPic:", hotel.mainPic ? `${hotel.mainPic.slice(0, 90)}…` : "null");
}
const url = hotels.hotels?.find((h) => h.mainPic)?.mainPic;
if (url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    console.log("图片直连 HTTP", response.status, "| content-type", response.headers.get("content-type"));
  } catch (caught) {
    console.log("图片直连失败：", caught.message);
  }
}

const CLI = [
  process.env.PLAYWRIGHT_CLI_PACKAGE,
  path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "@playwright", "cli", "package.json"),
].filter(Boolean);
function loadPlaywright() {
  for (const c of CLI) { try { return createRequire(c)("playwright"); } catch { /* next */ } }
  return createRequire(import.meta.url)("playwright");
}
const { chromium } = loadPlaywright();
const EXEC = [
  process.env.PLAYWRIGHT_CHROME,
  path.join(os.homedir(), "AppData", "Local", "ms-playwright", "chromium-1228", "chrome-win64", "chrome.exe"),
].filter(Boolean).find((p) => fs.existsSync(p));

const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => sessionStorage.clear());
await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "按这个条件生成路线" }).click();
await page.waitForFunction(() => document.body.innerText.includes("住一晚"), null, { timeout: 240000 });
await page.waitForTimeout(3000);

const images = await page.locator('section[aria-label="住一晚"] img').evaluateAll((nodes) =>
  nodes.map((node) => ({
    src: node.getAttribute("src")?.slice(0, 90),
    display: getComputedStyle(node).display,
    complete: node.complete,
    naturalWidth: node.naturalWidth,
    naturalHeight: node.naturalHeight,
  })),
);
console.log("\n浏览器里的酒店图片：", JSON.stringify(images, null, 1));
await page.screenshot({ path: "evidence/hotel-image-check.png", fullPage: true });
await browser.close();
console.log("截图已保存 evidence/hotel-image-check.png");
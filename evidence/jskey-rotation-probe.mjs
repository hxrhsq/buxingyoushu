/**
 * 轮换后验证探针：零点击、零 POST、零高德 Web 服务调用。
 * 只加载首页，看 JS SDK 能不能真的画出底图；任何一次点击「生成我的路线」都不存在。
 * 跑法：node evidence/jskey-rotation-probe.mjs
 */
import { createRequire } from "node:module";

const require = createRequire("C:/Users/huangsh/AppData/Roaming/npm/node_modules/@playwright/cli/package.json");
const { chromium } = require("playwright");
const EXEC = "C:/Users/huangsh/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe";

const bad = [];
const tileOk = [];
const tileBad = [];
const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

page.on("requestfailed", (r) => bad.push(`FAILED ${r.url().slice(0, 100)} :: ${r.failure()?.errorText}`));
page.on("response", (r) => {
  const url = r.url();
  if (/autonavi|amap/.test(url) && /\/tile|\/vtile|style|jsapi/i.test(url)) {
    (r.status() < 400 ? tileOk : tileBad).push(`${r.status()} ${url.slice(0, 90)}`);
  }
  if (r.status() >= 400) bad.push(`HTTP ${r.status()} ${url.slice(0, 100)}`);
});
page.on("console", (m) => {
  if (m.type() === "error") bad.push(`console ${m.text().slice(0, 200)}`);
});
// 任何 POST 都意味着我们不小心花钱了，直接记下来
page.on("request", (r) => {
  if (r.method() !== "GET") bad.push(`非 GET 请求 ${r.method()} ${r.url().slice(0, 90)}`);
});

await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
const config = await page.evaluate(() =>
  fetch("/api/map-config").then((r) => r.text()).then((t) => t.replace(/"jsKey":"[^"]*"/, '"jsKey":"‹已隐藏›"')),
);
console.log("map-config:", config);

await page.waitForTimeout(12000);

const state = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    containers: document.querySelectorAll(".amap-container").length,
    canvases: document.querySelectorAll(".amap-container canvas").length,
    scripts: Array.from(document.querySelectorAll("script"))
      .map((s) => s.src)
      .filter((s) => s.includes("amap"))
      .map((s) => s.replace(/key=[^&]+/, "key=‹已隐藏›")),
    演示模式: text.split("\n").filter((l) => l.includes("演示模式") || l.includes("手绘示意")).slice(0, 4),
    底图行: text.split("\n").filter((l) => l.includes("底图：")).slice(0, 2),
  };
});
console.log("页面状态:", JSON.stringify(state, null, 2));

const box = await page.locator(".amap-container").first().boundingBox().catch(() => null);
if (box) {
  const shot = await page.locator(".amap-container").first().screenshot();
  console.log(`底图容器截图 ${shot.length} 字节（空白网格通常只有几 KB，画满瓦片是几十 KB 起）`);
}
console.log(`瓦片类响应：成功 ${tileOk.length} 条 · 失败 ${tileBad.length} 条`);
for (const line of tileBad.slice(0, 6)) console.log("  ", line);
console.log("异常（含 4xx/5xx、控制台报错、任何非 GET）：");
console.log(bad.length ? bad.slice(0, 12).map((l) => "   " + l).join("\n") : "   无");

await page.screenshot({ path: "evidence/jskey-rotated-map.png" });

/* ── 第二段：不依赖「已核验路线」，直接证明这对凭据能画出真实底图 ───────
   真实地图只在 scene==="verified" 时挂载，所以候选不足的那次核验看不到它。
   这里用一个一次性页面按同样的方式加载 SDK（含本站 _AMapService 安全代理），
   只消耗 JS API 配额（浏览器每次开页都会做的事），不碰高德 Web 服务。 */
const fs = await import("node:fs");
const env = fs.readFileSync(".env.local", "utf8");
const jsKey = env.match(/^AMAP_JS_KEY=(.*)$/m)[1].trim();
const scratch = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
const scratchErrors = [];
scratch.on("console", (m) => {
  if (m.type() === "error") scratchErrors.push(m.text().slice(0, 200).split(jsKey).join("‹KEY›"));
});
scratch.on("response", (r) => {
  if (r.status() >= 400) scratchErrors.push(`HTTP ${r.status()} ${r.url().slice(0, 100).split(jsKey).join("‹KEY›")}`);
});
await scratch.setContent(
  `<!doctype html><meta charset="utf-8"><div id="m" style="width:900px;height:700px"></div>
   <script>window._AMapSecurityConfig={serviceHost:'http://127.0.0.1:3000/_AMapService'};<\/script>
   <script src="https://webapi.amap.com/maps?v=2.0&key=${jsKey}"><\/script>
   <script>
     window.__ready = false;
     try { new AMap.Map('m', { zoom: 13, center: [120.158, 30.258] }); window.__ready = true; }
     catch (e) { window.__error = String(e).slice(0, 200); }
   <\/script>`,
);
await scratch.waitForTimeout(12000);
const built = await scratch.evaluate(() => ({
  ready: window.__ready === true,
  error: window.__error ?? null,
  canvases: document.querySelectorAll("#m canvas").length,
  version: typeof window.AMap === "object" ? (window.AMap.version ?? null) : null,
}));
console.log("一次性页面:", JSON.stringify(built));
const shot = await scratch.locator("#m").screenshot().catch(() => null);
if (shot) console.log(`真实底图截图 ${shot.length} 字节（空白通常 < 10 KB，画满瓦片几十 KB 起）`);
await scratch.screenshot({ path: "evidence/jskey-rotated-sdk-proof.png" });
console.log("一次性页面异常：", scratchErrors.length ? scratchErrors.slice(0, 6) : "无");

await browser.close();


/**
 * 「我到了」单步复现：确认到底是选中站点的方式不对，还是百炼那一回合本身有波动。
 */
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("C:/Users/huangsh/AppData/Roaming/npm/node_modules/@playwright/cli/package.json");
const { chromium } = require("playwright");
const EXEC = "C:/Users/huangsh/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const EVIDENCE = "C:/Users/huangsh/Documents/Qoder/2026-10-18/1b7b268e/evidence";

const MAP = `(() => {
  const m = document.querySelector('.amap-container').amap;
  const c = m.getCenter();
  return {
    center: [+c.getLng().toFixed(6), +c.getLat().toFixed(6)],
    zoom: +m.getZoom().toFixed(2),
    markers: (m.getAllOverlays('marker')||[]).map(k => (k.getContent()||'').match(/aria-label="([^"]*)"/)?.[1] || ''),
    lines: (m.getAllOverlays('polyline')||[]).map(l => { const o = l.getOptions(); return o.strokeColor + '/' + o.strokeStyle; }),
  };
})()`;

const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${process.env.BASE_URL ?? "http://127.0.0.1:3000"}/`, { waitUntil: "domcontentloaded" });
await page.click("text=开始核验（真实调用高德）");
await page.waitForSelector("text=在地图定位", { timeout: 180000 });
await page.waitForSelector(".amap-container canvas", { timeout: 30000 });
await page.waitForTimeout(2000);

const chips = await page.locator("button[aria-pressed]").allInnerTexts();
console.log("aria-pressed 按钮:", JSON.stringify(chips.slice(0, 12)));

await page.locator("button[aria-pressed]", { hasText: /^1\.\s/ }).first().click();
await page.waitForTimeout(1200);
console.log("选中站点后地图:", JSON.stringify(await page.evaluate(MAP)));

await page.click('button:text-is("我到了")');
const outcome = await page
  .waitForFunction(() => document.body.innerText.includes("针对「"), null, { timeout: 120000 })
  .then(() => "narration")
  .catch((e) => `no-narration: ${String(e.name)}`);
console.log("回合结果:", outcome);
await page.waitForTimeout(1500);

const section = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.trim() === "我到了");
  const sec = b ? b.closest("section") : null;
  return sec ? sec.innerText.replace(/\s+/g, " ") : "missing";
});
console.log("面板全文（前 900 字）:", section.slice(0, 900));
console.log("地图状态:", JSON.stringify(await page.evaluate(MAP)));
console.log("已到达徽标:", await page.locator("text=已到达（手动模拟）").count());
await page.screenshot({ path: path.join(EVIDENCE, "phase6-08-arrived-map-state.png") });
await browser.close();

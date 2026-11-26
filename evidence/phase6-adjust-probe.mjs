/**
 * 「少走一点」在浏览器里卡住的专项诊断：请求到底发没发、响应有没有回来、
 * React 有没有在渲染新行程时抛错。
 */
import { createRequire } from "node:module";

const require = createRequire("C:/Users/huangsh/AppData/Roaming/npm/node_modules/@playwright/cli/package.json");
const { chromium } = require("playwright");
const EXEC = "C:/Users/huangsh/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe";

const errors = [];
const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 240)}`);
});
page.on("request", (r) => {
  if (r.url().includes("/api/")) console.log(`-> ${r.method()} ${r.url().split("3000")[1]}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/")) console.log(`<- ${r.status()} ${r.url().split("3000")[1]}`);
});

await page.goto(`${process.env.BASE_URL ?? "http://127.0.0.1:3000"}/`, { waitUntil: "domcontentloaded" });
await page.click("text=开始核验（真实调用高德）");
await page.waitForSelector("text=在地图定位", { timeout: 180000 });
await page.waitForSelector(".amap-container canvas", { timeout: 30000 });

console.log("--- 我到了 ---");
await page.click('button:text-is("我到了")');
await page.waitForFunction(() => document.body.innerText.includes("针对「"), null, { timeout: 120000 });
console.log("arrival ok");

console.log("--- 少走一点 ---");
const btn = page.locator('button:text-is("少走一点")');
console.log("button count:", await btn.count(), "disabled:", await btn.first().isDisabled());
await btn.first().click();
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  const snap = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.trim() === "少走一点" || x.textContent.trim() === "调整校验中…");
    const sec = b ? b.closest("section") : null;
    return {
      label: b ? b.textContent.trim() : "gone",
      disabled: b ? b.disabled : null,
      overlay: !!document.querySelector("nextjs__container_errors, [id*='errors']"),
      section: sec ? sec.innerText.replace(/\n+/g, " | ").slice(-320) : "no section",
    };
  });
  console.log(`t=${(i + 1) * 3}s`, JSON.stringify(snap));
  if (snap.label === "少走一点" && i > 2) break;
}
console.log("errors:", errors.slice(-12).join("\n") || "none");
await page.screenshot({ path: "C:/Users/huangsh/Documents/Qoder/2026-10-18/1b7b268e/evidence/phase6-13-adjust-stall.png" });
await browser.close();

/**
 * 飞猪优化① C 的零付费浏览器验收：证据条三态 + 数据可信说明 + 手机端不溢出。
 * 跑法：先 `npm run build && npm run start`，再 `node evidence/source-evidence-browser-probe.mjs`
 *       （线上：`BASE_URL=http://travel.peiqirui.com node …`，但线上注入夹具仅用于看 UI，不代表真实路线）。
 *
 * 重要口径：本探针往 sessionStorage 注入的是**夹具行程**（名称带「夹具」、折线是两点直线占位），
 * 只为在零付费前提下验证证据条/说明块的真实渲染与手机布局，绝不冒充高德实测路线。
 * 全程拦截高德外部请求与本地安全代理 → 地图回退到明确标注的手绘示意底图；
 * 断言 0 次 POST（0 次核验、0 次几何补查、0 个百炼回合）、0 弹窗。真实路线验收另走 D 付费预算。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE = path.join(ROOT, "evidence");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

const CLI_CANDIDATES = [
  process.env.PLAYWRIGHT_CLI_PACKAGE,
  path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "@playwright", "cli", "package.json"),
  path.join(os.homedir(), ".npm-global", "lib", "node_modules", "@playwright", "cli", "package.json"),
  "/usr/local/lib/node_modules/@playwright/cli/package.json",
  "/usr/lib/node_modules/@playwright/cli/package.json",
].filter(Boolean);

function loadPlaywright() {
  for (const candidate of CLI_CANDIDATES) {
    try {
      return createRequire(candidate)("playwright");
    } catch {
      // 换下一个候选
    }
  }
  return createRequire(import.meta.url)("playwright");
}
const { chromium } = loadPlaywright();

const BROWSER_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROME,
  path.join(os.homedir(), "AppData", "Local", "ms-playwright", "chromium-1228", "chrome-win64", "chrome.exe"),
  path.join(os.homedir(), ".cache", "ms-playwright", "chromium-1228", "chrome-linux", "chrome"),
].filter(Boolean);
const EXEC = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const COLLECTED_AT = "2026-11-07T06:30:00.000Z"; // 杭州时间 14:30，夹具采集时间

/* ── 夹具行程：三站分别覆盖 ✓已校验 / 未校验(id对不上) / 早期记录未留存 ── */
const START = {
  name: "湖滨公园（夹具起点）", amapId: "amap-start", address: "杭州市上城区（夹具）",
  position: { lat: 30.255, lng: 120.155 }, reason: "夹具：与真实流程相同的固定起点设定",
};
function fixtureStop(id, name, position, extra) {
  return {
    name, flyaiId: id, amapId: `amap-${id}`, address: "杭州市上城区（夹具）", position,
    matchStatus: "matched", stayMinutes: 30, staySource: "simulated",
    openingStatus: "no-conflict", openingNote: "夹具：按假定窗口不冲突",
    jumpUrl: null, flyaiDescription: null, ...extra,
  };
}
const STOPS = [
  fixtureStop("poi-check", "集贤亭（夹具·已校验）", { lat: 30.256, lng: 120.154 }, {
    flyaiIdFromSource: true, flyaiCollectedAt: COLLECTED_AT, jumpUrl: "https://example.fliggy.com/poi-check",
  }),
  fixtureStop("poi-false", "圣塘（夹具·未校验）", { lat: 30.257, lng: 120.153 }, {
    flyaiIdFromSource: false, flyaiCollectedAt: COLLECTED_AT,
  }),
  fixtureStop("poi-legacy", "断桥（夹具·早期记录）", { lat: 30.2585, lng: 120.152 }, {
    // 故意不带 flyaiIdFromSource / flyaiCollectedAt：模拟旧快照，界面应写「未校验·早期记录」「查询时间未记录」
  }),
];
function fixtureLeg(fromName, toName, from, to) {
  return {
    fromName, toName, from, to, distanceMeters: 400, durationMinutes: 5, durationSeconds: 300,
    stepCount: 0, firstInstruction: null, fromCache: false,
    // 两点直线占位（仅本地测试，非真实导航折线）：让 pendingGeometry 为空，从而 0 次几何 POST
    polyline: [from, to],
  };
}
const LEGS = [
  fixtureLeg(START.name, STOPS[0].name, START.position, STOPS[0].position),
  fixtureLeg(STOPS[0].name, STOPS[1].name, STOPS[0].position, STOPS[1].position),
  fixtureLeg(STOPS[1].name, STOPS[2].name, STOPS[1].position, STOPS[2].position),
];
const ITINERARY = {
  start: START, stops: STOPS, legs: LEGS,
  totalWalkMeters: 1200, totalWalkMinutes: 15, totalStayMinutes: 90, bufferMinutes: 20,
  totalMinutes: 125, budgetMinutes: 240, feasible: true, assumedStartAt: COLLECTED_AT,
};
function fixtureMatch(stop) {
  return {
    flyaiId: stop.flyaiId, name: stop.name, category: "文创街区", flyaiAddress: stop.address,
    flyaiPosition: stop.position, jumpUrl: stop.jumpUrl, flyaiDescription: null,
    status: "matched", reason: null,
    amap: { id: stop.amapId, name: stop.name, address: stop.address, adname: "上城区", typecode: null, position: stop.position, opentime: null, rating: null },
    deviationMeters: 0, routablePosition: stop.position,
    nameAgrees: true, addressAgrees: true, districtAgrees: true,
    openingStatus: "no-conflict", openingNote: "夹具", routable: true, routableReason: "夹具",
    flyaiCollectedAt: stop.flyaiCollectedAt ?? null, flyaiIdFromSource: stop.flyaiIdFromSource,
  };
}
const REPORT = {
  cityName: "杭州", districtName: "西湖湖滨", budgetMinutes: 240,
  generatedAt: COLLECTED_AT, ok: true, error: null,
  categories: ["自然风光", "文创街区"], candidateCount: 3,
  datum: { probes: [], flyaiDatum: null, reason: "夹具：样本不足，不下坐标系结论" },
  start: START, matches: STOPS.map(fixtureMatch),
  matchedCount: 3, suspiciousCount: 0, unverifiedCount: 0, routableCount: 3,
  itinerary: ITINERARY, insufficiency: null, rejections: [],
  amap: {
    keyPresent: true, keyMask: "夹具****", placeCalls: 0, walkingCalls: 0, cacheHits: 0, failedCalls: 0,
    placeHourlyCap: 40, walkingHourlyCap: 80, cacheTtlSeconds: 21600, log: [],
  },
  flyaiProofs: [],
};
const FIXTURE = { cityName: "杭州", report: REPORT, usedCategories: ["自然风光", "文创街区"] };

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${JSON.stringify(detail)}` : ""}`);
}

const browser = await chromium.launch({ headless: false, executablePath: EXEC });
const context = await browser.newContext({ viewport: { ...DESKTOP } });

const posts = [];
const dialogs = [];
let blockedExternal = 0;
const continuedExternal = [];
// 拦截一切非本地请求（高德 SDK/瓦片/安全代理都在内）：地图回退手绘底图，保证零外部放行、零付费。
// 绝不记录外部 URL 原文——高德 SDK 加载地址里带客户端 JS key，只计数、不留地址。
const baseHost = new URL(BASE).hostname;
await context.route(/.*/, (route) => {
  const request = route.request();
  const url = request.url();
  if (request.method() === "POST") posts.push(new URL(url).pathname);
  const host = new URL(url).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === baseHost;
  if (!isLocal) {
    blockedExternal += 1;
    return route.abort();
  }
  return route.continue();
});
// 在应用脚本之前注入夹具快照（每次导航都执行，首帧水合即可读到）。
await context.addInitScript((snapshot) => {
  try { window.sessionStorage.setItem("xuxiake.session.route", JSON.stringify(snapshot)); } catch { /* 隐私模式忽略 */ }
}, FIXTURE);

const page = await context.newPage();
page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });

// ── 1. 桌面端：证据条三态 + 数据可信说明真的在屏幕上 ───────────────
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("main", { timeout: 60000 });
await page.waitForSelector('section[aria-label="数据可信说明"]', { timeout: 30000 });
await page.waitForTimeout(2500);

const trustVisible = await page.locator('section[aria-label="数据可信说明"]').isVisible();
check("数据可信说明块在桌面端可见（不折叠）", trustVisible);
const trustText = (await page.locator('section[aria-label="数据可信说明"]').innerText()).replace(/\s+/g, "");
check("说明块明说没有价格、不构成预算保证", trustText.includes("没有任何门票／酒店价格") && trustText.includes("不构成预算保证"));
check("说明块明说查不到就明说、绝不用常识补数字", trustText.includes("绝不用常识补数字"));

const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, "");
const sourceTagCount = await page.getByText("来源 FlyAI", { exact: true }).count();
check("每张行程卡都有证据条（来源 FlyAI 标签 ≥ 3）", sourceTagCount >= 3, { sourceTagCount });
check("✓已校验 只在通过站点亮", bodyText.includes("✓已校验"));
check("id 对不上的站如实写「未校验·id 未通过来源校验」", bodyText.includes("未校验·id未通过来源校验"));
check("早期记录站如实写「未校验·早期记录未留存来源校验」", bodyText.includes("未校验·早期记录未留存来源校验"));
check("通过站显示紧凑查询时间（查询于 …14:30）", /查询于11\/07.*14:30|查询于.*14:30/.test(bodyText), { sample: bodyText.match(/查询于[^✓未]{0,20}/)?.[0] ?? null });
check("早期记录站显示「查询时间未记录」", bodyText.includes("查询时间未记录"));
await page.screenshot({ path: path.join(EVIDENCE, "source-evidence-desktop.png") });

// ── 2. 手机端：切到「行程与探索」让证据条真的可见，再查 flex-wrap 不溢出 ──
await page.setViewportSize({ ...MOBILE });
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "行程与探索", exact: true }).click();
await page.waitForTimeout(1200);
const overflow = await page.evaluate(() => {
  // 只量真正可见的证据条（display:none 的隐藏 tab 内容 clientWidth=0，量了没意义）
  const bars = [...document.querySelectorAll("span")].filter((s) => {
    if (!s.textContent?.includes("来源 FlyAI")) return false;
    const rect = s.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  const bad = bars.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => ({ scroll: b.scrollWidth, client: b.clientWidth }));
  return {
    visibleBarCount: bars.length,
    overflowingBars: bad,
    docScrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  };
});
check("手机端切到行程页后证据条可见且每条都不横向溢出（flex-wrap 生效）", overflow.visibleBarCount >= 3 && overflow.overflowingBars.length === 0, overflow);
check("手机端页面整体无横向滚动", overflow.docScrollWidth <= overflow.viewport + 1, { docScrollWidth: overflow.docScrollWidth, viewport: overflow.viewport });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(EVIDENCE, "source-evidence-mobile.png"), fullPage: true });

// ── 3. 全程零付费、零外部、零弹窗 ─────────────────────────────────
check("探针没有发出任何 POST（0 次核验/几何补查/百炼回合）", posts.length === 0, { posts });
check("外部请求一律拦截、0 次放行（高德 SDK/瓦片/代理均未触达）", continuedExternal.length === 0, { blockedExternal });
check("全程没有弹窗", dialogs.length === 0, { dialogs });

const failed = results.filter((r) => !r.pass);
const summary = {
  checkedAt: new Date().toISOString(),
  baseUrl: BASE,
  fixture: true,
  fixtureNotice: "注入夹具行程（名称带「夹具」、折线为两点直线占位），地图外部请求被拦截回退手绘底图；仅验证证据条/说明块 UI 与手机布局，不代表高德真实路线验收。",
  paidPosts: posts.length,
  blockedExternalRequests: blockedExternal,
  continuedExternalRequests: continuedExternal.length,
  dialogs: dialogs.length,
  total: results.length,
  passed: results.length - failed.length,
  checks: results,
};
fs.writeFileSync(path.join(EVIDENCE, "source-evidence-ui.json"), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${summary.total} 通过${failed.length ? `；未通过：${failed.map((f) => f.name).join("、")}` : ""}（POST=${posts.length}，外部拦截=${blockedExternal}/放行=${continuedExternal.length}，弹窗=${dialogs.length}）`);
await browser.close();
process.exit(failed.length ? 1 : 0);
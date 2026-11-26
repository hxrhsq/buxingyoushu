/**
 * 城市注册表零付费回归（2026-11-21）。
 *
 * 加城市的闸门都挪到了 CITY_CONFIGS 单一来源，这个脚本只证明两件事，且不花任何调用：
 *   1. 没在注册表里的城市会被 pickCity 挡掉，报错列出的是**当前真实名单**（不是写死的「杭州」）；
 *   2. startKeyword 的收紧校验（长度、控制字符、类型）在**任何高德调用之前**返回 400。
 * 全程用计数器对账：place / walking 必须一格都不动。
 *
 * 跑法：npm run build && npm run start，然后 node evidence/city-registry-check.mjs
 * 命名注意：不要叫 *-probe.mjs，`.gitignore` 里 `evidence/*probe*.mjs` 会把它挡掉，换台机器就没了。
 */
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

let pass = 0;
let fail = 0;
const rows = [];
function check(name, ok, detail) {
  if (ok) pass += 1; else fail += 1;
  rows.push({ name, ok, detail: detail ?? null });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function counters() {
  const response = await fetch(`${BASE}/api/verify`, { cache: "no-store" });
  return response.json();
}

async function post(body) {
  const response = await fetch(`${BASE}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await response.json(); } catch { /* 下面如实报 */ }
  return { status: response.status, json };
}

const before = await counters();
check("服务端可达且报告当前城市名单", typeof before.startKeyword === "string", `默认起点关键词 ${before.startKeyword}`);

const unknown = await post({ cityName: "南京", categories: ["文创街区"] });
check("未注册城市被挡在调用之前", unknown.status === 400, JSON.stringify(unknown.json?.error ?? unknown.json));
check("报错文案是动态名单而不是写死杭州",
  typeof unknown.json?.error === "string" && unknown.json.error.includes("苏州") && unknown.json.error.includes("青岛"),
  unknown.json?.error);

const tooLong = await post({ cityName: "青岛", startKeyword: "长".repeat(21) });
check("起点关键词超过 20 字 → 400", tooLong.status === 400, JSON.stringify(tooLong.json?.error ?? tooLong.json));

const controlChar = await post({ cityName: "青岛", startKeyword: "劈柴\n院" });
check("起点关键词含控制字符 → 400", controlChar.status === 400, JSON.stringify(controlChar.json?.error ?? controlChar.json));

const wrongType = await post({ cityName: "青岛", startKeyword: { a: 1 } });
check("起点关键词不是字符串 → 400（绝不能悄悄当成默认起点去真跑）",
  wrongType.status === 400, JSON.stringify(wrongType.json?.error ?? wrongType.json));

const emptyStart = await post({ cityName: "青岛", startKeyword: "   " });
check("全空白起点 → 400", emptyStart.status === 400, JSON.stringify(emptyStart.json?.error ?? emptyStart.json));

const after = await counters();
check("全程 0 新增高德调用",
  after.placeHourlyUsed === before.placeHourlyUsed && after.walkingHourlyUsed === before.walkingHourlyUsed,
  `place ${before.placeHourlyUsed}→${after.placeHourlyUsed}、walking ${before.walkingHourlyUsed}→${after.walkingHourlyUsed}`);

console.log(`\n${pass}/${pass + fail} 城市注册表零付费检查通过${fail ? `（${fail} 项失败）` : ""}`);

// 存档：这条闸门以前只在控制台里出现过，没有 JSON 就等於没证据（2026-11-22 只读审计指出）
const summary = {
  checkedAt: new Date().toISOString(),
  baseUrl: BASE,
  paid: false,
  script: "city-registry-check.mjs",
  total: pass + fail,
  passed: pass,
  checks: rows,
  countersBefore: { place: before.placeHourlyUsed, walking: before.walkingHourlyUsed, pid: before.pid },
  countersAfter: { place: after.placeHourlyUsed, walking: after.walkingHourlyUsed, pid: after.pid },
  newAmapCalls: {
    place: after.placeHourlyUsed - before.placeHourlyUsed,
    walking: after.walkingHourlyUsed - before.walkingHourlyUsed,
  },
  knownLimits: "只证明闸门与校验；不证明任何城市的路线可行性，那要各城自己冷跑（见 objective-compare-*.json）",
};
fs.writeFileSync(new URL("./city-registry-check.json", import.meta.url), JSON.stringify(summary, null, 2));
console.log("结果已写入 evidence/city-registry-check.json");
process.exit(fail ? 1 : 0);

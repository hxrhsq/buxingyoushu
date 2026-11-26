/**
 * 同一个候选池、三种排序目标的对账（2026-11-21）。
 *
 * 背景：家庭主流程的求解器先比站数、站数相同才比步行距离（solve.ts rankCandidates 第 4 条），
 * 「少走路」倾向（bias: walk_less）只有双人协商端点接得住。本脚本量三件事：
 *   A. 出货默认（最多站）：/api/verify 直接返回的那条路线；
 *   B. 同一事实集把 bias 换成 walk_less（走 /api/plan 条件端点，家庭流没有这个入口）：
 *      不设上限、以及总量 ≤3 公里时路线变成什么样；
 *   C. 家庭流现状（/api/resolve，目标恒为最多站）：收紧单段 ≤900 米 / 总量 ≤3 公里时的结果。
 *
 * 计费口径：只有第 1 步 /api/verify 是真实冷跑（文创街区单类别，约 36 次高德免费额度调用，
 * 0 元；「自然风光」会捞到千岛湖一级的远郊点，历来不可行，不进对比）。
 * 之后建方案、改条件全部走 /api/plan 事实层，0 新增高德；脚本最后用 /api/verify 的
 * 计数器对账证明这一点。
 *
 * 跑法：先 npm run build && npm run start，再
 *   node evidence/objective-compare.mjs                    # 杭州
 *   CITY=苏州 node evidence/objective-compare.mjs          # 苏州（注册表默认起点平江路）
 *   CITY=苏州 START=拙政园 node evidence/objective-compare.mjs  # 显式换起点（出发点可选）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE = path.join(ROOT, "evidence");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const CITY = process.env.CITY ?? "杭州";
const START = process.env.START ?? null;
const SUFFIX = CITY === "杭州" && !START ? "" : `-${CITY}${START ? `-${START}` : ""}`;

async function api(pathname, { method = "GET", token = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["x-plan-role-token"] = token;
  const response = await fetch(`${BASE}${pathname}`, {
    method: method === "GET" ? "GET" : "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await response.json(); } catch { /* 留空，下面如实报 */ }
  return { status: response.status, json };
}

function tokenFromLink(role, link) {
  const match = new RegExp(`#r=${role}&t=([^&]+)`).exec(link);
  return match ? decodeURIComponent(match[1]) : null;
}

function maxLegMeters(itinerary) {
  if (!itinerary?.legs?.length) return null;
  return Math.max(...itinerary.legs.map((leg) => leg.distanceMeters));
}

function routeOf(itinerary) {
  if (!itinerary) return null;
  return {
    stops: itinerary.stops.length,
    names: itinerary.stops.map((stop) => stop.name),
    totalWalkMeters: itinerary.totalWalkMeters,
    totalWalkMinutes: itinerary.totalWalkMinutes,
    totalMinutes: itinerary.totalMinutes,
    maxLegMeters: maxLegMeters(itinerary),
  };
}

const statusBefore = (await api("/api/verify")).json;
console.log(
  `核验前计数：place=${statusBefore.placeHourlyUsed}/${statusBefore.placeHourlyCap} walking=${statusBefore.walkingHourlyUsed}/${statusBefore.walkingHourlyCap} cache=${statusBefore.cacheEntries}`,
);

/* 1. 真实冷跑：文创街区单类别（唯一一次付费，免费额度、0 元） */
const verifyBody = { cityName: CITY, categories: ["文创街区"] };
if (START) verifyBody.startKeyword = START;
const verified = await api("/api/verify", { method: "POST", body: verifyBody });
const report = verified.json?.report;
if (verified.status !== 200 || !report?.ok || !report?.facts?.factsId) {
  console.log("核验没有成功，如实结束：", JSON.stringify({ status: verified.status, error: report?.error, insufficiency: report?.insufficiency }));
  process.exit(1);
}
console.log(`核验成功（${CITY}${START ? ` · 起点 ${report.start?.name ?? START}` : ""}）：${report.itinerary.stops.length} 站，全程步行 ${report.itinerary.totalWalkMeters} 米；factsId=${report.facts.factsId}`);
const countersAfterVerify = (await api("/api/verify")).json;

/* 2. 同一事实集建方案（A 单人；B 不加入），之后每一种目标就是一次 0 费用的条件尝试 */
const created = await api("/api/plan", { method: "POST", body: { factsId: report.facts.factsId } });
if (created.status !== 200 || !created.json?.planId) {
  console.log("建方案失败，如实结束：", JSON.stringify(created.json));
  process.exit(1);
}
const planId = created.json.planId;
const tokenA = created.json.links?.A ? tokenFromLink("A", created.json.links.A) : null;
if (!tokenA) {
  console.log("拿不到 A 角色凭据，如实结束。");
  process.exit(1);
}

let revision = 1;
const attempts = [];
async function attempt(label, attemptId, conditions) {
  const response = await api(`/api/plan/${planId}/conditions`, {
    method: "POST",
    token: tokenA,
    body: { expectedRevision: revision, attemptId, conditions },
  });
  const rev = response.json?.result?.revision;
  if (response.status !== 200 || !rev) {
    attempts.push({ label, error: response.json?.error ?? response.json?.result?.message ?? `HTTP ${response.status}` });
    console.log(`${label}：失败 ${JSON.stringify(attempts.at(-1))}`);
    return null;
  }
  revision = rev.revision;
  const row = {
    label,
    revision: rev.revision,
    status: rev.status,
    route: routeOf(rev.itinerary),
    walkDeltaVsBaseline: rev.diff?.totalWalkMeters?.delta ?? null,
    diffLines: rev.diff?.lines ?? null,
  };
  attempts.push(row);
  console.log(`${label}：v${rev.revision} ${row.route ? `${row.route.stops} 站 / 步行 ${row.route.totalWalkMeters} 米 / 最长单段 ${row.route.maxLegMeters} 米` : "无路线"}`);
  return row;
}

const baseline = routeOf(report.itinerary);
console.log(`\n【A 出货默认（最多站）】${baseline.stops} 站 / 步行 ${baseline.totalWalkMeters} 米 / 最长单段 ${baseline.maxLegMeters} 米 / ${baseline.names.join("、")}`);

/* 协商端点换目标：bias 是 PartyConditions 字段，家庭主流程没有入口，这里直接给 */
await attempt("【B1 少走路（bias=walk_less，不设硬上限）】", "objective-walk-less", { bias: "walk_less" });
await attempt("【B2 少走路 + 总量 ≤3 公里】", "objective-walk-less-3km", { bias: "walk_less", hard: { maxWalkMeters: 3000 } });

/* 家庭主流程现状：/api/resolve，bias 恒为 neutral（目标=最多站），只能收紧硬上限 */
async function resolveAttempt(label, constraints) {
  const response = await api("/api/resolve", { method: "POST", body: { factsId: report.facts.factsId, ...constraints } });
  const body = response.json ?? {};
  const row = {
    label,
    ok: body.ok === true,
    code: body.code ?? null,
    route: routeOf(body.itinerary),
    newAmapCalls: body.cost?.newAmapCalls ?? null,
    reason: typeof body.reason === "string" ? body.reason : null,
    explanation: body.explanation ?? null,
    suggestion: body.suggestion ?? null,
  };
  attempts.push(row);
  console.log(
    `${label}：${row.route ? `${row.route.stops} 站 / 步行 ${row.route.totalWalkMeters} 米 / 最长单段 ${row.route.maxLegMeters} 米` : `不可行（${row.code}）`} · 本次新增高德 ${row.newAmapCalls} 次`,
  );
  return row;
}

await resolveAttempt("【C1 家庭流现状 + 单段 ≤900 米（目标仍是最多站）】", { maxSegmentMeters: 900 });
await resolveAttempt("【C2 家庭流现状 + 总量 ≤3 公里（目标仍是最多站）】", { maxWalkMeters: 3000 });

/* D. 「至少 2 站的前提下最少走路」应该是什么样：二分总上限，找能排出 ≥2 站的最小值。
   这正是家庭流该有的默认目标（先保站数下限、再比总步行），现在用 shipped 的
   /api/resolve 原样量出来，作为改动前的基准数字。全程 0 新增高德。 */
let lo = 200;
let hi = report.itinerary.totalWalkMeters;
let walkFirst = null;
const probes = [];
while (lo <= hi) {
  const mid = Math.floor((lo + hi) / 2);
  const response = await api("/api/resolve", { method: "POST", body: { factsId: report.facts.factsId, maxWalkMeters: mid } });
  const body = response.json ?? {};
  const hit = body.ok === true && body.itinerary && body.itinerary.stops.length >= 2;
  probes.push({ cap: mid, ok: hit, stops: body.itinerary?.stops.length ?? 0, walk: body.itinerary?.totalWalkMeters ?? null });
  if (hit) {
    walkFirst = { cap: mid, ...routeOf(body.itinerary) };
    hi = mid - 1;
  } else {
    lo = mid + 1;
  }
}
console.log(
  `【D 少走路且至少 2 站（改动前基准）】${walkFirst ? `${walkFirst.stops} 站 / 步行 ${walkFirst.totalWalkMeters} 米 / 最长单段 ${walkFirst.maxLegMeters} 米 / ${walkFirst.names.join("、")}` : "没有可行组合"} · 总量门槛 ${walkFirst?.cap} 米`,
);

/* 3. 对账：条件阶段必须 0 新增高德 */
const countersEnd = (await api("/api/verify")).json;
const walkDelta = countersEnd.walkingHourlyUsed - countersAfterVerify.walkingHourlyUsed;
const placeDelta = countersEnd.placeHourlyUsed - countersAfterVerify.placeHourlyUsed;
console.log(`\n对账：核验后 → 结束，place +${placeDelta}、walking +${walkDelta}（应全为 0）；冷跑本身 place +${countersAfterVerify.placeHourlyUsed - statusBefore.placeHourlyUsed}、walking +${countersAfterVerify.walkingHourlyUsed - statusBefore.walkingHourlyUsed}。`);

await api(`/api/plan/${planId}/revoke`, { method: "POST", token: tokenA });

const summary = {
  checkedAt: new Date().toISOString(),
  baseUrl: BASE,
  city: CITY,
  startKeyword: START,
  startName: report.start?.name ?? null,
  categories: ["文创街区"],
  paidColdRun: {
    place: countersAfterVerify.placeHourlyUsed - statusBefore.placeHourlyUsed,
    walking: countersAfterVerify.walkingHourlyUsed - statusBefore.walkingHourlyUsed,
  },
  objectivePhaseCalls: { place: placeDelta, walking: walkDelta },
  baseline: baseline,
  attempts,
  walkFirst: { ...walkFirst, probes },
  counters: { afterVerify: countersAfterVerify.cacheEntries, end: countersEnd.cacheEntries },
};
fs.writeFileSync(path.join(EVIDENCE, `objective-compare${SUFFIX}.json`), JSON.stringify(summary, null, 2));
console.log(`\n证据已写入 evidence/objective-compare${SUFFIX}.json`);

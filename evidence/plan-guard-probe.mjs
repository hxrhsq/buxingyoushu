/**
 * 端点守门探针：零付费，只验证「不合格的请求一律进不来，失效一律如实说」。
 * 完整协商闭环（需要一份真实核验）在 evidence/plan-api-smoke.mjs。
 */
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const results = [];
const check = (name, pass, extra) => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ""}`);
};

async function post(path, { body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-plan-role-token"] = token;
  const response = await fetch(`${BASE}${path}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body ?? {}) });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

async function get(path, token) {
  const response = await fetch(`${BASE}${path}`, { headers: token ? { "x-plan-role-token": token } : {} });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

const status = await get("/api/plan");
check("S0 账本状态可查且不含任何密钥", status.status === 200 && status.payload.keyMask === undefined && status.payload.walkingHourlyCap === 80, status.payload);

const bogusFacts = await post("/api/plan", { body: { factsId: "does-not-exist" } });
check("S1 事实集失效时如实 410，并说明重新核验的成本", bogusFacts.status === 410 && /36 次高德/.test(bogusFacts.payload.error) && bogusFacts.payload.code === "facts-unavailable", {
  status: bogusFacts.status,
});

const badJson = await post("/api/plan", { body: "not-json" });
check("S2 非法 JSON 直接 400", badJson.status === 400);

const huge = await post("/api/plan", { body: JSON.stringify({ factsId: "x".repeat(9000) }) });
check("S3 超限请求体 413，不进入任何状态迁移", huge.status === 413, { status: huge.status, error: huge.payload?.error });

const noToken = await get("/api/plan/abc123");
check("S4 未知方案读取返回 410（不区分「不存在」与「已失效」以免枚举）", noToken.status === 410 && noToken.payload.code === "unknown-plan" && noToken.payload.snapshot === undefined);

const wrongToken = await post("/api/plan/abc123/conditions", { token: "t".repeat(40), body: { conditions: {}, expectedRevision: null, attemptId: "a" } });
check("S5 没有对应方案时任何写操作都是 410，不会创建状态", wrongToken.status === 410);

const invalidCondition = await post("/api/plan", { body: { factsId: "whatever", conditions: { role: "A" } } });
check("S6 条件里带不认识的字段先被拒（这里 factsId 也不存在，仍不进状态迁移）", invalidCondition.status === 410 || invalidCondition.status === 400, {
  status: invalidCondition.status,
});

const page = await fetch(`${BASE}/plan/abc123`);
check("S7 同伴落地页可访问（凭据只在前端 fragment 里处理）", page.ok, { status: page.status });
const html = await page.text();
check("S7b 落地页 HTML 里没有令牌、没有密钥、也没有内部路径", !/x-plan-role-token|AMAP_WEB_KEY|amap-proxy/.test(html) && !/DASHSCOPE/.test(html));

/* AI 解释是这一步里唯一会买百炼回合的入口：没凭据/没方案时必须先被挡住，一分不花 */
const turnsBefore = (await get("/api/agent")).payload?.totalTurns;
const explainNoToken = await post("/api/plan/abc123/explain", { body: { attemptId: "guard-1" } });
const explainWrongToken = await post("/api/plan/abc123/explain", { token: "t".repeat(40), body: { attemptId: "guard-2" } });
const turnsAfter = (await get("/api/agent")).payload?.totalTurns;
check("S8 AI 解释在没有方案/没有凭据时被挡在门外", explainNoToken.status === 410 && explainWrongToken.status === 410, {
  无凭据: explainNoToken.status, 错凭据: explainWrongToken.status,
});
check("S8b 挡下这两次请求没有买任何百炼回合", turnsBefore === turnsAfter, { before: turnsBefore, after: turnsAfter });
check("S9 快照状态接口如实报告最小快照的位置与大小",
  status.payload.persist !== undefined && typeof status.payload.persist.file === "string" && !path.isAbsolute(status.payload.persist.file),
  status.payload.persist);

const failed = results.filter((item) => !item.pass);console.log(`\n${results.length - failed.length}/${results.length} 通过（零高德/飞猪/百炼调用）`);
for (const item of failed) console.log(`未通过：${item.name}`);
process.exit(failed.length ? 1 : 0);

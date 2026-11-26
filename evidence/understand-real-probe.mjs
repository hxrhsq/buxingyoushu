/**
 * 「读一句话」真实模型探针（付费）。
 *
 * 成本上限：SENTENCES.length 次百炼 chat/completions 调用（默认模型 qwen-flash，关思考），
 * 0 次高德、0 次飞猪。脚本前后读 GET /api/understand 的计数，如实写出实际调用次数与 token。
 * 跑之前必须先单独报预算并获批。跑法（服务需已用最新代码 build + start）：
 *   CONFIRM_PAID=yes node evidence/understand-real-probe.mjs
 *
 * 这里验证的是「真实千问 + 我们的校验」合起来的结果：不管模型怎么答，
 * 硬性要求（hard）必须成立；期望类别（expect）不符只记为「模型表现」，不算我们的校验失败。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CONFIRM_PAID !== "yes") {
  console.error("这个脚本会真实调用百炼（付费）。确认预算已获批后，用 CONFIRM_PAID=yes 运行。");
  process.exit(2);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

/** expect：我们希望模型给的类别；minutes：kind=minutes 时代码应算出的值 */
const SENTENCES = [
  // A. 明确的全程时长 → 代码应算出分钟
  { text: "全程最多走一个小时", expect: "minutes", minutes: 60 },
  { text: "我妈一共能走四十分钟左右", expect: "minutes", minutes: 40 },
  { text: "加起来走两个小时没问题", expect: "minutes", minutes: 120 },
  { text: "全程步行别超过半小时", expect: "minutes", minutes: 30 },
  { text: "我爸最多走一个半小时", expect: "minutes", minutes: 90 },
  { text: "一共走45分钟就行", expect: "minutes", minutes: 45 },
  { text: "总共能走1小时20分钟", expect: "minutes", minutes: 80 },
  { text: "全程走路控制在一小时以内", expect: "minutes", minutes: 60 },
  { text: "走半小时就累，但全程加起来一个半小时没问题", expect: "minutes", minutes: 90 },
  { text: "每次走二十分钟要歇一下，一天下来一共能走一个小时", expect: "minutes", minutes: 60 },
  { text: "我爸身体很好，能走三个小时", expect: "minutes", minutes: 180 },
  { text: "步行总时间不超过四十五分钟", expect: "minutes", minutes: 45 },
  // B. 只说身体情况 → 追问
  { text: "我妈膝盖不好", expect: "ask" },
  { text: "我爸腿脚不太方便，容易累", expect: "ask" },
  { text: "我妈刚做完手术，体力一般", expect: "ask" },
  { text: "老人家七十多了", expect: "ask" },
  { text: "我外婆走路要拄拐杖", expect: "ask" },
  { text: "带着八十岁的奶奶", expect: "ask" },
  { text: "我爸有高血压，不能太累", expect: "ask" },
  { text: "我妈腰不好", expect: "ask" },
  // C. 只说一口气走多久 → 追问（不能当成全程）
  { text: "我妈走半小时就得歇一会儿", expect: "ask" },
  { text: "一口气最多走十五分钟", expect: "ask" },
  { text: "每走二十分钟要坐下来休息", expect: "ask" },
  { text: "连续走超过半小时膝盖就疼", expect: "ask" },
  // D. 含糊时长 → 追问
  { text: "能走个把小时吧", expect: "ask" },
  { text: "一两个小时应该可以", expect: "ask" },
  { text: "走不了太久", expect: "ask" },
  { text: "一个多小时吧", expect: "ask" },
  { text: "二三十分钟的样子", expect: "ask" },
  { text: "半天都行吧", expect: "ask" },
  // E. 没讲走路 → off-topic
  { text: "想去断桥看看", expect: "off-topic" },
  { text: "中午想找个地方吃饭", expect: "off-topic" },
  { text: "下午三点前要回酒店", expect: "off-topic" },
  { text: "不想去人多的地方", expect: "off-topic" },
  { text: "有没有适合拍照的地方", expect: "off-topic" },
  // F. 混在一起
  { text: "我妈膝盖不好，想去河坊街", expect: "ask" },
  { text: "全程最多走一小时，想去西湖边", expect: "minutes", minutes: 60 },
  { text: "我爸能走四十分钟，不想爬山", expect: "minutes", minutes: 40 },
  { text: "膝盖不好，一共最多走半小时", expect: "minutes", minutes: 30 },
  { text: "我妈说走一个小时没问题，但要经常坐下来歇歇", expect: "minutes", minutes: 60 },
];

const status = async () => (await fetch(`${BASE}/api/understand`)).json();
const before = await status();
if (!before.configured) {
  console.error(`服务端没有配置百炼（缺 ${before.missingVars.join("、")}），不发任何请求。`);
  process.exit(2);
}

const rows = [];
for (const item of SENTENCES) {
  const response = await fetch(`${BASE}/api/understand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: item.text }),
  });
  const body = await response.json();
  const u = body.understanding ?? {};
  const hard = [];
  // 硬性要求：无论模型怎么答都必须成立
  if (u.kind === "minutes" && u.minutes !== null && !item.text.includes(u.quote ?? "\u0000")) hard.push("quote 不是原文");
  if (u.kind === "minutes" && item.expect !== "minutes") hard.push(`不该定出数字却定成了 ${u.minutes}`);
  if (u.kind === "minutes" && item.minutes !== undefined && u.minutes !== item.minutes) hard.push(`分钟数不对：${u.minutes} ≠ ${item.minutes}`);
  if (u.questionFromModel && /\d/.test(u.question) && !/\d/.test(item.text)) hard.push("追问里出现了用户没说过的数字");
  rows.push({
    text: item.text,
    expect: item.expect,
    got: u.kind,
    minutes: u.minutes ?? null,
    question: u.question,
    questionFromModel: u.questionFromModel,
    note: u.note,
    other: u.other,
    degraded: body.degraded,
    error: body.error,
    cost: body.cost,
    modelAsExpected: u.kind === item.expect && (item.minutes === undefined || u.minutes === item.minutes),
    hardViolations: hard,
  });
  console.log(`${hard.length ? "FAIL" : "PASS"} [期望 ${item.expect} / 实得 ${u.kind}${u.minutes != null ? ` ${u.minutes}` : ""}] ${item.text}${hard.length ? ` :: ${hard.join("；")}` : ""}`);
}

const after = await status();
const summary = {
  checkedAt: new Date().toISOString(),
  baseUrl: BASE,
  paid: true,
  model: after.model,
  budget: { bailianCalls: SENTENCES.length, amapCalls: 0, flyaiSpawns: 0 },
  actual: {
    bailianCalls: after.modelCalls - before.modelCalls,
    failedCalls: after.failedCalls - before.failedCalls,
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
  },
  hardPassed: rows.filter((r) => r.hardViolations.length === 0).length,
  modelAsExpected: rows.filter((r) => r.modelAsExpected).length,
  total: rows.length,
  rows,
};
fs.writeFileSync(path.join(ROOT, "evidence", "understand-real-probe.json"), JSON.stringify(summary, null, 2));
console.log(`\n硬性要求 ${summary.hardPassed}/${summary.total}；模型类别符合期望 ${summary.modelAsExpected}/${summary.total}`);
console.log(`实际：百炼 ${summary.actual.bailianCalls} 次（预算 ${summary.budget.bailianCalls}），输入 ${summary.actual.inputTokens} / 输出 ${summary.actual.outputTokens} token`);
process.exit(summary.hardPassed === summary.total ? 0 : 1);

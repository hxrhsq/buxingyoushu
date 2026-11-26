/** 总时长口径实测：同一份济南事实集，分别按 60 / 90 / 120 分钟重解，结果落盘并做硬断言 */
import fs from "node:fs";

const post = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
};

const verify = await post("http://127.0.0.1:3000/api/verify", { cityName: "济南", categories: ["文创街区"] });
const report = verify.report;
if (!report?.ok) {
  console.log("核验失败", JSON.stringify(report).slice(0, 300));
  process.exit(1);
}
const factsId = report.facts.factsId;
const results = [];
console.log("默认路线：", report.itinerary.stops.map((s) => s.name).join(" → "), `（共 ${report.itinerary.totalMinutes} 分钟）\n`);

for (const maxTotalMinutes of [60, 90, 120]) {
  const result = await post("http://127.0.0.1:3000/api/resolve", { factsId, maxTotalMinutes, stayMinutes: 30 });
  if (result.ok) {
    const it = result.itinerary;
    results.push({
      maxTotalMinutes,
      ok: true,
      stops: it.stops.map((s) => s.name),
      stopCount: it.stops.length,
      totalMinutes: it.totalMinutes,
      totalWalkMinutes: it.totalWalkMinutes,
      budgetMinutes: it.budgetMinutes,
      newAmapCalls: result.cost?.newAmapCalls ?? null,
    });
    console.log(`${maxTotalMinutes} 分钟 → ${it.stops.length} 站，总时长 ${it.totalMinutes} 分钟（纯步行 ${it.totalWalkMinutes} 分钟）：${it.stops.map((s) => s.name).join(" → ")}`);
  } else {
    results.push({ maxTotalMinutes, ok: false, reason: result.reason ?? result.error, newAmapCalls: result.cost?.newAmapCalls ?? null });
    console.log(`${maxTotalMinutes} 分钟 → 排不出：${result.reason ?? result.error}`);
  }
}

const failures = [];
for (const item of results) {
  if (item.ok && item.totalMinutes > item.maxTotalMinutes) failures.push(`${item.maxTotalMinutes} 分钟档总时长 ${item.totalMinutes} 超出上限`);
  if (item.newAmapCalls !== 0) failures.push(`${item.maxTotalMinutes} 分钟档重解新增调用 ${item.newAmapCalls}`);
}
const stops90 = results.find((r) => r.maxTotalMinutes === 90)?.stopCount ?? 0;
const stops120 = results.find((r) => r.maxTotalMinutes === 120)?.stopCount ?? 0;
if (!(stops120 > stops90)) failures.push(`站数没有随档位增加：90 分钟 ${stops90} 站，120 分钟 ${stops120} 站`);

fs.writeFileSync(new URL("./total-minutes-check.json", import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  city: "济南",
  factsId,
  baseline: { stops: report.itinerary.stops.map((s) => s.name), totalMinutes: report.itinerary.totalMinutes },
  results,
  failures,
}, null, 2));
console.log(`\n结果已写入 evidence/total-minutes-check.json${failures.length ? `，${failures.length} 项断言失败` : "，断言全部通过"}`);
process.exit(failures.length ? 1 : 0);
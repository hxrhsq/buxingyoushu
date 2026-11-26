/** 取三城实测起点并落盘：固定默认起点的名称、地址、坐标来自这里 */
import fs from "node:fs";

const points = [];
for (const cityName of ["济南", "南京", "扬州"]) {
  const response = await fetch("http://127.0.0.1:3000/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cityName, categories: ["文创街区"] }),
  });
  const { report } = await response.json();
  if (!report?.ok) {
    console.log(cityName, "核验失败", report?.error ?? "");
    points.push({ city: cityName, ok: false, error: report?.error ?? "核验失败" });
    continue;
  }
  const point = {
    city: cityName,
    ok: true,
    name: report.start.name,
    address: report.start.address,
    position: report.start.position,
    stopCount: report.itinerary.stops.length,
    totalMinutes: report.itinerary.totalMinutes,
  };
  points.push(point);
  console.log(JSON.stringify(point));
}

fs.writeFileSync(new URL("./start-points-check.json", import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  points,
}, null, 2));
console.log("结果已写入 evidence/start-points-check.json");
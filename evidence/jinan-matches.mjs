/** 济南候选池与默认路线对照：为「必去」测试挑一个候选池内、但不在默认路线里的站 */
const response = await fetch("http://127.0.0.1:3000/api/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ cityName: "济南", categories: ["文创街区"] }),
});
const { report } = await response.json();
if (!report?.ok) {
  console.log("核验失败", JSON.stringify(report).slice(0, 300));
  process.exit(1);
}
console.log("默认路线：", report.itinerary.stops.map((s) => s.name).join(" → "));
console.log("\n候选池：");
for (const match of report.matches) {
  console.log("-", match.name, "| routable", match.routable, "| id", match.flyaiId);
}
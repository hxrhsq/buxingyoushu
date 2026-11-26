/** 检查路线是否异常绕路：逐段对比「直线距离」与「高德实测步行距离」 */
function haversineMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const response = await fetch("http://127.0.0.1:3000/api/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ cityName: "济南", categories: ["文创街区"], startKeyword: process.argv[2] }),
});
const { report } = await response.json();
if (!report?.ok) {
  console.log("核验失败", JSON.stringify(report).slice(0, 300));
  process.exit(1);
}
console.log("起点：", report.start.name);
for (const leg of report.itinerary.legs) {
  const straight = Math.round(haversineMeters(leg.from, leg.to));
  const ratio = straight > 0 ? (leg.distanceMeters / straight).toFixed(2) : "n/a";
  console.log(`${leg.fromName} → ${leg.toName}：实测 ${leg.distanceMeters} 米 / 直线 ${straight} 米 = ${ratio} 倍`);
}
/**
 * 高德步行分段字段实测（只花 1 次 walking）：
 * 先用扬州已缓存的核验结果取一段真实起终点，再调 /v5/direction/walking?show_fields=cost,polyline,navi。
 * 不修改项目代码；密钥只从 .env.local 读取，不打印。
 */
import fs from "node:fs";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = envText.match(/^AMAP_WEB_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error("没读到 AMAP_WEB_KEY");

const verify = await fetch("http://127.0.0.1:3000/api/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ cityName: "扬州", categories: ["文创街区"] }),
}).then((r) => r.json());
const leg = verify.report?.itinerary?.legs?.[0];
if (!leg) throw new Error("缓存里没有扬州路线，请先核验扬州");
console.log("实测路段", leg.fromName, "→", leg.toName);

const params = new URLSearchParams({
  origin: `${leg.from.lng},${leg.from.lat}`,
  destination: `${leg.to.lng},${leg.to.lat}`,
  show_fields: "cost,polyline,navi",
  key,
});
const data = await fetch(`https://restapi.amap.com/v5/direction/walking?${params}`).then((r) => r.json());
const path = data.route?.paths?.[0];
if (!path) {
  console.log("没有 paths", JSON.stringify(data).slice(0, 300));
  process.exit(1);
}
const steps = path.steps ?? [];
console.log("steps 数", steps.length, "| path 字段", Object.keys(path).join(","));
const fieldSets = new Set();
for (const step of steps) Object.keys(step).forEach((k) => fieldSets.add(k));
console.log("step 字段全集", [...fieldSets].sort().join(","));
steps.slice(0, 6).forEach((step, i) => {
  console.log(`\n[${i + 1}]`, JSON.stringify({
    instruction: step.instruction,
    distance: step.distance,
    duration: step.duration,
    road_name: step.road_name,
    orientation: step.orientation,
    action: step.action,
    assistant_action: step.assistant_action,
    walk_type: step.walk_type,
    hasPolyline: Boolean(step.polyline),
  }, null, 1));
});
fs.writeFileSync(new URL("./amap-steps-check.json", import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  leg: { from: leg.fromName, to: leg.toName },
  stepCount: steps.length,
  stepFields: [...fieldSets].sort(),
  sample: steps.slice(0, 6),
}, null, 2));
console.log("\n结果已写入 evidence/amap-steps-check.json");
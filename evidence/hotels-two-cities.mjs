/**
 * 单城酒店实测并落盘：先核验拿到首站坐标，再调 /api/hotels。
 * 用法：node evidence/hotels-two-cities.mjs 南京
 * 会真实调用：核验一次（若服务端无缓存）+ 酒店 1 次 flyai + 最多 3 次 walking。
 */
import fs from "node:fs";

const cityName = process.argv[2];
if (!cityName) {
  console.error("用法：node evidence/hotels-two-cities.mjs 南京");
  process.exit(1);
}
const post = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
};

const verify = await post("http://127.0.0.1:3000/api/verify", { cityName, categories: ["文创街区"] });
const report = verify.json.report;
if (!report?.ok) {
  console.log("核验失败", verify.status, JSON.stringify(verify.json).slice(0, 300));
  process.exit(1);
}
const first = report.itinerary.stops[0];
console.log(`${cityName} 首站`, first.name, JSON.stringify(first.position));

const hotels = await post("http://127.0.0.1:3000/api/hotels", {
  cityName,
  stopName: first.name,
  stopPosition: first.position,
});
console.log("酒店HTTP", hotels.status, "ok", hotels.json.ok, "error", hotels.json.error, "cost", JSON.stringify(hotels.json.cost));
for (const hotel of hotels.json.hotels ?? []) {
  console.log("-", hotel.name, "|", hotel.address, "|", hotel.price, "| 评分", hotel.rate, "| 有图", Boolean(hotel.mainPic), "|",
    hotel.walk ? `${hotel.walk.durationMinutes}分钟/${hotel.walk.distanceMeters}米` : hotel.walkError);
}
const status = await fetch("http://127.0.0.1:3000/api/verify", { cache: "no-store" }).then((r) => r.json());
console.log("计数器 place", `${status.placeHourlyUsed}/${status.placeHourlyCap}`, "walking", `${status.walkingHourlyUsed}/${status.walkingHourlyCap}`);

fs.writeFileSync(new URL(`./hotels-${cityName}.json`, import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  city: cityName,
  firstStop: { name: first.name, position: first.position },
  httpStatus: hotels.status,
  ok: hotels.json.ok,
  error: hotels.json.error ?? null,
  cost: hotels.json.cost,
  hotels: (hotels.json.hotels ?? []).map((hotel) => ({
    name: hotel.name,
    address: hotel.address,
    price: hotel.price,
    rate: hotel.rate,
    hasPhoto: Boolean(hotel.mainPic),
    walk: hotel.walk,
    walkError: hotel.walkError,
  })),
  counters: {
    place: `${status.placeHourlyUsed}/${status.placeHourlyCap}`,
    walking: `${status.walkingHourlyUsed}/${status.walkingHourlyCap}`,
  },
}, null, 2));
console.log(`结果已写入 evidence/hotels-${cityName}.json`);
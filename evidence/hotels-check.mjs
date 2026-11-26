/** 酒店接口实测：node evidence/hotels-check.mjs [stopName]（默认曲水亭街，济南首站坐标） */
const stopName = process.argv[2] ?? "曲水亭街";
const body = { cityName: "济南", stopName, stopPosition: { lat: 36.66927, lng: 117.023472 } };
const response = await fetch("http://127.0.0.1:3000/api/hotels", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const payload = await response.json();
console.log("HTTP", response.status, "ok", payload.ok, "error", payload.error, "cost", JSON.stringify(payload.cost));
for (const hotel of payload.hotels ?? []) {
  console.log("-", hotel.name, "|", hotel.address, "|", hotel.price, "|",
    hotel.walk ? `${hotel.walk.durationMinutes}分钟/${hotel.walk.distanceMeters}米` : hotel.walkError);
}
/** 线上南京生成失败诊断：直接调 https://bxys.peiqirui.com/api/verify，对照济南 */
const BASE = process.env.BASE_URL ?? "https://bxys.peiqirui.com";
for (const cityName of ["南京", "济南"]) {
  try {
    const response = await fetch(`${BASE}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityName, categories: ["文创街区"] }),
    });
    const payload = await response.json();
    const report = payload.report;
    console.log(`\n=== ${cityName} HTTP ${response.status} ===`);
    if (!report) {
      console.log("无 report：", JSON.stringify(payload).slice(0, 500));
      continue;
    }
    console.log("ok:", report.ok, "| error:", report.error ?? report.failure?.reason ?? null);
    console.log("start:", report.start?.name, "| 候选:", report.candidateCount, "| 可规划:", report.routableCount);
    if (report.itinerary) console.log("路线站数:", report.itinerary.stops?.length);
    for (const rejection of (report.rejections ?? []).slice(0, 6)) {
      console.log("-", rejection.name, ":", String(rejection.reason).slice(0, 90));
    }
  } catch (caught) {
    console.log(`\n=== ${cityName} 请求异常 ===`, caught.message);
  }
}
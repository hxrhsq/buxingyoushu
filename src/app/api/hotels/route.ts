import { SUPPORTED_CITIES } from "@/lib/discovery";
import type { LatLng } from "@/lib/types";
import { hotelsNearStop } from "@/lib/server/hotels";

function toLatLng(value: unknown): LatLng | null {
  if (!value || typeof value !== "object") return null;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** 路线第一站的周边住宿。body: { cityName, stopName, stopPosition:{lat,lng} } */
export async function POST(request: Request) {
  let body: { cityName?: unknown; stopName?: unknown; stopPosition?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const cityName = typeof body.cityName === "string" ? body.cityName.trim() : "";
  if (!SUPPORTED_CITIES.includes(cityName)) {
    return Response.json({ error: `目前只支持${SUPPORTED_CITIES.join("、")}。` }, { status: 400 });
  }
  const stopName = typeof body.stopName === "string" ? body.stopName.trim() : "";
  if (!stopName || stopName.length > 40 || /[\u0000-\u001f]/.test(stopName)) {
    return Response.json({ error: "stopName 需要是 1–40 个字的站点名。" }, { status: 400 });
  }
  const stopPosition = toLatLng(body.stopPosition);
  if (!stopPosition) {
    return Response.json({ error: "stopPosition 需要是合法的 {lat,lng}。" }, { status: 400 });
  }

  const result = await hotelsNearStop(cityName, stopName, stopPosition);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
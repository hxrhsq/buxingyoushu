import { haversineMeters } from "@/lib/geo";
import type { HotelOffer, HotelsResult } from "@/lib/hotels";
import type { LatLng } from "@/lib/types";
import { planWalking } from "./amap";
import { describeCliEntry, resolveCliEntry, runFlyAiHotelSearch, tail } from "./flyai-cli";

if (typeof window !== "undefined") {
  throw new Error("lib/server/hotels 只能在 Next.js 服务端加载。");
}

/** 只推荐 3 家：够选，也把每家一次的步行实测控制在 3 次以内。 */
const HOTEL_COUNT = 3;
const CACHE_TTL_MS = 10 * 60 * 1000;
const HOURLY_FLYAI_CAP = 6;
const HOUR_MS = 60 * 60 * 1000;

const cache = new Map<string, { at: number; result: HotelsResult }>();
const flyaiStamps: number[] = [];

function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toHttpUrl(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function toLatLng(latitude: unknown, longitude: unknown): LatLng | null {
  const latText = toText(latitude);
  const lngText = toText(longitude);
  if (!latText || !lngText) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function failed(error: string, firstStopName: string): HotelsResult {
  return { ok: false, error, firstStopName, hotels: [], cost: { flyaiCalls: 0, amapWalkingCalls: 0, cacheHit: false } };
}

/**
 * 路线第一站周边的住宿：飞猪按景点找酒店，我们先按直线距离取前 3 家，
 * 再逐家做高德步行实测。佣金字段完全不读；接口没有的电梯/早餐一律不写。
 */
export async function hotelsNearStop(
  cityName: string,
  stopName: string,
  stopPosition: LatLng,
): Promise<HotelsResult> {
  const cacheKey = `${cityName}|${stopName}|${stopPosition.lat.toFixed(6)},${stopPosition.lng.toFixed(6)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.result, cost: { flyaiCalls: 0, amapWalkingCalls: 0, cacheHit: true } };
  }

  const apiKey = process.env.FLYAI_API_KEY?.trim();
  if (!apiKey) return failed("服务端没有读到 FLYAI_API_KEY，无法查询酒店。", stopName);
  if (!resolveCliEntry()) return failed("服务端找不到 @fly-ai/flyai-cli 的入口文件。", stopName);

  while (flyaiStamps.length && Date.now() - flyaiStamps[0] > HOUR_MS) flyaiStamps.shift();
  if (flyaiStamps.length >= HOURLY_FLYAI_CAP) {
    return failed(`本小时酒店查询已达上限（${HOURLY_FLYAI_CAP} 次），稍后再试。`, stopName);
  }

  flyaiStamps.push(Date.now());
  const run = await runFlyAiHotelSearch({ destName: cityName, keyword: stopName, apiKey });
  if (run.error) return failed(`酒店查询失败：${run.error}`, stopName);

  let payload: { status?: number; message?: string; data?: { itemList?: unknown[] } };
  try {
    payload = JSON.parse(run.stdout) as typeof payload;
  } catch {
    return failed(`酒店返回不是合法 JSON：${tail(run.stdout, 160)}`, stopName);
  }
  if (payload.status !== 0) {
    return failed(`飞猪酒店返回非成功状态：status=${payload.status} message=${payload.message ?? "无"}`, stopName);
  }

  const rawList = Array.isArray(payload.data?.itemList) ? payload.data?.itemList ?? [] : [];
  const candidates = rawList.flatMap((raw): HotelOffer[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const name = toText(item.name);
    const position = toLatLng(item.latitude, item.longitude);
    if (!name || !position) return [];
    return [{
      shId: toText(item.shId) ?? "",
      name,
      address: toText(item.address),
      rate: toText(item.rate),
      price: toText(item.price),
      star: toText(item.star),
      mainPic: toHttpUrl(item.mainPic),
      detailUrl: toHttpUrl(item.detailUrl),
      position,
      walk: null,
      walkError: null,
    }];
  });

  if (!candidates.length) return failed("飞猪没有返回带坐标的酒店，无法按步行排序。", stopName);

  const nearest = candidates
    .map((hotel) => ({ hotel, meters: haversineMeters(hotel.position, stopPosition) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, HOTEL_COUNT);

  let amapWalkingCalls = 0;
  const hotels: HotelOffer[] = [];
  for (const { hotel } of nearest) {
    const walk = await planWalking(hotel.position, stopPosition);
    if (!walk.entry.fromCache) amapWalkingCalls += 1;
    if (walk.ok && walk.data) {
      hotels.push({
        ...hotel,
        walk: {
          distanceMeters: walk.data.distanceMeters,
          durationMinutes: Math.max(1, Math.round(walk.data.durationSeconds / 60)),
        },
      });
    } else {
      hotels.push({ ...hotel, walkError: walk.error ?? "这段步行没测成" });
    }
  }
  hotels.sort((a, b) => (a.walk?.durationMinutes ?? Infinity) - (b.walk?.durationMinutes ?? Infinity));

  const result: HotelsResult = {
    ok: true,
    error: null,
    firstStopName: stopName,
    hotels,
    cost: { flyaiCalls: 1, amapWalkingCalls, cacheHit: false },
  };
  cache.set(cacheKey, { at: Date.now(), result });
  console.log(`[hotels] ${cityName} ${stopName}：${hotels.length} 家，flyai 1 次、walking 新增 ${amapWalkingCalls} 次（${describeCliEntry(resolveCliEntry()) ?? "cli"}）`);
  return result;
}
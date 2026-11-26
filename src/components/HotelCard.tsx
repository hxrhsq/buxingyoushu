"use client";

import { useEffect, useState } from "react";
import { HOTEL_PROMO_NOTE, type HotelsResult } from "@/lib/hotels";
import type { LatLng } from "@/lib/types";
import { QrCodeLink } from "@/components/QrCodeLink";

/**
 * 路线第一站的周边住宿。排序只看「到第一站的步行实测」，不看佣金；
 * 接口没给的电梯/早餐/可订状态一律不写。查不到就安静收起，不影响路线本身。
 */
export function HotelCard({ cityName, firstStop }: { cityName: string; firstStop: { name: string; position: LatLng } }) {
  const [result, setResult] = useState<HotelsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/hotels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityName, stopName: firstStop.name, stopPosition: firstStop.position }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as HotelsResult & { error?: string };
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          setResult(null);
          setError(payload.error ?? `酒店查询失败（HTTP ${response.status}）`);
          return;
        }
        setError(null);
        setResult(payload);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(`酒店查询没连上：${caught.message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cityName, firstStop.name, firstStop.position]);

  if (loading) {
    return <p className="rounded-xl border border-line bg-card px-3 py-2 text-[11px] text-ink-500">正在找第一站附近的住宿…</p>;
  }
  if (error || !result || result.hotels.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-card px-3 py-2 text-[11px] leading-relaxed text-ink-500">
        住一晚（可选）：这次没查到第一站附近的酒店{error ? `（${error}）` : ""}，不影响上面的路线。
      </p>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-card p-3" aria-label="住一晚">
      <h3 className="text-xs font-semibold text-ink-900">住一晚（可选）</h3>
      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-500">
        按到第一站「{result.firstStopName}」的步行排序。
      </p>
      <ul className="mt-2 space-y-2">
        {result.hotels.map((hotel) => (
          <li key={hotel.shId || hotel.name} className="rounded-lg border border-line bg-paper px-3 py-2">
            <div className="flex items-start gap-2">
              {hotel.mainPic && (
                // eslint-disable-next-line @next/next/no-img-element -- 飞猪外链图，直接由浏览器加载；走 next/image 服务端优化容易被防盗链挡住
                <img
                  src={hotel.mainPic}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-14 shrink-0 rounded-lg object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
              <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-5 text-ink-900">{hotel.name}</p>
              {hotel.price && <span className="shrink-0 text-xs font-semibold text-brand-700">{hotel.price}</span>}
            </div>
            <p className="mt-0.5 text-[10px] text-ink-500">
              {[hotel.star, hotel.rate ? `评分 ${hotel.rate}` : null].filter(Boolean).join(" · ")}
            </p>
            {hotel.address && <p className="mt-0.5 text-[10px] leading-relaxed text-ink-500">{hotel.address}</p>}
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-ink-700">
                {hotel.walk
                  ? `到第一站步行 ${hotel.walk.durationMinutes} 分钟 · ${hotel.walk.distanceMeters} 米`
                  : "到第一站的步行没测成"}
              </span>

            </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {result.hotels[0]?.detailUrl && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-2">
          <QrCodeLink url={result.hotels[0].detailUrl} label="扫码订住宿" size={44} />
          <span className="text-[10px] leading-relaxed text-ink-500">子女扫码，就能在飞猪订这家。</span>
        </div>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-ink-300">{HOTEL_PROMO_NOTE}</p>
    </section>
  );
}
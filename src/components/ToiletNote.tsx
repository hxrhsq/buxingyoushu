import type { ToiletLookup } from "@/lib/types";

/**
 * 行程卡上的一行无障碍洗手间。
 *
 * 只写高德真实标注的点与直线距离；找不到就什么都不显示（不写「附近有」这种含糊话）。
 * 口径与免责说明只进参赛材料，不进用户界面。
 */
export function StopToiletLine({
  lookup,
  stopName,
}: {
  lookup: ToiletLookup | null | undefined;
  stopName: string;
}) {
  if (!lookup) return null;
  const hit = lookup.nearest.find((item) => item.anchorName === stopName);
  if (!hit) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1 text-[9px] leading-relaxed text-ink-500">
      <span className="rounded bg-brand-600/10 px-1 py-px font-medium text-brand-700">无障碍洗手间</span>
      <span className="text-ink-400">
        {hit.toiletName} · 直线 {hit.straightLineMeters} 米
      </span>
    </span>
  );
}


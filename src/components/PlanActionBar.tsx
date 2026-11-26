"use client";

import type { AgentController } from "@/hooks/useAgent";
import type { VerifiedRoute } from "@/hooks/useVerifiedRoute";
import { sameCategories, type FlyAiPoiCategory } from "@/lib/discovery";
import { PreflightQuestion } from "@/components/PreflightQuestion";

/**
 * 首屏就固定钉在底部的一条主流程按钮，手机上也一直可见：
 * 没路线时只有「生成我的路线」，出路线之后换成「我到了」（讲解）。
 * 这里不放任何技术说明——同一批动作在上方两个面板里各有详细版本，这里只负责「下一步点哪」。
 */
export function PlanActionBar({
  route,
  agent,
  categories,
  jointLocked = false,
  itineraryCategories,
  preflightMinutes,
  onPreflightChange,
  placeConditions,
  onTogglePlaceCondition,
  startKeyword,
  cityName,
  stayMinutes,
}: {
  route: VerifiedRoute;
  agent: AgentController;
  categories: FlyAiPoiCategory[];
  /** 双方已经确认了正式版本：改选类别不会修改它 */
  jointLocked?: boolean;
  itineraryCategories: FlyAiPoiCategory[];
  /**
   * 生成路线之前先问的那一句：爸妈全程一共能走多久。
   * 三种状态不能混：undefined = 还没回答（任何按钮都不高亮）；null = 用户答了「不确定」；数字 = 分钟。
   */
  preflightMinutes?: number | null;
  onPreflightChange?: (minutes: number | null) => void;
  placeConditions?: Record<string, "must" | "never">;
  onTogglePlaceCondition?: (text: string, kind: "must" | "never") => void;
  /** 用户显式换起点时的新关键词；不传则用城市注册表里的固定起点 */
  startKeyword?: string;
  /** 已理解条件里展示的城市与每站停留，和真正发给求解器的值一致 */
  cityName: string;
  stayMinutes: number;
}) {
  const itinerary = agent.activeItinerary;
  const stops = itinerary?.stops ?? [];
  const hasRoute = stops.length > 0;
  const verifying = route.phase === "loading";
  const currentIndex = stops.findIndex((stop) => stop.flyaiId === agent.selectedStopId);
  const current = currentIndex >= 0 ? stops[currentIndex] : null;

  if (!hasRoute) {
    return (
      <Bar>
        {onPreflightChange && (
          <PreflightQuestion
            minutes={preflightMinutes}
            onChange={onPreflightChange}
            disabled={verifying}
            placeConditions={placeConditions}
            onTogglePlaceCondition={onTogglePlaceCondition}
          />
        )}
        <div className="mb-2 rounded-lg border border-line bg-paper px-2.5 py-2 text-[11px] leading-relaxed text-ink-500">
          已理解：{cityName} · {preflightMinutes === undefined ? "时间待选" : preflightMinutes === null ? "时间不限" : `${preflightMinutes} 分钟（含逛和休息）`}
          {" · "}集合点{startKeyword || "默认"} · 每站 {stayMinutes} 分钟
          {Object.entries(placeConditions ?? {}).map(([text, kind]) => ` · ${kind === "must" ? "必去" : "不去"}${text}`).join("")}
        </div>
        <button
          type="button"
          onClick={() => void route.verify(categories, startKeyword)}
          disabled={verifying}
          className="w-full rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? "正在实测路线…" : "按这个条件生成路线"}
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          {verifying ? "正在实测，请稍等。" : "真实地点，逐段实测步行。"}
        </p>
      </Bar>
    );
  }

  return (
    <Bar>
      {!sameCategories(itineraryCategories, categories) && <p className="mb-2 rounded-lg bg-paper px-2 py-1.5 text-[11px] leading-relaxed text-ink-500">
        当前路线来自「{itineraryCategories.join(" + ")}」；已改选「{categories.join(" + ")}」。
        {jointLocked ? "改选不会修改双方确认版本。" : "新类别尚未生成，当前仍使用原路线。"}
      </p>}
      {/* 「我到了」已内嵌到每一站的卡片里；这里只留一行状态，不再放整条横幅。
          点哪一站就是哪一站的讲解，不需要先在这里选站。 */}
      <p className="text-[11px] leading-relaxed text-ink-500">
        在下方每站点「我到了」听讲解。
        {current ? ` 当前看第 ${currentIndex + 1} 站 · ${current.name}。` : ""}
        {" "}全程 {stops.length} 站 / {itinerary!.totalMinutes} 分钟，已到达 {agent.arrivedStopIds.length} 站。
      </p>
    </Bar>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card/95 p-3 shadow-[0_-2px_12px_rgba(16,24,40,0.08)] backdrop-blur">
      {children}
    </div>
  );
}

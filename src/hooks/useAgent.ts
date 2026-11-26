"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAgentStatus, requestAgent } from "@/lib/agent-client";
import { parseCategories } from "@/lib/discovery";
import {
  saveSnapshot,
  useSessionSnapshot,
  AGENT_SNAPSHOT_KEY,
} from "@/lib/session-snapshot";
import { DEFAULT_VERIFY_CATEGORIES } from "@/lib/verification";
import type {
  AdjustResponse,
  AgentServerStatus,
  ExploreResponse,
  VerifyReport,
  VerifiedItinerary,
} from "@/lib/types";

export type AgentPhase = "idle" | "loading" | "done";

interface AgentState {
  phase: AgentPhase;
  error: string | null;
  /** 这次回合是替哪一站买的；讲解与失败提示都只挂在这一站的卡片下 */
  stopId: string | null;
}

/** 智能体正在真实生成的文字（未校验）＋已经等了多久，只用于进度反馈。 */
export interface LiveTurn {
  text: string;
  waitedMs: number;
  /** 浏览器发起请求的时刻，用来和服务端凭证里的 totalMs 对照 */
  startedAt: number | null;
}

const EMPTY_LIVE: LiveTurn = { text: "", waitedMs: 0, startedAt: null };

/** 刷新前这一段的状态。只存成功过的结果，失败提示不跨刷新保留。 */
interface AgentSnapshot {
  token: string | null;
  pickedStopId: string | null;
  arrivedStopIds: string[];
  arrival: ExploreResponse | null;
  adjustment: AdjustResponse | null;
}

/**
 * 「我到了」与「少走一点」都走这里。
 * 会话票据（token）只是浏览器侧的随机标识，真实的百炼 Session ID 永远留在服务端。
 * 进度会写进 sessionStorage（随标签页关闭即消失，不是 localStorage），
 * 这样刷新页面后还在同一趟旅行里，不用重新点一遍。
 */
export function useAgent(
  city: string,
  interests: string[],
  report: VerifyReport | null,
  /**
   * 双人模式：把这条协商的编号与本方凭据交给服务端，让它读双方确认的正式版本。
   * 不传就是单人链路，行为与之前完全一致。
   */
  plan: { planId: string; token: string; itinerary?: VerifiedItinerary } | null = null,
  /** 已进入双人协商但还没有可执行的正式版本：不能退回单人会话或旧调整。 */
  executionBlocked = false,
) {
  const [tokenOverride, setToken] = useState<string | null>(null);
  const [pickedOverride, setPickedStopId] = useState<string | null>(null);
  const [arrived, setArrived] = useState<AgentState>({ phase: "idle", error: null, stopId: null });
  const [arrivalOverride, setArrival] = useState<ExploreResponse | null>(null);
  const [status, setStatus] = useState<AgentServerStatus | null>(null);
  /** 用户在本轮里手动确认过到达的站点（flyaiId）。只是模拟到达，不是真实 GPS。 */
  const [arrivedOverride, setArrivedStopIds] = useState<string[]>([]);
  const [live, setLive] = useState<LiveTurn>(EMPTY_LIVE);

  useEffect(() => {
    let cancelled = false;
    void fetchAgentStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 当前生效的行程＝「少走一点」通过校验后的那一份，没有就是核验结果。
  // 地图、行程卡片、可点选的站全部以它为准，避免出现「界面一套、地图另一套」。
  // 刷新前的进度从 sessionStorage 快照里取（useSyncExternalStore：水合后才拿到值）。
  const snapshot = useSessionSnapshot<AgentSnapshot>(AGENT_SNAPSHOT_KEY);
  const token = tokenOverride ?? snapshot?.token ?? null;
  const pickedStopId = pickedOverride ?? snapshot?.pickedStopId ?? null;

  const reportKey = report?.itinerary?.stops.map((stop) => stop.flyaiId).join(",") ?? "";
  // 「少走一点」入口已删除（D1）：不再从刷新前的快照里恢复智能体给的调整路线，
  // 否则一份不遵守用户分钟条件的旧路线会悄悄变成「当前生效路线」。
  const activeItinerary = executionBlocked ? null : (plan?.itinerary ?? report?.itinerary ?? null);
  const stops = activeItinerary?.stops ?? [];
  const narrationStops = stops.length ? stops : (report?.itinerary?.stops ?? []);
  const anyArrival = arrivalOverride ?? (snapshot?.arrival?.ok ? snapshot.arrival : null);
  const arrival =
    !executionBlocked && anyArrival && anyArrival.stopName && narrationStops.some((stop) => stop.name === anyArrival.stopName)
      ? anyArrival
      : null;
  const arrivedStopIds = useMemo(() => {
    const all = arrivedOverride.length ? arrivedOverride : (snapshot?.arrivedStopIds ?? []);
    const ids = new Set((activeItinerary?.stops ?? []).map((stop) => stop.flyaiId));
    return all.filter((id) => ids.has(id));
  }, [activeItinerary, arrivedOverride, snapshot]);
  /** 屏幕上这一段是本标签页刷新前跑出来的，不是这次点的 */
  const restored = arrival !== null && arrived.phase === "idle";

  // 服务端只有按同样的类别重新核验，才会读到界面上这一条路线
  const categories = useMemo(() => {
    const parsed = parseCategories(report?.categories ?? []);
    return parsed.length ? parsed : [...DEFAULT_VERIFY_CATEGORIES];
  }, [report]);
  const selectedStopId = stops.some((stop) => stop.flyaiId === pickedStopId)
    ? pickedStopId
    : (stops[0]?.flyaiId ?? null);

  // 到达过的站列表每次渲染都是新数组，所以用内容当依赖，避免写入效果每帧都跑一遍
  const arrivedKey = arrivedStopIds.join(",");
  useEffect(() => {
    if (!token && !arrival && arrivedKey === "") return;
    saveSnapshot(AGENT_SNAPSHOT_KEY, {
      token,
      pickedStopId,
      arrivedStopIds: arrivedKey ? arrivedKey.split(",") : [],
      arrival,
    });
  }, [arrival, arrivedKey, pickedStopId, token]);

  const refreshStatus = useCallback(async () => {
    setStatus(await fetchAgentStatus());
  }, []);

  const startedAt = useRef<number>(0);
  /** 一次点击＝一个付费回合。setState 是异步的，连点两下会发出两个回合，所以这里用 ref 同步挡住。 */
  const inFlight = useRef<boolean>(false);
  const busy = arrived.phase === "loading";

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      setLive((prev) => (prev.startedAt === null ? prev : { ...prev, waitedMs: Date.now() - prev.startedAt }));
    }, 200);
    return () => clearInterval(timer);
  }, [busy]);

  const send = useCallback(
    async (stopIdOverride: string | null = null) => {
      // 卡片上的按钮在同一次点击里既改选中站、又发请求。setState 要等下一次渲染才生效，
      // 闭包里的 selectedStopId 还是上一站，所以点击方必须把目标站直接传进来，
      // 否则这一个付费回合会买到上一站的讲解（界面上一片空白，钱却花了）。
      const targetStopId = stopIdOverride ?? selectedStopId;
      if (executionBlocked) {
        setArrived({ phase: "done", stopId: targetStopId, error: "双人方案尚未正式生效，请先确认同一版本。" });
        return;
      }
      if (inFlight.current) return;
      inFlight.current = true;
      const now = Date.now();
      startedAt.current = now;
      setLive({ text: "", waitedMs: 0, startedAt: now });
      setArrived({ phase: "loading", error: null, stopId: targetStopId });
      try {
        const result = await requestAgent(
          { intent: "arrive", cityName: city, stopId: targetStopId, interests, categories, token, planId: plan ? plan.planId : null },
          (text) => setLive((prev) => ({ ...prev, text: prev.text + text })),
          plan ? plan.token : null,
        );
        setArrival(result as ExploreResponse);
        if (result.ok && targetStopId && !arrivedStopIds.includes(targetStopId)) {
          setArrivedStopIds([...arrivedStopIds, targetStopId]);
        }
        if (typeof result.token === "string") setToken(result.token);
        setArrived({ phase: "done", stopId: targetStopId, error: result.ok ? null : (result.error ?? "百炼没有返回结果。") });
      } catch (caught) {
        setArrived({ phase: "done", stopId: targetStopId, error: caught instanceof Error ? caught.message : String(caught) });
      } finally {
        inFlight.current = false;
        setLive(EMPTY_LIVE);
        await refreshStatus();
      }
    },
    [arrivedStopIds, categories, city, executionBlocked, interests, plan, refreshStatus, selectedStopId, token],
  );

  /** 传入 stopId＝「就是这一站」，卡片按钮必须传，否则会买到上一站的讲解 */
  const arrive = useCallback((stopId?: string | null) => send(stopId ?? null), [send]);

  return {
    status,
    tokenMasked: status && token ? token.slice(0, 8) : null,
    activeItinerary,
    selectedStopId,
    selectStop: setPickedStopId,
    arrived,
    arrival,
    arrivedStopIds,
    restored,
    live,
    arrive,
    /** 上一次是失败态才允许重试；重试就是再买一个回合，但不会把旅行状态推进两遍 */
    canRetryArrive: arrived.phase === "done" && arrived.error !== null,
    hasReport: stops.length > 0,
  };
}

export type AgentController = ReturnType<typeof useAgent>;

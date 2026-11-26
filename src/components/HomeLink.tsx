"use client";

import { AGENT_SNAPSHOT_KEY, clearSnapshot, ROUTE_SNAPSHOT_KEY } from "@/lib/session-snapshot";

/**
 * 生成路线之后也能回到首屏：清掉本标签页的路线与讲解快照再整页回 `/`，
 * 否则快照会把旧路线恢复出来，首屏的城市三选一就永远看不到。
 */
export function HomeLink() {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- 必须整页重载：客户端导航会保留旧路线的本地状态
    <a
      href="/"
      onClick={() => {
        clearSnapshot(ROUTE_SNAPSHOT_KEY);
        clearSnapshot(AGENT_SNAPSHOT_KEY);
      }}
      className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-500 underline decoration-line underline-offset-4 transition hover:text-brand-700"
    >
      返回首页
    </a>
  );
}
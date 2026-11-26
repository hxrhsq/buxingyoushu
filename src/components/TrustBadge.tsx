/**
 * 顶部唯一的状态标识：有真实路线时显示「✓ 真实路网核验 · N 站 · M 分钟」。
 * 纯展示，不挂说明弹窗——口径与声明只进参赛材料，不进用户界面。
 */
export function TrustBadge({ summary }: { summary: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700"
      aria-label={`当前生效路线：真实路网核验${summary ? `，${summary}` : ""}`}
    >
      <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />
      ✓ 真实路网核验
      {summary && <span className="font-normal text-brand-700/70">· {summary}</span>}
    </span>
  );
}

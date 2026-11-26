import type { JourneyContext } from "@/lib/types";
import { formatMinutes } from "@/lib/format";
import { TrustBadge } from "@/components/TrustBadge";
import { HomeLink } from "@/components/HomeLink";

export function SiteHeader({
  context,
  plan,
}: {
  context: JourneyContext;

  /** 有它就说「当前生效路线」是真实核验出来的，顶部数字全部换成这一份的口径。没有真实路线时右侧什么都不显示。 */
  plan: { stops: number; totalMinutes: number; budgetMinutes: number } | null;
}) {
  return (
    <header className="border-b border-line bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-700 font-display text-lg font-bold text-white">
            步
          </span>
          <div>
            <h1 className="font-display text-base leading-tight font-bold tracking-tight text-brand-700">
              步行有数
            </h1>
            <p className="text-xs text-ink-500">每段走得动</p>
          </div>
        </div>

        <div className="hidden h-8 w-px bg-line sm:block" />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-700">
          <span className="font-medium">{context.city}</span>
          <span className="text-ink-300">·</span>
          <span>{context.district}</span>
          <span className="text-ink-300">·</span>
          <span>4 小时漫游</span>
        </div>

        {/* 右侧：有真实路线时给核验标识；「返回首页」始终在，生成路线后也回得去 */}
        <div className="ml-auto flex items-center gap-3">
          {plan && <TrustBadge summary={`${plan.stops} 站 · ${formatMinutes(plan.totalMinutes)}`} />}
          <HomeLink />
        </div>
      </div>
    </header>
  );
}

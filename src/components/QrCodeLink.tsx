"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * 带归因的纸面入口：爸妈拿着路线，子女扫码在飞猪看门票/住宿。
 * 链接直接用飞猪返回的 jumpUrl/detailUrl（归因在编码内层），不自己拼推广参数。
 */
export function QrCodeLink({ url, label, size = 48 }: { url: string; label: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: size * 2 })
      .then((value) => { if (!cancelled) setDataUrl(value); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [url, size]);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="inline-flex shrink-0 flex-col items-center gap-0.5"
      aria-label={label}
    >
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 本地生成的 data URL 二维码，不需要走图片优化
        <img src={dataUrl} alt="" width={size} height={size} className="rounded" />
      ) : (
        <span className="grid size-12 place-items-center rounded border border-line text-[10px] text-ink-300">码</span>
      )}
      <span className="text-[10px] text-brand-700">{label}</span>
    </a>
  );
}
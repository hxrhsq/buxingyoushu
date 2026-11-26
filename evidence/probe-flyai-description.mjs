/**
 * 一次性探查：飞猪 description 里到底有没有「建议游玩时长」。
 * 跑法：node evidence/probe-flyai-description.mjs
 * 注意：会真实 spawn 一次 flyai CLI（1 次调用）。
 */
import fs from "node:fs";
import { spawn } from "node:child_process";

const env = fs.readFileSync(".env.local", "utf8");
const key = (new RegExp("^FLYAI_API_KEY=(.*)$", "m").exec(env)?.[1] ?? "")
  .trim()
  .replace(/^["']|["']$/g, "");

const child = spawn(
  process.execPath,
  ["node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs", "search-poi", "--city-name", "杭州", "--category", "文创街区"],
  { env: { ...process.env, FLYAI_API_KEY: key }, windowsHide: true },
);

let out = "";
child.stdout.on("data", (c) => (out += c));
child.on("close", () => {
  const j = JSON.parse(out);
  const list = j.data.itemList;
  console.log("条目数:", list.length);
  console.log("全部字段:", Object.keys(list[0]).join(", "));
  console.log("");

  // 广度扫描：任何「N 小时 / N 分钟 / 半天」这类表述
  const durationRe = /[0-9一二三四五六七八九十半两几]{1,3}\s*(个)?\s*(小时|分钟|天|日)/g;
  // 明确「建议/游玩/游览 + 时长」的强线索
  const strongRe = /(建议|推荐|游玩|游览|逛|参观)[^。；]{0,12}?([0-9一二三四五六七八九十半两几]{1,3}\s*(个)?\s*(小时|分钟))/g;

  let withAny = 0;
  let withStrong = 0;

  console.log("=== 逐条扫描 ===");
  for (const item of list) {
    const d = String(item.description ?? "");
    const any = d.match(durationRe) ?? [];
    const strong = [...d.matchAll(strongRe)].map((m) => m[0]);
    if (any.length) withAny += 1;
    if (strong.length) withStrong += 1;
    console.log(`${item.name}`);
    console.log(`  长度 ${d.length} | 任意时长词 ${any.length ? any.join(" / ") : "无"} | 强线索 ${strong.length ? strong.join(" ; ") : "无"}`);
  }

  console.log("");
  console.log(`含任意时长词: ${withAny}/${list.length}`);
  console.log(`含「建议游玩 X 小时」这类强线索: ${withStrong}/${list.length}`);

  // 顺带看 ticketInfo / poiLevel 这两个我们没用的字段
  console.log("");
  console.log("=== 未被使用的字段样本 ===");
  for (const item of list.slice(0, 4)) {
    console.log(`${item.name} | ticketInfo=${JSON.stringify(item.ticketInfo)} | poiLevel=${JSON.stringify(item.poiLevel)} | freePoiStatus=${JSON.stringify(item.freePoiStatus)}`);
  }
});

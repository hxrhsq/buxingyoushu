"use client";

import { useState } from "react";
import { JourneyApp } from "@/components/JourneyApp";
import { HOME_CITIES } from "@/lib/verification";

/**
 * 首页城市三选一。切换时用 key 重挂载 JourneyApp：
 * 旧城市的路线、协商与智能体状态全部重来，不会串到新城。
 */
export function HomeShell() {
  const [city, setCity] = useState<string>(HOME_CITIES[0]);
  return <JourneyApp key={city} city={city} onCityChange={setCity} />;
}
import type { LatLng } from "@/lib/types";

/** 一张酒店卡片只暴露这些字段。佣金（commissionMoneyYuan）不进前端、不进排序。 */
export interface HotelOffer {
  shId: string;
  name: string;
  address: string | null;
  /** 飞猪评分（不是佣金率） */
  rate: string | null;
  /** 飞猪返回的参考价，界面必须注明「以飞猪页面为准」 */
  price: string | null;
  star: string | null;
  mainPic: string | null;
  detailUrl: string | null;
  position: LatLng;
  /** 酒店 → 路线第一站的高德实测步行；没测成就是 null，不用直线距离顶替 */
  walk: { distanceMeters: number; durationMinutes: number } | null;
  walkError: string | null;
}

export interface HotelsResult {
  ok: boolean;
  error: string | null;
  firstStopName: string;
  hotels: HotelOffer[];
  cost: { flyaiCalls: number; amapWalkingCalls: number; cacheHit: boolean };
}

export const HOTEL_PROMO_NOTE = "含推广链接，价格与房态以飞猪为准。电梯、早餐请自行核实。";
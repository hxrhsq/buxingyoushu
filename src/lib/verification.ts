import type { FlyAiPoiCategory } from "@/lib/discovery";
import type { LatLng, MatchStatus, OpeningStatus } from "@/lib/types";
import { hangzhouDateKey } from "./hangzhou-time.ts";

/** 浏览器只调这一个站内地址；高德 key 与所有请求都留在服务端。 */
export const VERIFY_ENDPOINT = "/api/verify";

/** 默认城市：首页没选城市时，服务端与界面都按它取值（四小时步行漫游）。 */
export const VERIFY_CITY = "济南";

/** 首页三选一：只放实测满足「单段 ≤900 米还能排 ≥3 站」且默认路线本身就达标的城。 */
export const HOME_CITIES = ["济南", "南京", "扬州"] as const;

/**
 * 城市注册表：核验管线里所有与城市相关的取值都从这里取，
 * 不允许在流程代码里写死某个城市的地名（那是苏州试点前踩过的隐藏耦合）。
 */
export interface CityConfig {
  name: string;
  /** 展示用片区名（行程报告、智能体上下文里出现） */
  districtName: string;
  /** 换起点时用的搜索关键词：用户显式换起点才走高德 POI 搜索 */
  startKeyword: string;
  /** 固定默认起点：名称、地址与坐标都来自实测，避免关键词落错；有它就不再做起点搜索 */
  start?: { name: string; address: string; position: LatLng };
  /** 行政区清单：飞猪地址与高德 adname 的归属比对只认这些名字 */
  districts: string[];
}

export const CITY_CONFIGS: Record<string, CityConfig> = {
  杭州: {
    name: "杭州",
    districtName: "西湖湖滨",
    startKeyword: "湖滨公园",
    districts: [
      "西湖区", "上城区", "拱墅区", "滨江区", "萧山区", "余杭区",
      "临平区", "钱塘区", "富阳区", "临安区", "桐庐县", "淳安县", "建德市",
    ],
  },
  苏州: {
    name: "苏州",
    districtName: "姑苏平江路",
    startKeyword: "平江路",
    districts: [
      "姑苏区", "虎丘区", "吴中区", "相城区", "吴江区",
      "工业园区", "苏州工业园区", "常熟市", "张家港市", "昆山市", "太仓市",
    ],
  },
  青岛: {
    name: "青岛",
    districtName: "市南老城",
    startKeyword: "劈柴院",
    districts: [
      "市南区", "市北区", "李沧区", "崂山区", "黄岛区", "城阳区", "即墨区",
      "西海岸新区", "胶州市", "平度市", "莱西市",
    ],
  },
  扬州: {
    name: "扬州",
    districtName: "广陵古城",
    startKeyword: "东关街",
    start: { name: "扬州东关街", address: "东关街与国庆路交叉口东100米", position: { lat: 32.398188, lng: 119.446821 } },
    districts: [
      "广陵区", "邗江区", "江都区", "宝应县", "仪征市", "高邮市",
    ],
  },
  无锡: {
    name: "无锡",
    districtName: "梁溪古运河",
    startKeyword: "南长街",
    districts: [
      "梁溪区", "锡山区", "惠山区", "滨湖区", "新吴区", "江阴市", "宜兴市",
    ],
  },
  绍兴: {
    name: "绍兴",
    districtName: "越城古街",
    startKeyword: "仓桥直街",
    districts: [
      "越城区", "柯桥区", "上虞区", "新昌县", "诸暨市", "嵊州市",
    ],
  },
  济南: {
    name: "济南",
    districtName: "历下古城",
    startKeyword: "曲水亭街",
    start: { name: "曲水亭街35号院", address: "曲水亭街35号", position: { lat: 36.669152, lng: 117.024244 } },
    districts: [
      "历下区", "市中区", "槐荫区", "天桥区", "历城区", "长清区", "章丘区",
      "济阳区", "莱芜区", "钢城区", "平阴县", "商河县",
    ],
  },
  广州: {
    name: "广州",
    districtName: "荔湾老西关",
    startKeyword: "永庆坊",
    districts: [
      "越秀区", "荔湾区", "海珠区", "天河区", "白云区", "黄埔区", "番禺区",
      "花都区", "南沙区", "增城区", "从化区",
    ],
  },
  西安: {
    name: "西安",
    districtName: "碑林老城",
    startKeyword: "书院门",
    districts: [
      "新城区", "碑林区", "莲湖区", "灞桥区", "未央区", "雁塔区", "阎良区",
      "临潼区", "长安区", "高陵区", "鄠邑区", "蓝田县", "周至县",
    ],
  },
  长沙: {
    name: "长沙",
    districtName: "天心老街",
    startKeyword: "太平街",
    districts: [
      "芙蓉区", "天心区", "岳麓区", "开福区", "雨花区", "望城区",
      "长沙县", "浏阳市", "宁乡市",
    ],
  },
  天津: {
    name: "天津",
    districtName: "南开古街",
    startKeyword: "古文化街",
    districts: [
      "和平区", "河东区", "河西区", "南开区", "河北区", "红桥区", "东丽区",
      "西青区", "津南区", "北辰区", "武清区", "宝坻区", "滨海新区", "宁河区",
      "静海区", "蓟州区",
    ],
  },
  南京: {
    name: "南京",
    districtName: "秦淮老城南",
    startKeyword: "老门东",
    start: { name: "老门东", address: "剪子巷与箍桶巷交汇处剪子巷54号", position: { lat: 32.011604, lng: 118.787645 } },
    districts: [
      "玄武区", "秦淮区", "建邺区", "鼓楼区", "浦口区", "栖霞区", "雨花台区",
      "江宁区", "六合区", "溧水区", "高淳区",
    ],
  },
  福州: {
    name: "福州",
    districtName: "鼓楼三坊七巷",
    startKeyword: "三坊七巷",
    districts: [
      "鼓楼区", "台江区", "仓山区", "马尾区", "晋安区", "长乐区", "闽侯县",
      "连江县", "罗源县", "闽清县", "永泰县", "平潭县", "福清市",
    ],
  },
  宁波: {
    name: "宁波",
    districtName: "海曙南塘老街",
    startKeyword: "南塘老街",
    districts: [
      "海曙区", "江北区", "北仑区", "镇海区", "鄞州区", "奉化区",
      "象山县", "宁海县", "余姚市", "慈溪市",
    ],
  },
  泉州: {
    name: "泉州",
    districtName: "鲤城西街",
    startKeyword: "泉州西街",
    districts: [
      "鲤城区", "丰泽区", "洛江区", "泉港区", "惠安县", "安溪县", "永春县",
      "德化县", "金门县", "石狮市", "晋江市", "南安市",
    ],
  },
  太原: {
    name: "太原",
    districtName: "迎泽钟楼街",
    startKeyword: "太原钟楼街",
    districts: [
      "小店区", "迎泽区", "杏花岭区", "尖草坪区", "万柏林区", "晋源区",
      "清徐县", "阳曲县", "娄烦县", "古交市",
    ],
  },
  沈阳: {
    name: "沈阳",
    districtName: "沈河中街",
    startKeyword: "沈阳中街步行街",
    districts: [
      "和平区", "沈河区", "大东区", "皇姑区", "铁西区", "苏家屯区", "浑南区",
      "沈北新区", "于洪区", "辽中区", "康平县", "法库县", "新民市",
    ],
  },
};

export function cityConfigOf(cityName: string): CityConfig {
  return CITY_CONFIGS[cityName] ?? CITY_CONFIGS[VERIFY_CITY];
}
export const BUDGET_MINUTES = 240;

/**
 * 参与核验的飞猪类别。界面上勾了什么就按勾的核验（单次最多 2 个），
 * 没勾时用这两个：两类各 10 条，正好是验收里说的 20 条候选。
 */
export const DEFAULT_VERIFY_CATEGORIES: FlyAiPoiCategory[] = ["自然风光", "文创街区"];

/** 每个城市的起点关键词由注册表给出，不再有全局写死的起点。 */

/**
 * 停留时间是模拟值：飞猪和高德都不会告诉我们「游客会在这儿待多久」。
 * UI 上必须与高德步行计算结果分开标注。
 */
export const SIMULATED_STAY_MINUTES = 30;

/** 等红灯、找路、临时拍照的余量，同样属于产品设定而非实测。 */
export const BUFFER_MINUTES = 20;

/** 偏差超过这个值只标「可疑」，不判定为错——大型景区不同入口本来就有几百米差。 */
export const DEVIATION_SUSPECT_METERS = 200;

/** 两种坐标系假设至少要比这个差距更明显，才敢说判定成立。 */
export const DATUM_DECISIVE_METERS = 100;

/** 最少凑够几站才叫一条行程。 */
export const MIN_STOPS = 3;
export const MAX_STOPS = 4;

/** 路径规划前按「从起点步行多久」先筛掉太远的，控制两两测量的调用量。 */
export const SHORTLIST_SIZE = 6;

/** 直线距离超过这个值直接淘汰：在杭州行政区划内≠四小时走得到。 */
export const MAX_STRAIGHT_LINE_METERS = 8_000;

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  matched: "已匹配",
  suspicious: "可疑",
  unverified: "未验证",
};

export const OPENING_STATUS_LABELS: Record<OpeningStatus, string> = {
  "open-24h": "全天开放",
  "no-conflict": "营业时间内",
  conflict: "营业时间冲突",
  unknown: "待核实",
};

/**
 * 判定营业时间冲突必须先有一个出发时间。这里固定用 13:00，因为产品设定就是
 * 「半日漫游」＝下午半天；UI 上会明确写出这是假定值而非实测。
 * 不用「当前时间」：深夜跑演示会把所有白天开放的地点全判成营业冲突。
 */
export const ASSUMED_START_HOUR = 13;

export interface TripWindow {
  startAt: Date;
  startMinutes: number;
  endMinutes: number;
}

export function assumedTripWindow(now: Date): TripWindow {
  // 当前杭州场景固定 UTC+08:00；日期按 Asia/Shanghai 取，构造时明确偏移，
  // 不受部署在 UTC 或美西服务器上的 setHours()/默认时区影响。
  const startAt = new Date(`${hangzhouDateKey(now)}T${String(ASSUMED_START_HOUR).padStart(2, "0")}:00:00+08:00`);
  const startMinutes = ASSUMED_START_HOUR * 60;
  return { startAt, startMinutes, endMinutes: startMinutes + BUDGET_MINUTES };
}

/** "HH:MM-HH:MM" / "24小时营业" → 分钟区间；解析不了一律返回 null（＝待核实）。 */
export function parseOpeningWindows(text: string | null): [number, number][] | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, "");
  if (normalized.includes("24小时")) return [[0, 24 * 60]];

  const windows: [number, number][] = [];
  for (const part of normalized.split(/[,，、;；/]/)) {
    const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(part);
    if (!match) continue;
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    if (end <= start) continue;
    windows.push([start, end]);
  }
  return windows.length ? windows : null;
}

/**
 * 行程窗口 [startMinutes, endMinutes) 是否整段落在营业时间之外。
 * 只有完全不相交才算「确认冲突」；部分重叠不算，避免把只是晚开门的地点误杀。
 * 跨天的营业时间（如 22:00-02:00）不做猜测，解析阶段就已丢弃。
 */
export function isWindowClosed(
  windows: [number, number][],
  startMinutes: number,
  endMinutes: number,
): boolean {
  return windows.every(
    ([openStart, openEnd]) => openEnd <= startMinutes || openStart >= endMinutes,
  );
}

/**
 * 飞猪会把行政办公点标成可逛类别：实测「文创街区」第 10 条候选是「馒头山社区居委会」。
 * 这类名字在高德也能同名核实、类型码也落在白名单里，但步行终点会落在办公室门口，
 * 不是能逛的地点。在消耗任何高德调用之前按名字剔掉，理由记进拒绝清单。
 */
const OFFICE_NAME_SUFFIXES = [
  "居委会",
  "村委会",
  "村民委员会",
  "居民委员会",
  "办事处",
  "人民政府",
  "党群服务中心",
  "社区服务中心",
  "街道办事处",
];

export function isAdministrativeOfficeName(name: string): boolean {
  const trimmed = name.trim();
  return OFFICE_NAME_SUFFIXES.some((suffix) => trimmed.endsWith(suffix));
}

/** GET /api/verify 的返回体：只暴露布尔值与脱敏形状，绝不返回 key 本身。 */
export interface AmapServerStatus {
  keyPresent: boolean;
  keyMask: string | null;
  placeHourlyUsed: number;
  placeHourlyCap: number;
  walkingHourlyUsed: number;
  walkingHourlyCap: number;
  placeDailyUsed: number;
  walkingDailyUsed: number;
  placeDailyCap: number;
  walkingDailyCap: number;
  cacheTtlSeconds: number;
  cacheEntries: number;
  pipelineCacheTtlSeconds: number;
  budgetMinutes: number;
  simulatedStayMinutes: number;
  bufferMinutes: number;
  deviationSuspectMeters: number;
  categories: string[];
  startKeyword: string;
  serverTime: string;
  pid: number;
}

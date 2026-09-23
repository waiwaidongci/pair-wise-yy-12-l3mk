// 预约风险排程 —— 纯领域规则层
// 只负责：风险评级、状态判断、时段重叠判定、FIFO 占时段评估。
// 不依赖 React / localStorage，可独立单测。

export type RiskLevel = "high" | "normal";
export type BookingPhase = "ready" | "pending" | "done" | "cancelled";

export type ConflictType = "overlap" | "assistant" | "farrier";

export interface BookingInput {
  horseId: string;
  tolerance: string; // 抬蹄耐受
  kickHistory: string; // 最近踢踏史
  requiredAssistants: number; // 所需助手人数
  assistantConfirmed: boolean; // 助手是否已确认到场
  start: string; // 到场时段起，datetime-local
  end: string; // 到场时段止
  note?: string;
  riskOverride?: RiskLevel; // 手动改评级
}

export interface Booking extends BookingInput {
  id: string;
  createdAt: number;
  queueOrder: number;
  risk: RiskLevel;
  phase: BookingPhase;
  farrierConfirms: string[]; // 已确认的蹄铁师姓名（高风险需 2 人）
  completedAt?: number;
  cancelledAt?: number;
  cancelReason?: string;
}

export interface Conflict {
  type: ConflictType;
  message: string;
  with?: string[]; // 冲突关联的马匹编号
}

export interface BookingView extends Booking {
  conflicts: Conflict[];
  holdsSlot: boolean;
}

export interface ScheduleView {
  bookings: BookingView[];
  held: BookingView[]; // 当前真正占着时段的单（可作业）
  waiting: BookingView[]; // 排队中（待确认，未占时段）
}

// 高风险需要两名蹄铁师双确认
export const REQUIRED_FARRIERS_HIGH = 2;

// 触发高风险的关键词：踢/咬/抬蹄不稳等
const HIGH_RISK_HINTS = ["踢", "咬", "不稳", "拒", "挣扎", "攻击", "危险"];

/** 依据抬蹄耐受与最近踢踏史推导建议评级（仅建议，可手动覆盖） */
export function suggestRisk(tolerance: string, kickHistory: string): RiskLevel {
  const text = `${tolerance} ${kickHistory}`;
  const lowTolerance = /不耐|差|拒|无法|短|不稳/.test(tolerance);
  const recentKick = HIGH_RISK_HINTS.some((hint) => text.includes(hint));
  return lowTolerance || recentKick ? "high" : "normal";
}

export function requiredFarriers(risk: RiskLevel): number {
  return risk === "high" ? REQUIRED_FARRIERS_HIGH : 1;
}

/** 判定两单时段是否重叠（首尾相接不算重叠） */
export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  const as = Date.parse(a.start);
  const ae = Date.parse(a.end);
  const bs = Date.parse(b.start);
  const be = Date.parse(b.end);
  if ([as, ae, bs, be].some(Number.isNaN)) return false;
  return as < be && bs < ae;
}

function ownConflicts(b: Booking): Conflict[] {
  const conflicts: Conflict[] = [];
  if (b.risk === "high" && b.farrierConfirms.length < REQUIRED_FARRIERS_HIGH) {
    conflicts.push({
      type: "farrier",
      message: `高风险需 ${REQUIRED_FARRIERS_HIGH} 名蹄铁师双确认，当前 ${b.farrierConfirms.length} 名`,
    });
  }
  if (b.requiredAssistants > 0 && !b.assistantConfirmed) {
    conflicts.push({
      type: "assistant",
      message: `需要 ${b.requiredAssistants} 名助手，助手尚未确认到场`,
    });
  }
  return conflicts;
}

/**
 * 状态判断核心：
 * - done / cancelled 直接归档，不参与排程；
 * - 活跃单按 queueOrder(=创建先后) 做 FIFO，逐单检查自身条件与时段重叠；
 * - 条件齐备且时段不与更早占单冲突 => 占时段(可作业)；
 * - 否则排队（待确认），并列出冲突（退回原因）。
 */
export function evaluate(bookings: Booking[]): ScheduleView {
  const held: BookingView[] = [];
  const waiting: BookingView[] = [];
  const views: BookingView[] = [];

  const active = bookings
    .filter((b) => b.phase !== "done" && b.phase !== "cancelled")
    .sort((a, b) => a.queueOrder - b.queueOrder || a.createdAt - b.createdAt);

  for (const booking of active) {
    const conflicts = ownConflicts(booking);
    const clashing = held.filter((h) => overlaps(booking, h)).map((h) => h.horseId);
    if (clashing.length > 0) {
      conflicts.unshift({
        type: "overlap",
        message: `时段与已占时段的 ${clashing.join("、")} 重叠`,
        with: clashing,
      });
    }

    const view: BookingView = {
      ...booking,
      conflicts,
      holdsSlot: conflicts.length === 0,
    };
    if (view.holdsSlot) held.push(view);
    else waiting.push(view);
    views.push(view);
  }

  return { bookings: views, held, waiting };
}

/** 列表筛选：待确认 / 可作业 / 已完成（含取消） */
export type ListFilter = "pending" | "ready" | "done" | "all";

export function filterBookings(view: ScheduleView, bookings: Booking[], filter: ListFilter) {
  if (filter === "pending") return view.waiting;
  if (filter === "ready") return view.held;
  if (filter === "done") {
    return bookings
      .filter((b) => b.phase === "done" || b.phase === "cancelled")
      .sort((a, b) => (b.completedAt ?? b.cancelledAt ?? 0) - (a.completedAt ?? a.cancelledAt ?? 0))
      .map((b) => ({ ...b, conflicts: [] as Conflict[], holdsSlot: false }));
  }
  return [...view.bookings].sort((a, b) => {
    const order: Record<BookingPhase, number> = { ready: 0, pending: 1, done: 2, cancelled: 3 };
    return order[a.phase] - order[b.phase] || a.queueOrder - b.queueOrder;
  });
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  high: "高风险",
  normal: "普通",
};

export const PHASE_LABEL: Record<BookingPhase, string> = {
  ready: "可作业",
  pending: "待确认",
  done: "已完成",
  cancelled: "已取消",
};

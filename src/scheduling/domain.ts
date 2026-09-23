// 排程状态判断层：纯函数，不碰 React、不碰 localStorage。
// 职责：风险评级、时段重叠判断、排队占时段推导、冲突清单。

export type Tolerance = "stable" | "shaky" | "refuses";
export type RiskLevel = "normal" | "high";
export type Lifecycle = "active" | "completed" | "cancelled";
export type DerivedStatus = "pending" | "ready";
export type ViewStatus = DerivedStatus | "completed" | "cancelled";

export interface Slot {
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface AppointmentInput {
  horseNo: string;
  date: string;
  start: string;
  end: string;
  tolerance: Tolerance;
  kickRecent: boolean;
  kickDetail: string;
  requiredAssistants: number;
}

export interface Appointment extends AppointmentInput {
  id: string;
  createdAt: number; // 入队时间，决定排队先后
  lifecycle: Lifecycle;
  risk: RiskLevel; // 最近一次评级结果（改评级时重算）
  farrierConfirms: string[]; // 已确认蹄铁师姓名，高风险需 2 人
  assistantConfirmed: boolean;
  completedAt?: number;
  cancelledAt?: number;
  cancelReason?: string;
}

export type ConflictCode = "overlap" | "dual_confirm" | "assistant";

export interface Conflict {
  code: ConflictCode;
  message: string;
}

export interface EvaluatedAppointment extends Appointment {
  derivedStatus: DerivedStatus;
  conflicts: Conflict[];
  queueIndex: number; // 在当日排队中的序号（从 1 开始）
}

export const TOLERANCE_OPTIONS: {
  value: Tolerance;
  label: string;
  hint: string;
}[] = [
  { value: "stable", label: "抬蹄稳定", hint: "可正常配合抬蹄" },
  { value: "shaky", label: "抬蹄不稳", hint: "踢挣频繁，需额外固定（高风险）" },
  { value: "refuses", label: "拒绝抬蹄", hint: "触蹄即踢或完全不抬（高风险）" },
];

export const TOLERANCE_LABELS: Record<Tolerance, string> = {
  stable: "抬蹄稳定",
  shaky: "抬蹄不稳",
  refuses: "拒绝抬蹄",
};

export function toleranceLabel(value: Tolerance): string {
  return TOLERANCE_LABELS[value] ?? value;
}

/** 风险评级：最近有踢踏史，或抬蹄不稳定/拒绝抬蹄，即为高风险。 */
export function deriveRisk(tolerance: Tolerance, kickRecent: boolean): RiskLevel {
  return kickRecent || tolerance !== "stable" ? "high" : "normal";
}

export function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

export function isValidSlot(slot: Slot): boolean {
  return Boolean(slot.date) && toMinutes(slot.end) > toMinutes(slot.start);
}

/** 同一到场日且时间区间相交（端点相接不算重叠）。 */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  return (
    a.date === b.date &&
    toMinutes(a.start) < toMinutes(b.end) &&
    toMinutes(b.start) < toMinutes(a.end)
  );
}

export function formatSlot(slot: Slot): string {
  return `${slot.date} ${slot.start}–${slot.end}`;
}

/**
 * 排程推导：
 * - 活动预约按入队时间 FIFO 排队，同日同时段先入队者占位，后到者挂“时段重叠”冲突；
 * - 已完成归档的作业同样占用该时段；
 * - 已取消不占位；
 * - 高风险马缺第二确认、助手未确认时退回待确认并列出冲突；
 * - 无任何冲突即为“可作业”，成功占时段。
 */
export function evaluate(all: Appointment[]): EvaluatedAppointment[] {
  const actives = all
    .filter((item) => item.lifecycle === "active")
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const completed = all.filter((item) => item.lifecycle === "completed");

  const queueIndexByDate = new Map<string, number>();
  const result: EvaluatedAppointment[] = [];

  actives.forEach((current, index) => {
    queueIndexByDate.set(current.date, (queueIndexByDate.get(current.date) ?? 0) + 1);
    const queueIndex = queueIndexByDate.get(current.date)!;

    const conflicts: Conflict[] = [];

    const ahead = actives.slice(0, index).find((other) => slotsOverlap(current, other));
    if (ahead) {
      const state = ahead.risk === "high" ? "高风险" : "普通";
      conflicts.push({
        code: "overlap",
        message: `时段重叠：${ahead.horseNo}（${state}，${ahead.start}–${ahead.end}）排队在先，需等其取消或改评级后递补`,
      });
    } else {
      const finished = completed.find((other) => slotsOverlap(current, other));
      if (finished) {
        conflicts.push({
          code: "overlap",
          message: `时段重叠：${finished.horseNo}（${finished.start}–${finished.end}）已有完成归档的作业`,
        });
      }
    }

    if (current.risk === "high" && current.farrierConfirms.length < 2) {
      conflicts.push({
        code: "dual_confirm",
        message: `高风险马需两名蹄铁师确认才能占时段（当前 ${current.farrierConfirms.length}/2）`,
      });
    }

    if (current.requiredAssistants > 0 && !current.assistantConfirmed) {
      conflicts.push({
        code: "assistant",
        message: `所需 ${current.requiredAssistants} 名助手尚未确认到场`,
      });
    }

    result.push({
      ...current,
      queueIndex,
      conflicts,
      derivedStatus: conflicts.length === 0 ? "ready" : "pending",
    });
  });

  return result;
}

/** 取消或改评级释放时段后，找出能递补进时段的下一匹（用于页面提示）。 */
export function findHandoffs(
  before: EvaluatedAppointment[],
  after: EvaluatedAppointment[],
): EvaluatedAppointment[] {
  const readyBefore = new Set(
    before.filter((item) => item.derivedStatus === "ready").map((item) => item.id),
  );
  return after.filter(
    (item) => item.derivedStatus === "ready" && !readyBefore.has(item.id),
  );
}

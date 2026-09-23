// 存档层：只管 localStorage 读写与完成/取消归档，不包含页面操作。
import type { Booking, BookingInput, RiskLevel } from "../domain/scheduling";
import { suggestRisk } from "../domain/scheduling";

const STORAGE_KEY = "farrier-risk-schedule-v1";

export interface ArchiveEntry {
  id: string;
  horseId: string;
  outcome: "done" | "cancelled";
  at: number;
  reason?: string;
}

interface PersistShape {
  bookings: Booking[];
  archive: ArchiveEntry[];
  seq: number;
}

/** 生成 datetime-local 所需的本地时间字符串 */
function localDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function todayAt(hour: number, minute = 0): string {
  return localDateTime(new Date(new Date().setHours(hour, minute, 0, 0)));
}

function yesterdayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hour, minute, 0, 0);
  return localDateTime(d);
}

let seedSeq = 100;

function seed(
  partial: Omit<Booking, "id" | "createdAt" | "queueOrder" | "risk" | "phase" | "farrierConfirms"> &
    Partial<Pick<Booking, "risk" | "phase" | "farrierConfirms" | "completedAt" | "cancelledAt" | "cancelReason">>
): Booking {
  const risk: RiskLevel = partial.riskOverride ?? suggestRisk(partial.tolerance, partial.kickHistory);
  return {
    ...partial,
    id: `BK-${seedSeq++}`,
    createdAt: Date.now() + seedSeq,
    queueOrder: seedSeq,
    risk,
    phase: partial.phase ?? "pending",
    farrierConfirms: partial.farrierConfirms ?? [],
  };
}

/** 首次使用时的演示数据：覆盖可作业、双确认中、助手未确认、重叠排队、已完成 */
function buildSeed(): PersistShape {
  seedSeq = 100;
  const bookings: Booking[] = [
    seed({
      horseId: "HORSE-18",
      tolerance: "配合良好，四蹄均可抬起",
      kickHistory: "近半年无踢踏记录",
      requiredAssistants: 0,
      assistantConfirmed: true,
      start: todayAt(9),
      end: todayAt(10),
      note: "右前蹄外侧磨耗，常规换蹄铁",
    }),
    seed({
      horseId: "HORSE-31",
      tolerance: "抬蹄不稳，后蹄只能短时抬起",
      kickHistory: "上月修蹄时踢翻过蹄铁箱",
      requiredAssistants: 1,
      assistantConfirmed: true,
      start: todayAt(10),
      end: todayAt(11),
      note: "步态轻微不稳，需教练在场",
      farrierConfirms: ["老周"],
    }),
    seed({
      horseId: "HORSE-27",
      tolerance: "拒抬右后蹄，需镇静配合",
      kickHistory: "两周内连续两次踢伤助手",
      requiredAssistants: 2,
      assistantConfirmed: false,
      start: todayAt(11),
      end: todayAt(12, 30),
      note: "后蹄裂纹，加护蹄垫，风险最高",
    }),
    seed({
      horseId: "HORSE-09",
      tolerance: "基本配合，偶有闪躲",
      kickHistory: "无近期踢踏",
      requiredAssistants: 1,
      assistantConfirmed: true,
      start: todayAt(9, 30),
      end: todayAt(10, 30),
      note: "申请插单，时段与 HORSE-18 重叠",
    }),
    seed({
      horseId: "HORSE-42",
      tolerance: "配合",
      kickHistory: "无",
      requiredAssistants: 0,
      assistantConfirmed: true,
      start: yesterdayAt(14),
      end: yesterdayAt(15),
      note: "例行修蹄",
      phase: "done",
      completedAt: Date.now() - 86_400_000,
    }),
  ];
  const archive: ArchiveEntry[] = [
    {
      id: bookings[4].id,
      horseId: "HORSE-42",
      outcome: "done",
      at: bookings[4].completedAt!,
      reason: "四蹄修整完成，14 天后复查",
    },
  ];
  return { bookings, archive, seq: 200 };
}

export function loadSchedule(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = buildSeed();
      saveSchedule(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as PersistShape;
    if (!Array.isArray(parsed.bookings)) return buildSeed();
    return { bookings: parsed.bookings, archive: parsed.archive ?? [], seq: parsed.seq ?? 200 };
  } catch {
    return buildSeed();
  }
}

export function saveSchedule(data: PersistShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式等场景下降级为仅内存
  }
}

export type { Booking, BookingInput, PersistShape };

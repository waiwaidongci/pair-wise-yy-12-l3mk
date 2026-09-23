// 存档层：只管 Appointment 数据的读取与持久化，不做任何排程判断。
// 状态（待确认/可作业）由 domain.evaluate 实时推导，不入库。

import type { Appointment } from "./domain";
import { deriveRisk } from "./domain";

const STORAGE_KEY = "hxyfront-62011-appointments-v1";

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function seed(): Appointment[] {
  const day = today();
  let seq = 0;
  const at = (minute: number) => Date.now() - (60 - minute) * 60_000;

  const make = (
    partial: Omit<Appointment, "id" | "createdAt" | "risk" | "lifecycle"> &
      Partial<Pick<Appointment, "id" | "createdAt" | "risk" | "lifecycle">>,
  ): Appointment => {
    seq += 1;
    const risk = deriveRisk(partial.tolerance, partial.kickRecent);
    return {
      ...partial,
      id: partial.id ?? `apt-${seq}`,
      createdAt: partial.createdAt ?? at(seq),
      risk: partial.risk ?? risk,
      lifecycle: partial.lifecycle ?? "active",
    };
  };

  return [
    // 可作业：普通马，单人已确认、无助手需求
    make({
      horseNo: "HORSE-18",
      date: day,
      start: "09:00",
      end: "09:50",
      tolerance: "stable",
      kickRecent: false,
      kickDetail: "",
      requiredAssistants: 0,
      farrierConfirms: ["老周"],
      assistantConfirmed: false,
    }),
    // 待确认：高风险，缺第二蹄铁师 + 助手未确认
    make({
      horseNo: "HORSE-27",
      date: day,
      start: "10:00",
      end: "11:00",
      tolerance: "shaky",
      kickRecent: true,
      kickDetail: "近 30 天有 2 次上掌时踢踏记录",
      requiredAssistants: 1,
      farrierConfirms: ["老周"],
      assistantConfirmed: false,
    }),
    // 排队中：高风险尚未确认，排在 HORSE-27 之后等释放时段
    make({
      horseNo: "HORSE-31",
      date: day,
      start: "10:20",
      end: "11:10",
      tolerance: "refuses",
      kickRecent: true,
      kickDetail: "上周修左后蹄时踢空一次，教练标注需保定",
      requiredAssistants: 2,
      farrierConfirms: [],
      assistantConfirmed: true,
    }),
    // 待确认：普通马，但助手未确认
    make({
      horseNo: "HORSE-44",
      date: day,
      start: "13:00",
      end: "13:50",
      tolerance: "stable",
      kickRecent: false,
      kickDetail: "",
      requiredAssistants: 1,
      farrierConfirms: ["老周"],
      assistantConfirmed: false,
    }),
    // 已完成归档
    make({
      horseNo: "HORSE-09",
      date: day,
      start: "08:00",
      end: "08:50",
      tolerance: "stable",
      kickRecent: false,
      kickDetail: "",
      requiredAssistants: 0,
      farrierConfirms: ["老周"],
      assistantConfirmed: false,
      lifecycle: "completed",
      completedAt: at(0),
    }),
    // 已取消归档（不占位）
    make({
      horseNo: "HORSE-52",
      date: day,
      start: "14:00",
      end: "14:50",
      tolerance: "shaky",
      kickRecent: true,
      kickDetail: "前次到场后拒抬右后蹄",
      requiredAssistants: 1,
      farrierConfirms: ["老周", "阿郑"],
      assistantConfirmed: true,
      lifecycle: "cancelled",
      cancelledAt: at(0),
      cancelReason: "马匹当日跛行，马房改期",
    }),
  ];
}

export function loadAppointments(): Appointment[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return seed();
    }
    const parsed = JSON.parse(raw) as Appointment[];
    if (!Array.isArray(parsed)) {
      return seed();
    }
    return parsed;
  } catch {
    return seed();
  }
}

export function saveAppointments(appointments: Appointment[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
  } catch {
    // 隐私模式或存储已满时静默降级，页面操作仍可在内存中进行
  }
}

export function resetAppointments(): Appointment[] {
  const fresh = seed();
  saveAppointments(fresh);
  return fresh;
}

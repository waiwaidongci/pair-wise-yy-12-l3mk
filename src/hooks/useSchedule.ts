import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  evaluate,
  filterBookings,
  requiredFarriers,
  suggestRisk,
  type Booking,
  type BookingInput,
  type ListFilter,
  type RiskLevel,
  type ScheduleView,
} from "../domain/scheduling";
import { loadSchedule, saveSchedule, type ArchiveEntry } from "../lib/storage";

export interface SubmitResult {
  ok: boolean;
  bookingId?: string;
  message: string;
}

/**
 * 页面操作层：新增、双确认、助手确认、改评级、取消、完成。
 * 每次写操作后重跑 evaluate（纯规则），由 FIFO 自动完成时段递补，
 * 并对比前后的占单结果，生成"哪些排队马补上了 / 仍被退回"的操作反馈。
 */
export function useSchedule() {
  const initial = useRef<ReturnType<typeof loadSchedule> | null>(null);
  if (initial.current === null) initial.current = loadSchedule();

  const [bookings, setBookings] = useState<Booking[]>(initial.current.bookings);
  const [archive, setArchive] = useState<ArchiveEntry[]>(initial.current.archive);
  const seqRef = useRef(initial.current.seq);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [notices, setNotices] = useState<string[]>([]);

  const persist = useCallback((next: Booking[], nextArchive: ArchiveEntry[]) => {
    setBookings(next);
    setArchive(nextArchive);
    saveSchedule({ bookings: next, archive: nextArchive, seq: seqRef.current });
  }, []);

  useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(() => setNotices([]), 8000);
    return () => clearTimeout(timer);
  }, [notices]);

  const view: ScheduleView = useMemo(() => evaluate(bookings), [bookings]);
  const visible = useMemo(() => filterBookings(view, bookings, filter), [view, bookings, filter]);

  const diffHeld = (before: ScheduleView, after: ScheduleView) => {
    const beforeIds = new Set(before.held.map((b) => b.id));
    const promoted = after.held.filter((b) => !beforeIds.has(b.id));
    return promoted.map(
      (p) => `原时段已交给排队中的下一匹：${p.horseId}（${p.start.slice(5).replace("T", " ")}）现可作业`
    );
  };

  /** 新增预约：条件齐备且无重叠即占时段，否则退回排队并列冲突 */
  const addBooking = useCallback(
    (input: BookingInput): SubmitResult => {
      const trimmed = { ...input, horseId: input.horseId.trim() };
      if (!trimmed.horseId) return { ok: false, message: "请填写马匹编号" };
      if (!trimmed.start || !trimmed.end) return { ok: false, message: "请选择到场时段起止时间" };
      if (Date.parse(trimmed.end) <= Date.parse(trimmed.start))
        return { ok: false, message: "时段结束时间需晚于开始时间" };
      if (trimmed.requiredAssistants < 0) return { ok: false, message: "助手人数不能为负" };

      const seq = ++seqRef.current;
      const booking: Booking = {
        ...trimmed,
        id: `BK-${seq}`,
        createdAt: Date.now(),
        queueOrder: seq,
        risk: trimmed.riskOverride ?? suggestRisk(trimmed.tolerance, trimmed.kickHistory),
        phase: "pending",
        farrierConfirms: [],
      };

      const next = [...bookings, booking];
      const after = evaluate(next);
      const created = after.bookings.find((b) => b.id === booking.id);
      const result: SubmitResult = created?.holdsSlot
        ? { ok: true, bookingId: booking.id, message: `${booking.horseId} 已占时段，状态：可作业` }
        : {
            ok: true,
            bookingId: booking.id,
            message: `${booking.horseId} 已退回排队：${created?.conflicts
              .map((c) => c.message)
              .join("；")}`,
          };
      persist(next, archive);
      return result;
    },
    [bookings, archive, persist]
  );

  /** 蹄铁师确认（高风险需两名，姓名去重，可撤销） */
  const confirmFarrier = useCallback(
    (id: string, name: string): SubmitResult => {
      const who = name.trim();
      if (!who) return { ok: false, message: "请填写蹄铁师姓名" };
      const target = bookings.find((b) => b.id === id);
      if (!target) return { ok: false, message: "预约不存在" };
      if (target.farrierConfirms.includes(who)) return { ok: false, message: `${who} 已确认过，无需重复` };
      if (target.farrierConfirms.length >= requiredFarriers(target.risk))
        return { ok: false, message: "确认人数已满足" };

      const before = evaluate(bookings);
      const next = bookings.map((b) =>
        b.id === id ? { ...b, farrierConfirms: [...b.farrierConfirms, who] } : b
      );
      const after = evaluate(next);
      persist(next, archive);
      setNotices(diffHeld(before, after));
      const v = after.bookings.find((b) => b.id === id);
      return v?.holdsSlot
        ? { ok: true, message: `${who} 确认完成，${target.horseId} 双确认齐备，已占时段` }
        : { ok: true, message: `${who} 的确认已记录，仍有冲突待处理` };
    },
    [bookings, archive, persist]
  );

  const revokeFarrier = useCallback(
    (id: string, name: string) => {
      const before = evaluate(bookings);
      const next = bookings.map((b) =>
        b.id === id ? { ...b, farrierConfirms: b.farrierConfirms.filter((n) => n !== name) } : b
      );
      const after = evaluate(next);
      persist(next, archive);
      const lost = before.held.find((b) => b.id === id);
      if (lost && !after.held.some((b) => b.id === id)) {
        setNotices([`${lost.horseId} 确认不足，已退回排队`, ...diffHeld(before, after)]);
      }
    },
    [bookings, archive, persist]
  );

  /** 助手到场确认 */
  const confirmAssistant = useCallback(
    (id: string) => {
      const before = evaluate(bookings);
      const next = bookings.map((b) => (b.id === id ? { ...b, assistantConfirmed: true } : b));
      const after = evaluate(next);
      persist(next, archive);
      setNotices(diffHeld(before, after));
    },
    [bookings, archive, persist]
  );

  /** 改评级：普通↔高风险，评级变化后原时段按 FIFO 重新分配 */
  const changeRisk = useCallback(
    (id: string, risk: RiskLevel) => {
      const before = evaluate(bookings);
      const target = bookings.find((b) => b.id === id);
      if (!target || target.risk === risk) return;
      const next = bookings.map((b) => (b.id === id ? { ...b, risk, riskOverride: risk } : b));
      const after = evaluate(next);
      persist(next, archive);
      setNotices([`${target.horseId} 评级已改为${risk === "high" ? "高风险" : "普通"}`, ...diffHeld(before, after)]);
    },
    [bookings, archive, persist]
  );

  /** 取消：释放原时段并归档，排队单按 FIFO 递补 */
  const cancelBooking = useCallback(
    (id: string, reason: string) => {
      const target = bookings.find((b) => b.id === id);
      if (!target) return;
      const before = evaluate(bookings);
      const at = Date.now();
      const next = bookings.map((b) =>
        b.id === id ? { ...b, phase: "cancelled" as const, cancelledAt: at, cancelReason: reason.trim() } : b
      );
      const entry: ArchiveEntry = {
        id,
        horseId: target.horseId,
        outcome: "cancelled",
        at,
        reason: reason.trim() || undefined,
      };
      const nextArchive = [entry, ...archive];
      const after = evaluate(next);
      persist(next, nextArchive);
      setNotices([`${target.horseId} 已取消`, ...diffHeld(before, after)]);
    },
    [bookings, archive, persist]
  );

  /** 完成作业：归档 */
  const completeBooking = useCallback(
    (id: string, summary: string) => {
      const target = bookings.find((b) => b.id === id);
      if (!target) return;
      const before = evaluate(bookings);
      const at = Date.now();
      const next = bookings.map((b) => (b.id === id ? { ...b, phase: "done" as const, completedAt: at } : b));
      const entry: ArchiveEntry = {
        id,
        horseId: target.horseId,
        outcome: "done",
        at,
        reason: summary.trim() || undefined,
      };
      const nextArchive = [entry, ...archive];
      const after = evaluate(next);
      persist(next, nextArchive);
      setNotices([`${target.horseId} 已完成并存档`, ...diffHeld(before, after)]);
    },
    [bookings, archive, persist]
  );

  return {
    bookings,
    view,
    visible,
    archive,
    filter,
    setFilter,
    notices,
    addBooking,
    confirmFarrier,
    revokeFarrier,
    confirmAssistant,
    changeRisk,
    cancelBooking,
    completeBooking,
  };
}

// 页面操作层：把存档数据与域层判断接起来，供 React 组件调用。
// 组件只描述“用户做了什么”，状态与冲突始终由 domain.evaluate 推导。

import { useCallback, useMemo, useState } from "react";
import {
  deriveRisk,
  evaluate,
  findHandoffs,
  isValidSlot,
  type Appointment,
  type AppointmentInput,
  type EvaluatedAppointment,
  type Tolerance,
} from "./domain";
import { loadAppointments, resetAppointments, saveAppointments } from "./archive";

export interface Notice {
  id: number;
  tone: "ok" | "warn";
  text: string;
}

export interface ReratePatch {
  tolerance: Tolerance;
  kickRecent: boolean;
  kickDetail: string;
  requiredAssistants: number;
}

let noticeSeq = 0;

export function useSchedule() {
  const [appointments, setAppointments] = useState<Appointment[]>(() => loadAppointments());
  const [notices, setNotices] = useState<Notice[]>([]);

  const evaluated = useMemo(() => evaluate(appointments), [appointments]);
  const evaluatedById = useMemo(() => {
    const map = new Map<string, EvaluatedAppointment>();
    evaluated.forEach((item) => map.set(item.id, item));
    return map;
  }, [evaluated]);

  const commit = useCallback((next: Appointment[]) => {
    setAppointments(next);
    saveAppointments(next);
  }, []);

  const pushNotice = useCallback((tone: Notice["tone"], text: string) => {
    noticeSeq += 1;
    const id = noticeSeq;
    setNotices((prev) => [...prev.slice(-3), { id, tone, text }]);
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  /** 新单：校验时段后入队，由域层判断它是退回待确认还是直接可作业。 */
  const createAppointment = useCallback(
    (input: AppointmentInput): { ok: boolean; error?: string } => {
      const trimmed = input.horseNo.trim();
      if (!trimmed) {
        return { ok: false, error: "请填写马匹编号" };
      }
      if (!isValidSlot(input)) {
        return { ok: false, error: "到场时段无效：结束时间必须晚于开始时间" };
      }
      if (input.requiredAssistants < 0 || !Number.isInteger(input.requiredAssistants)) {
        return { ok: false, error: "所需助手人数需为非负整数" };
      }

      const created: Appointment = {
        ...input,
        horseNo: trimmed,
        id: `apt-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
        createdAt: Date.now(),
        lifecycle: "active",
        risk: deriveRisk(input.tolerance, input.kickRecent),
        farrierConfirms: [],
        assistantConfirmed: false,
      };

      const next = [...appointments, created];
      commit(next);
      const after = evaluate(next);
      const entry = after.find((item) => item.id === created.id);

      if (entry && entry.conflicts.length > 0) {
        pushNotice(
          "warn",
          `${trimmed} 已入队但退回待确认：${entry.conflicts.map((c) => c.message).join("；")}`,
        );
      } else {
        pushNotice("ok", `${trimmed} 已占时段 ${input.date} ${input.start}–${input.end}`);
      }
      return { ok: true };
    },
    [appointments, commit, pushNotice],
  );

  /** 蹄铁师到场确认；高风险需两名不同蹄铁师。 */
  const confirmFarrier = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        pushNotice("warn", "请填写蹄铁师姓名后再确认");
        return;
      }
      const before = evaluate(appointments);
      const next = appointments.map((item) => {
        if (item.id !== id) return item;
        if (item.farrierConfirms.includes(trimmed)) return item;
        return { ...item, farrierConfirms: [...item.farrierConfirms, trimmed] };
      });
      commit(next);
      const after = evaluate(next);
      findHandoffs(before, after).forEach((item) =>
        pushNotice("ok", `时段递补：${item.horseNo} 已升至可作业（${item.start}–${item.end}）`),
      );
      const target = after.find((item) => item.id === id);
      if (target?.derivedStatus === "ready" && before.find((item) => item.id === id)?.derivedStatus !== "ready") {
        pushNotice("ok", `${target.horseNo} 确认齐备，可开始作业`);
      }
    },
    [appointments, commit, pushNotice],
  );

  const toggleAssistant = useCallback(
    (id: string) => {
      const before = evaluate(appointments);
      const next = appointments.map((item) =>
        item.id === id ? { ...item, assistantConfirmed: !item.assistantConfirmed } : item,
      );
      commit(next);
      const after = evaluate(next);
      findHandoffs(before, after).forEach((item) =>
        pushNotice("ok", `时段递补：${item.horseNo} 已升至可作业（${item.start}–${item.end}）`),
      );
    },
    [appointments, commit, pushNotice],
  );

  /** 取消：释放时段，排队中满足条件的下一匹自动递补。 */
  const cancelAppointment = useCallback(
    (id: string, reason: string) => {
      const target = appointments.find((item) => item.id === id);
      if (!target) return;
      const before = evaluate(appointments);
      const next = appointments.map((item) =>
        item.id === id
          ? {
              ...item,
              lifecycle: "cancelled" as const,
              cancelledAt: Date.now(),
              cancelReason: reason.trim() || "未填写原因",
            }
          : item,
      );
      commit(next);
      const after = evaluate(next);
      const handoffs = findHandoffs(before, after);
      if (handoffs.length > 0) {
        handoffs.forEach((item) =>
          pushNotice("ok", `原时段已交给排队中的下一匹：${item.horseNo}（${item.start}–${item.end}）`),
        );
      } else {
        pushNotice("ok", `${target.horseNo} 已取消归档，时段已释放`);
      }
    },
    [appointments, commit, pushNotice],
  );

  /** 改评级：重算风险，两名蹄铁师确认失效并回到队尾重新排队。 */
  const rerateAppointment = useCallback(
    (id: string, patch: ReratePatch) => {
      const target = appointments.find((item) => item.id === id);
      if (!target) return;
      const before = evaluate(appointments);
      const newRisk = deriveRisk(patch.tolerance, patch.kickRecent);
      const next = appointments.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              risk: newRisk,
              farrierConfirms: [],
              createdAt: Date.now(),
            }
          : item,
      );
      commit(next);
      const after = evaluate(next);
      const handoffs = findHandoffs(before, after);
      if (handoffs.length > 0) {
        handoffs.forEach((item) =>
          pushNotice("ok", `原时段已交给排队中的下一匹：${item.horseNo}（${item.start}–${item.end}）`),
        );
      }
      const updated = after.find((item) => item.id === id);
      pushNotice(
        newRisk === "high" ? "warn" : "ok",
        `${target.horseNo} 已改评级为${newRisk === "high" ? "高风险" : "普通"}，原确认失效，重新入队`,
      );
      if (updated && updated.derivedStatus === "ready") {
        pushNotice("ok", `${updated.horseNo} 当前无需额外确认，已可作业`);
      }
    },
    [appointments, commit, pushNotice],
  );

  const completeAppointment = useCallback(
    (id: string) => {
      const target = evaluatedById.get(id);
      if (!target) return;
      const next = appointments.map((item) =>
        item.id === id
          ? { ...item, lifecycle: "completed" as const, completedAt: Date.now() }
          : item,
      );
      commit(next);
      pushNotice("ok", `${target.horseNo} 已完成并归档（${target.start}–${target.end}）`);
    },
    [appointments, commit, evaluatedById, pushNotice],
  );

  const resetAll = useCallback(() => {
    const fresh = resetAppointments();
    setAppointments(fresh);
    pushNotice("ok", "已恢复演示数据");
  }, [pushNotice]);

  return {
    appointments,
    evaluated,
    evaluatedById,
    notices,
    createAppointment,
    confirmFarrier,
    toggleAssistant,
    cancelAppointment,
    rerateAppointment,
    completeAppointment,
    dismissNotice,
    resetAll,
  };
}

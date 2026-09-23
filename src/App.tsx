import { useMemo, useState } from "react";
import "./styles.css";
import { NewAppointmentForm } from "./scheduling/NewAppointmentForm";
import { AppointmentCard } from "./scheduling/AppointmentCard";
import { useSchedule } from "./scheduling/useSchedule";

type FilterKey = "pending" | "ready" | "done";

const FILTERS: { key: FilterKey; label: string; hint: string }[] = [
  { key: "pending", label: "待确认", hint: "有冲突或确认未齐，已退回" },
  { key: "ready", label: "可作业", hint: "确认齐备并占住时段" },
  { key: "done", label: "已完成", hint: "完成与取消归档" },
];

function App() {
  const schedule = useSchedule();
  const [filter, setFilter] = useState<FilterKey>("pending");

  const pending = schedule.evaluated.filter((item) => item.derivedStatus === "pending");
  const ready = schedule.evaluated.filter((item) => item.derivedStatus === "ready");
  const archived = schedule.appointments
    .filter((item) => item.lifecycle !== "active")
    .sort((a, b) => (b.completedAt ?? b.cancelledAt ?? 0) - (a.completedAt ?? a.cancelledAt ?? 0));

  const counts: Record<FilterKey, number> = {
    pending: pending.length,
    ready: ready.length,
    done: archived.length,
  };

  const waitingSlot = pending.filter((item) =>
    item.conflicts.some((conflict) => conflict.code === "overlap"),
  ).length;

  const list = useMemo(() => {
    if (filter === "pending") return pending;
    if (filter === "ready") return ready;
    return [];
  }, [filter, pending, ready]);

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62011 · 预约风险排程 · Port 62011</p>
        <h1>蹄铁师上门预约风险排程</h1>
        <span>
          每匹马登记抬蹄耐受、最近踢踏史、所需助手与到场时段。高风险马须两名蹄铁师确认才能占时段；
          时段重叠或助手未确认一律退回“待确认”并列明冲突。取消或改评级后，原时段自动交给排队中的下一匹。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>待确认</small>
          <strong>{counts.pending}</strong>
        </article>
        <article>
          <small>可作业</small>
          <strong>{counts.ready}</strong>
        </article>
        <article>
          <small>等时段递补</small>
          <strong>{waitingSlot}</strong>
        </article>
        <article>
          <small>归档（完成 / 取消）</small>
          <strong>{counts.done}</strong>
        </article>
      </section>

      {schedule.notices.length > 0 && (
        <section className="notices">
          {schedule.notices.map((notice) => (
            <div key={notice.id} className={`notice notice-${notice.tone}`}>
              <span>{notice.text}</span>
              <button onClick={() => schedule.dismissNotice(notice.id)} aria-label="关闭提示">
                ×
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="workspace">
        <aside className="panel">
          <h2>列表筛选</h2>
          <div className="chips vertical">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                className={filter === item.key ? "chip-active" : ""}
                onClick={() => setFilter(item.key)}
              >
                <b>{item.label}</b>
                <em>{counts[item.key]}</em>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>
          <div className="side-rule" />
          <h2>排程规则</h2>
          <ul className="rule-list">
            <li>高风险判定：抬蹄不稳 / 拒绝抬蹄，或近 30 天有踢踏史。</li>
            <li>高风险马需两名不同蹄铁师确认，普通马单人确认。</li>
            <li>所需助手人数大于 0 时，须确认助手到场。</li>
            <li>同到场日时段相交即冲突，先入队者占位，后到者退回待确认。</li>
            <li>取消或改评级释放时段，队首满足条件者自动递补。</li>
          </ul>
          <button className="btn btn-ghost reset-btn" onClick={schedule.resetAll}>
            恢复演示数据
          </button>
        </aside>

        <div className="main-col">
          <NewAppointmentForm onCreate={schedule.createAppointment} />

          <section className="panel list-panel">
            <div className="heading">
              <div>
                <p>当前视图</p>
                <h2>
                  {FILTERS.find((item) => item.key === filter)?.label}
                  <span className="list-count">{counts[filter]}</span>
                </h2>
              </div>
            </div>

            {filter !== "done" &&
              (list.length > 0 ? (
                <div className="records">
                  {list.map((item) => (
                    <AppointmentCard
                      key={item.id}
                      item={item}
                      onConfirmFarrier={schedule.confirmFarrier}
                      onToggleAssistant={schedule.toggleAssistant}
                      onCancel={schedule.cancelAppointment}
                      onRerate={schedule.rerateAppointment}
                      onComplete={schedule.completeAppointment}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty-hint">
                  {filter === "ready"
                    ? "暂无可作业预约：等待确认或去“待确认”处理冲突。"
                    : "没有待确认预约，新登记的马都已占住时段。"}
                </p>
              ))}

            {filter === "done" &&
              (archived.length > 0 ? (
                <div className="records">
                  {archived.map((item) => (
                    <article
                      key={item.id}
                      className={`archive-card ${item.lifecycle === "cancelled" ? "is-cancelled" : ""}`}
                    >
                      <div className="appt-head">
                        <div className="appt-title">
                          <h3>{item.horseNo}</h3>
                          {item.lifecycle === "completed" ? (
                            <span className="badge badge-done">已完成</span>
                          ) : (
                            <span className="badge badge-cancel">已取消</span>
                          )}
                        </div>
                        <div className="appt-slot">
                          <strong>
                            {item.start}–{item.end}
                          </strong>
                          <small>{item.date}</small>
                        </div>
                      </div>
                      <p className="archive-meta">
                        {item.risk === "high" ? "高风险" : "普通马"} · 抬蹄：
                        {item.tolerance}
                        {item.kickRecent ? ` · 踢踏史：${item.kickDetail || "有记录"}` : ""} ·
                        助手 {item.requiredAssistants} 名 · 确认蹄铁师：
                        {item.farrierConfirms.join("、") || "—"}
                      </p>
                      {item.lifecycle === "cancelled" && (
                        <p className="cancel-reason">取消原因：{item.cancelReason ?? "—"}</p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-hint">还没有完成或取消的归档记录。</p>
              ))}
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;

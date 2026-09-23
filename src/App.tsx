import "./styles.css";
import { BookingForm } from "./components/BookingForm";
import { BookingList } from "./components/BookingList";
import { useSchedule } from "./hooks/useSchedule";
import type { ListFilter } from "./domain/scheduling";

const FILTERS: { key: ListFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待确认" },
  { key: "ready", label: "可作业" },
  { key: "done", label: "已完成" },
];

function App() {
  const {
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
  } = useSchedule();

  const conflictCount = view.waiting.filter((b) => b.conflicts.some((c) => c.type === "overlap")).length;

  const metrics = [
    { label: "待确认", value: view.waiting.length },
    { label: "可作业", value: view.held.length },
    { label: "时段冲突排队", value: conflictCount },
    { label: "已归档", value: archive.length },
  ];

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62011 · 蹄铁上门 · 预约风险排程</p>
        <h1>马术蹄铁修整 · 风险排程台</h1>
        <span>
          记录每匹马的抬蹄耐受、最近踢踏史、所需助手与到场时段；高风险马须两名蹄铁师双确认才能占时段，
          时段重叠或助手未确认一律退回排队并列出冲突；取消或改评级后，原时段按顺序交给排队中的下一匹。
        </span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      {notices.length > 0 && (
        <section className="notice-banner">
          {notices.map((n, i) => (
            <p key={i}>↻ {n}</p>
          ))}
        </section>
      )}

      <section className="workspace">
        <aside className="panel sidebar">
          <h2>列表筛选</h2>
          <div className="chips filter-chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={filter === f.key ? "chip-active" : ""}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <h2 className="sidebar-gap">占时段规则</h2>
          <ul className="rules">
            <li>高风险马：两名蹄铁师双确认后才可占时段</li>
            <li>所需助手未确认到场：退回排队</li>
            <li>时段与更早的已占单重叠：退回排队</li>
            <li>同一时段按提交先后 FIFO，先满足条件者占单</li>
            <li>取消或改评级释放时段后，自动递给排队中的下一匹</li>
          </ul>

          <h2 className="sidebar-gap">当前冲突</h2>
          {view.waiting.every((b) => b.conflicts.length === 0) && <p className="muted">暂无冲突，队列已清空</p>}
          <ul className="conflict-summary">
            {view.waiting
              .filter((b) => b.conflicts.length > 0)
              .map((b) => (
                <li key={b.id}>
                  <b>{b.horseId}</b>
                  {b.conflicts.map((c, i) => (
                    <span key={i} className={`dot conflict-${c.type}`} title={c.message}>
                      {c.type === "overlap" ? "重叠" : c.type === "assistant" ? "待助手" : "待双确认"}
                    </span>
                  ))}
                </li>
              ))}
          </ul>

          <h2 className="sidebar-gap">归档记录</h2>
          {archive.length === 0 && <p className="muted">暂无完成/取消记录</p>}
          <ul className="archive-list">
            {archive.slice(0, 6).map((a) => (
              <li key={`${a.id}-${a.at}`}>
                <span className={`phase-dot ${a.outcome}`} />
                <b>{a.horseId}</b>
                <em>{a.outcome === "done" ? "已完成" : "已取消"}</em>
                <time>{new Date(a.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
              </li>
            ))}
          </ul>
        </aside>

        <div className="main-col">
          <BookingForm onSubmit={addBooking} />

          <section className="panel list-panel">
            <div className="heading">
              <div>
                <p>排程状态由系统统一判定</p>
                <h2>{FILTERS.find((f) => f.key === filter)?.label}（{visible.length}）</h2>
              </div>
            </div>
            <BookingList
              bookings={visible}
              onConfirmFarrier={confirmFarrier}
              onRevokeFarrier={revokeFarrier}
              onConfirmAssistant={confirmAssistant}
              onChangeRisk={changeRisk}
              onCancel={cancelBooking}
              onComplete={completeBooking}
            />
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;

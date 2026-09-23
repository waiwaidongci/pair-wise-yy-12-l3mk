import { useState } from "react";
import {
  PHASE_LABEL,
  REQUIRED_FARRIERS_HIGH,
  RISK_LABEL,
  type BookingView,
  type RiskLevel,
} from "../domain/scheduling";

interface Props {
  bookings: BookingView[];
  onConfirmFarrier: (id: string, name: string) => { ok: boolean; message: string };
  onRevokeFarrier: (id: string, name: string) => void;
  onConfirmAssistant: (id: string) => void;
  onChangeRisk: (id: string, risk: RiskLevel) => void;
  onCancel: (id: string, reason: string) => void;
  onComplete: (id: string, summary: string) => void;
}

function fmt(slot: string): string {
  return slot.replace("T", " ").slice(5);
}

export function BookingCard({
  booking,
  onConfirmFarrier,
  onRevokeFarrier,
  onConfirmAssistant,
  onChangeRisk,
  onCancel,
  onComplete,
}: {
  booking: BookingView;
} & Omit<Props, "bookings">) {
  const [farrierName, setFarrierName] = useState("");
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const archived = booking.phase === "done" || booking.phase === "cancelled";
  const farrierNeed = booking.risk === "high" ? REQUIRED_FARRIERS_HIGH : 1;
  const farrierFull = booking.farrierConfirms.length >= farrierNeed;

  const submitConfirm = () => {
    const result = onConfirmFarrier(booking.id, farrierName);
    if (result.ok) {
      setFarrierName("");
      setError("");
    } else {
      setError(result.message);
    }
  };

  return (
    <article className={`booking-card ${booking.holdsSlot ? "holds" : ""} phase-${booking.phase}`}>
      <header className="card-head">
        <div className="card-title">
          <h3>{booking.horseId}</h3>
          <span className={`risk-pill risk-${booking.risk}`}>{RISK_LABEL[booking.risk]}</span>
          <span className={`phase-pill phase-${booking.phase}`}>{PHASE_LABEL[booking.phase]}</span>
          {booking.holdsSlot && <span className="slot-badge">已占时段</span>}
        </div>
        <time>
          {fmt(booking.start)} – {fmt(booking.end)}
        </time>
      </header>

      <div className="card-grid">
        <p>
          <small>抬蹄耐受</small>
          {booking.tolerance || "—"}
        </p>
        <p>
          <small>最近踢踏史</small>
          {booking.kickHistory || "—"}
        </p>
        <p>
          <small>所需助手</small>
          {booking.requiredAssistants} 名 ·{" "}
          {booking.requiredAssistants === 0
            ? "无需助手"
            : booking.assistantConfirmed
              ? "助手已确认到场"
              : "助手未确认"}
        </p>
        <p>
          <small>蹄铁师确认</small>
          {booking.farrierConfirms.length}/{farrierNeed} 名
          {booking.farrierConfirms.length > 0 && `（${booking.farrierConfirms.join("、")}）`}
        </p>
      </div>

      {booking.note && <p className="card-note">备注：{booking.note}</p>}

      {!archived && booking.conflicts.length > 0 && (
        <ul className="conflict-list">
          {booking.conflicts.map((c, i) => (
            <li key={`${c.type}-${i}`} className={`conflict conflict-${c.type}`}>
              ⚠ {c.message}
            </li>
          ))}
        </ul>
      )}

      {archived && (
        <p className="archive-note">
          {booking.phase === "done" ? "已于" : "已于"}
          {new Date((booking.completedAt ?? booking.cancelledAt)!).toLocaleString("zh-CN")}
          {booking.phase === "done" ? " 完成存档" : " 取消"}
          {booking.cancelReason ? `（原因：${booking.cancelReason}）` : ""}
        </p>
      )}

      {!archived && (
        <div className="card-actions">
          {!farrierFull && (
            <div className="inline-action">
              <input
                value={farrierName}
                placeholder="蹄铁师姓名"
                onChange={(e) => setFarrierName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitConfirm()}
              />
              <button type="button" onClick={submitConfirm}>
                蹄铁师确认
              </button>
              {error && <small className="feedback-err">{error}</small>}
            </div>
          )}
          {farrierFull && (
            <div className="confirm-tags">
              {booking.farrierConfirms.map((name) => (
                <span key={name} className="confirm-tag">
                  {name}
                  <button type="button" title="撤销确认" onClick={() => onRevokeFarrier(booking.id, name)}>
                    ×
                </button>
                </span>
              ))}
            </div>
          )}

          {booking.requiredAssistants > 0 && !booking.assistantConfirmed && (
            <button type="button" onClick={() => onConfirmAssistant(booking.id)}>
              确认助手到场
            </button>
          )}

          <div className="seg">
            <span>评级</span>
            {(["normal", "high"] as RiskLevel[]).map((r) => (
              <button
                key={r}
                type="button"
                className={booking.risk === r ? `chip-active risk-${r}` : ""}
                onClick={() => onChangeRisk(booking.id, r)}
              >
                {RISK_LABEL[r]}
              </button>
            ))}
          </div>

          {booking.holdsSlot && (
            <button type="button" className="primary" onClick={() => onComplete(booking.id, "")}>
              标记完成
            </button>
          )}

          {cancelling ? (
            <div className="inline-action">
              <input
                value={cancelReason}
                placeholder="取消原因（可空）"
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <button type="button" className="danger" onClick={() => { onCancel(booking.id, cancelReason); setCancelling(false); setCancelReason(""); }}>
                确认取消
              </button>
              <button type="button" onClick={() => setCancelling(false)}>
                再想想
              </button>
            </div>
          ) : (
            <button type="button" className="danger-ghost" onClick={() => setCancelling(true)}>
              取消预约
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function BookingList(props: Props) {
  const { bookings } = props;
  if (bookings.length === 0) {
    return <div className="empty-state">当前筛选下没有预约</div>;
  }
  return (
    <div className="booking-list">
      {bookings.map((b) => (
        <BookingCard key={b.id} booking={b} {...props} />
      ))}
    </div>
  );
}

import { useState } from "react";
import type { EvaluatedAppointment } from "./domain";
import { TOLERANCE_LABELS, toleranceLabel } from "./domain";
import type { ReratePatch } from "./useSchedule";

interface CardProps {
  item: EvaluatedAppointment;
  onConfirmFarrier: (id: string, name: string) => void;
  onToggleAssistant: (id: string) => void;
  onCancel: (id: string, reason: string) => void;
  onRerate: (id: string, patch: ReratePatch) => void;
  onComplete: (id: string) => void;
}

const CONFLICT_LABEL: Record<string, string> = {
  overlap: "时段重叠",
  dual_confirm: "缺蹄铁师确认",
  assistant: "助手未确认",
};

function RiskBadge({ item }: { item: EvaluatedAppointment }) {
  return item.risk === "high" ? (
    <span className="badge badge-high">高风险</span>
  ) : (
    <span className="badge badge-normal">普通马</span>
  );
}

export function AppointmentCard({
  item,
  onConfirmFarrier,
  onToggleAssistant,
  onCancel,
  onRerate,
  onComplete,
}: CardProps) {
  const [farrierName, setFarrierName] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [showRerate, setShowRerate] = useState(false);
  const [patch, setPatch] = useState<ReratePatch>({
    tolerance: item.tolerance,
    kickRecent: item.kickRecent,
    kickDetail: item.kickDetail,
    requiredAssistants: item.requiredAssistants,
  });

  const pending = item.derivedStatus === "pending";

  return (
    <article className={`appt-card ${item.risk === "high" ? "is-high" : ""} ${pending ? "" : "is-ready"}`}>
      <div className="appt-head">
        <div className="appt-title">
          <h3>{item.horseNo}</h3>
          <RiskBadge item={item} />
          <span className="queue-tag">当日队列 #{item.queueIndex}</span>
        </div>
        <div className="appt-slot">
          <strong>
            {item.start}–{item.end}
          </strong>
          <small>{item.date}</small>
        </div>
      </div>

      <dl className="appt-meta">
        <div>
          <dt>抬蹄耐受</dt>
          <dd>{toleranceLabel(item.tolerance)}</dd>
        </div>
        <div>
          <dt>最近踢踏史</dt>
          <dd>
            {item.kickRecent ? (
              <span className="kick-yes">有记录{item.kickDetail ? `：${item.kickDetail}` : ""}</span>
            ) : (
              <span className="kick-no">近 30 天无记录</span>
            )}
          </dd>
        </div>
        <div>
          <dt>所需助手</dt>
          <dd>
            {item.requiredAssistants === 0
              ? "无需助手"
              : `${item.requiredAssistants} 名 · ${item.assistantConfirmed ? "已确认到场" : "未确认"}`}
          </dd>
        </div>
        <div>
          <dt>蹄铁师确认</dt>
          <dd>
            {item.farrierConfirms.length > 0 ? item.farrierConfirms.join("、") : "暂无确认"}
            {item.risk === "high" && (
              <em className="confirm-count">
                {" "}
               （{item.farrierConfirms.length}/2，需两名不同蹄铁师）
              </em>
            )}
          </dd>
        </div>
      </dl>

      {item.conflicts.length > 0 && (
        <ul className="conflict-list">
          {item.conflicts.map((conflict) => (
            <li key={conflict.code} className={`conflict conflict-${conflict.code}`}>
              <span>{CONFLICT_LABEL[conflict.code] ?? "冲突"}</span>
              {conflict.message}
            </li>
          ))}
        </ul>
      )}

      <div className="appt-actions">
        <div className="inline-form">
          <input
            value={farrierName}
            onChange={(event) => setFarrierName(event.target.value)}
            placeholder="蹄铁师姓名"
            aria-label={`${item.horseNo} 蹄铁师姓名`}
          />
          <button
            className="btn"
            onClick={() => {
              onConfirmFarrier(item.id, farrierName);
              setFarrierName("");
            }}
          >
            蹄铁师确认
          </button>
        </div>
        {item.requiredAssistants > 0 && (
          <button
            className={`btn ${item.assistantConfirmed ? "btn-active" : ""}`}
            onClick={() => onToggleAssistant(item.id)}
          >
            {item.assistantConfirmed ? "撤销助手确认" : "确认助手到场"}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => setShowRerate((value) => !value)}>
          改评级
        </button>
        <button className="btn btn-danger" onClick={() => setShowCancel((value) => !value)}>
          取消预约
        </button>
        <button className="btn btn-primary" disabled={pending} onClick={() => onComplete(item.id)}>
          标记完成
        </button>
      </div>

      {showCancel && (
        <div className="sub-panel">
          <input
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="取消原因（选填），确认后原时段交给队列下一匹"
          />
          <div className="sub-actions">
            <button
              className="btn btn-danger"
              onClick={() => {
                onCancel(item.id, cancelReason);
                setShowCancel(false);
                setCancelReason("");
              }}
            >
              确认取消并释放时段
            </button>
            <button className="btn btn-ghost" onClick={() => setShowCancel(false)}>
              再想想
            </button>
          </div>
        </div>
      )}

      {showRerate && (
        <div className="sub-panel rerate-panel">
          <label>
            <span>抬蹄耐受</span>
            <select
              value={patch.tolerance}
              onChange={(event) =>
                setPatch((prev) => ({ ...prev, tolerance: event.target.value as ReratePatch["tolerance"] }))
              }
            >
              {Object.entries(TOLERANCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>所需助手（人）</span>
            <input
              type="number"
              min={0}
              max={6}
              value={patch.requiredAssistants}
              onChange={(event) =>
                setPatch((prev) => ({ ...prev, requiredAssistants: Number(event.target.value) }))
              }
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={patch.kickRecent}
              onChange={(event) =>
                setPatch((prev) => ({ ...prev, kickRecent: event.target.checked }))
              }
            />
            <span>最近 30 天有踢踏史</span>
          </label>
          <label className="wide">
            <span>踢踏详情</span>
            <input
              value={patch.kickDetail}
              onChange={(event) => setPatch((prev) => ({ ...prev, kickDetail: event.target.value }))}
              placeholder="时间、蹄位、现场情况"
            />
          </label>
          <div className="sub-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                onRerate(item.id, patch);
                setShowRerate(false);
              }}
            >
              提交改评级（确认失效并回队尾）
            </button>
            <button className="btn btn-ghost" onClick={() => setShowRerate(false)}>
              收起
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

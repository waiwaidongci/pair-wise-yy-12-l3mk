import { useMemo, useState } from "react";
import {
  RISK_LABEL,
  suggestRisk,
  type BookingInput,
  type RiskLevel,
} from "../domain/scheduling";
import type { SubmitResult } from "../hooks/useSchedule";

interface Props {
  onSubmit: (input: BookingInput) => SubmitResult;
}

function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

const EMPTY = {
  horseId: "",
  tolerance: "",
  kickHistory: "",
  requiredAssistants: 1,
  assistantConfirmed: false,
  start: todayAt(13),
  end: todayAt(14),
  note: "",
};

/** 新增预约表单：风险先给系统建议评级，蹄铁师可手动改评级 */
export function BookingForm({ onSubmit }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [manualRisk, setManualRisk] = useState<RiskLevel | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const suggested = useMemo(() => suggestRisk(form.tolerance, form.kickHistory), [form.tolerance, form.kickHistory]);
  const risk: RiskLevel = manualRisk ?? suggested;

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    const result = onSubmit({ ...form, riskOverride: risk });
    setFeedback({ ok: result.ok, text: result.message });
    if (result.ok) {
      setForm(EMPTY);
      setManualRisk(null);
    }
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>到场排程</p>
          <h2>新增预约</h2>
        </div>
        <span className={`risk-pill risk-${risk}`}>{RISK_LABEL[risk]}</span>
      </div>

      <div className="field-grid">
        <label>
          <span>马匹编号</span>
          <input value={form.horseId} placeholder="如 HORSE-31" onChange={(e) => update("horseId", e.target.value)} />
        </label>
        <label>
          <span>到场时段（起 - 止）</span>
          <div className="range-inputs">
            <input type="datetime-local" value={form.start} onChange={(e) => update("start", e.target.value)} />
            <input type="datetime-local" value={form.end} onChange={(e) => update("end", e.target.value)} />
          </div>
        </label>
        <label>
          <span>抬蹄耐受</span>
          <input
            value={form.tolerance}
            placeholder="如：后蹄只能短时抬起 / 四蹄配合"
            onChange={(e) => update("tolerance", e.target.value)}
          />
        </label>
        <label>
          <span>最近踢踏史</span>
          <input
            value={form.kickHistory}
            placeholder="如：上月踢翻过蹄铁箱 / 近半年无记录"
            onChange={(e) => update("kickHistory", e.target.value)}
          />
        </label>
        <label>
          <span>所需助手人数</span>
          <input
            type="number"
            min={0}
            max={6}
            value={form.requiredAssistants}
            onChange={(e) => update("requiredAssistants", Math.max(0, Number(e.target.value)))}
          />
        </label>
        <label className="checkbox-label">
          <span>助手是否已确认到场</span>
          <div className="switch-row">
            <button
              type="button"
              className={form.assistantConfirmed ? "toggle on" : "toggle"}
              onClick={() => update("assistantConfirmed", !form.assistantConfirmed)}
            >
              {form.assistantConfirmed ? "已确认" : "未确认"}
            </button>
            {form.requiredAssistants > 0 && !form.assistantConfirmed && (
              <small className="hint-warn">未确认时预约将退回排队</small>
            )}
          </div>
        </label>
      </div>

      <div className="risk-suggest">
        <span>
          系统建议评级：<b className={`risk-text-${suggested}`}>{RISK_LABEL[suggested]}</b>
          {manualRisk && <em>（已手动改为{RISK_LABEL[risk]}）</em>}
        </span>
        <div className="chips">
          {(["normal", "high"] as RiskLevel[]).map((r) => (
            <button
              key={r}
              type="button"
              className={risk === r ? `chip-active risk-${r}` : ""}
              onClick={() => setManualRisk(r)}
            >
              改评{RISK_LABEL[r]}
            </button>
          ))}
        </div>
        {risk === "high" && <small className="hint-warn">高风险马须两名蹄铁师双确认后才能占时段</small>}
      </div>

      <label className="note-field">
        <span>备注（步态/蹄况/注意事项）</span>
        <input value={form.note} placeholder="如：后蹄裂纹，需教练在场" onChange={(e) => update("note", e.target.value)} />
      </label>

      <div className="form-footer">
        <button className="primary" type="button" onClick={handleSubmit}>
          提交排程
        </button>
        {feedback && (
          <span className={feedback.ok ? "feedback-ok" : "feedback-err"}>
            {feedback.ok ? "✓ " : "✕ "}
            {feedback.text}
          </span>
        )}
      </div>
    </section>
  );
}

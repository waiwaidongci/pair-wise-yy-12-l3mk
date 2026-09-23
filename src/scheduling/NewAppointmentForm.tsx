import { useState } from "react";
import { TOLERANCE_OPTIONS, toMinutes, type AppointmentInput, type Tolerance } from "./domain";

interface NewAppointmentFormProps {
  onCreate: (input: AppointmentInput) => { ok: boolean; error?: string };
}

function todayString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const EMPTY = {
  horseNo: "",
  date: todayString(),
  start: "09:00",
  end: "09:50",
  tolerance: "stable" as Tolerance,
  kickRecent: false,
  kickDetail: "",
  requiredAssistants: 0,
};

export function NewAppointmentForm({ onCreate }: NewAppointmentFormProps) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = () => {
    const result = onCreate(form);
    if (!result.ok) {
      setError(result.error ?? "提交失败");
      return;
    }
    setError(null);
    setForm({ ...EMPTY, date: form.date });
  };

  const highRiskPreview = form.kickRecent || form.tolerance !== "stable";

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>到场登记</p>
          <h2>新建预约</h2>
        </div>
        <span className={`risk-preview ${highRiskPreview ? "is-high" : ""}`}>
          {highRiskPreview ? "将判定为高风险 · 需双蹄铁师确认" : "普通马 · 单人确认即可"}
        </span>
      </div>

      <div className="field-grid">
        <label>
          <span>马匹编号</span>
          <input
            value={form.horseNo}
            onChange={(event) => update("horseNo", event.target.value)}
            placeholder="如 HORSE-31"
          />
        </label>
        <label>
          <span>到场日期</span>
          <input
            type="date"
            value={form.date}
            onChange={(event) => update("date", event.target.value)}
          />
        </label>
        <label>
          <span>开始时间</span>
          <input
            type="time"
            value={form.start}
            onChange={(event) => update("start", event.target.value)}
          />
        </label>
        <label>
          <span>结束时间</span>
          <input
            type="time"
            value={form.end}
            onChange={(event) => update("end", event.target.value)}
          />
        </label>
        <label>
          <span>抬蹄耐受</span>
          <select
            value={form.tolerance}
            onChange={(event) => update("tolerance", event.target.value as Tolerance)}
          >
            {TOLERANCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}｜{option.hint}
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
            value={form.requiredAssistants}
            onChange={(event) => update("requiredAssistants", Number(event.target.value))}
          />
        </label>
        <label className="check-label wide">
          <input
            type="checkbox"
            checked={form.kickRecent}
            onChange={(event) => update("kickRecent", event.target.checked)}
          />
          <span>最近 30 天有踢踏 / 砸掌记录</span>
        </label>
        <label className="wide">
          <span>踢踏史详情</span>
          <input
            value={form.kickDetail}
            onChange={(event) => update("kickDetail", event.target.value)}
            placeholder="时间、蹄位、现场情况（选填）"
          />
        </label>
      </div>

      {error && <p className="form-error">提交被退回：{error}</p>}
      {toMinutes(form.end) <= toMinutes(form.start) && (
        <p className="form-error">结束时间必须晚于开始时间</p>
      )}

      <div className="form-foot">
        <button className="primary" onClick={submit}>
          加入到场队列
        </button>
        <p>入队后按 FIFO 排队；若时段被占或确认不齐，会退回“待确认”并列出冲突。</p>
      </div>
    </section>
  );
}

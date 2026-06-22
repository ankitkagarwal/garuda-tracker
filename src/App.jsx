import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { initGapi, signIn, signOut, isSignedIn, readRows, appendRow, updateRow } from "./api/sheets.js";

// ── Design Tokens ──────────────────────────────────────────────────────────
const T = {
  bg: "#0a0a0a", surface: "#111111", card: "#161616", border: "#222222",
  red: "#E31937", redDim: "#8B0F22", redGlow: "rgba(227,25,55,0.15)",
  text: "#F5F5F5", muted: "#888888", dim: "#444444", success: "#2ECC71",
  font: "'Inter','SF Pro Display',system-ui,sans-serif",
  mono: "'JetBrains Mono','SF Mono',monospace",
};

// ── Timezone Helpers (Dubai = UTC+4) ───────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const nowDubai = () => {
  const now = new Date();
  // Dubai is UTC+4
  const dubaiOffset = 4 * 60;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const dubai = new Date(utc + dubaiOffset * 60000);
  return {
    day:    dubai.getDate(),
    month:  dubai.getMonth(),
    year:   dubai.getFullYear(),
    hour:   dubai.getHours(),
    minute: dubai.getMinutes(),
    _date:  dubai,
  };
};

const dubaiISOString = () => {
  const d = nowDubai();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.year}-${pad(d.month+1)}-${pad(d.day)}T${pad(d.hour)}:${pad(d.minute)}:00+04:00`;
};

const formatDisplay = (day, month, year, hour, minute) =>
  `${String(day).padStart(2,"0")}-${MONTHS[month]}-${year} ${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;

const monthLabel = (dt) => {
  if (!dt) return "";
  const d = new Date(dt);
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
};

const fmt = (n, dec = 1) => n != null && n !== "" ? Number(n).toFixed(dec) : "—";

// ── Sub-components ─────────────────────────────────────────────────────────
const TeslaLogo = () => (
  <svg width="26" height="26" viewBox="0 0 342 512" fill={T.red}>
    <path d="M0 68.3C57 .1 171 0 171 0s114 .1 171 68.3c-47.7 4.5-81 8.8-171 8.8S47.7 72.8 0 68.3zM171 512L64.5 202c34.5 2.7 68.2 4 106.5 4s72-.7 106.5-4L171 512zm0-334.7c-52.2 0-98.7-2-140.2-5.8L65.4 284c29.7 2.2 68.7 3.5 105.6 3.5s75.9-1.3 105.6-3.5l34.6-111.5c-41.5 3.8-88 5.8-140.2 5.8z"/>
  </svg>
);

const Pill = ({ label, active, onClick, disabled }) => (
  <button onClick={disabled ? undefined : onClick} style={{
    padding: "8px 24px", borderRadius: 999,
    border: `1.5px solid ${active ? T.red : T.border}`,
    background: active ? T.red : "transparent",
    color: active ? "#fff" : disabled ? T.dim : T.muted,
    fontFamily: T.font, fontSize: 13, fontWeight: 600,
    letterSpacing: "0.05em", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1, transition: "all 0.2s",
  }}>{label}</button>
);

const Field = ({ label, value, onChange, type = "text", placeholder }) => (
  <div style={{ marginBottom: 18 }}>
    {label && <label style={{ display: "block", color: T.muted, fontSize: 11, fontFamily: T.font, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</label>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px", color: T.text, fontFamily: T.mono, fontSize: 15, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
      onFocus={e => e.target.style.borderColor = T.red}
      onBlur={e => e.target.style.borderColor = T.border}
    />
  </div>
);

const StatCard = ({ label, value, unit, accent }) => (
  <div style={{ background: T.card, border: `1px solid ${accent ? T.redDim : T.border}`, borderRadius: 12, padding: "16px", flex: 1, minWidth: 110, boxShadow: accent ? `0 0 20px ${T.redGlow}` : "none" }}>
    <div style={{ color: T.muted, fontSize: 10, fontFamily: T.font, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ color: accent ? T.red : T.text, fontSize: 22, fontFamily: T.mono, fontWeight: 700, lineHeight: 1 }}>
      {value}<span style={{ fontSize: 11, color: T.muted, marginLeft: 3, fontFamily: T.font }}>{unit}</span>
    </div>
  </div>
);

const Toast = ({ msg, type }) => (
  <div style={{
    position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
    background: type === "success" ? T.success : T.red,
    color: "#fff", padding: "12px 24px", borderRadius: 999,
    fontFamily: T.font, fontSize: 13, fontWeight: 600,
    boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 999, pointerEvents: "none",
    whiteSpace: "nowrap", animation: "fadeIn 0.2s ease",
  }}>{msg}</div>
);

// ── Roller Column ──────────────────────────────────────────────────────────
const RollerCol = ({ items, selected, onSelect, width = 52 }) => {
  const ITEM_H = 40;
  const ref = useRef(null);
  const idx = items.indexOf(selected);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = idx * ITEM_H;
  }, []);

  const handleScroll = () => {
    if (!ref.current) return;
    const nearest = Math.round(ref.current.scrollTop / ITEM_H);
    if (items[nearest] !== undefined) onSelect(items[nearest]);
  };

  return (
    <div style={{ position: "relative", width, height: ITEM_H * 5, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: ITEM_H * 2, background: `linear-gradient(to bottom, ${T.card}, transparent)`, zIndex: 2, pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_H * 2, background: `linear-gradient(to top, ${T.card}, transparent)`, zIndex: 2, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: ITEM_H * 2, left: 0, right: 0, height: ITEM_H, background: T.redGlow, borderTop: `1px solid ${T.redDim}`, borderBottom: `1px solid ${T.redDim}`, zIndex: 1, pointerEvents: "none" }} />
      <div ref={ref} onScroll={handleScroll} style={{ height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory", scrollbarWidth: "none", paddingTop: ITEM_H * 2, paddingBottom: ITEM_H * 2 }}>
        <style>{`div::-webkit-scrollbar{display:none}`}</style>
        {items.map((item, i) => (
          <div key={i} onClick={() => { onSelect(item); if (ref.current) ref.current.scrollTop = i * ITEM_H; }}
            style={{ height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center", scrollSnapAlign: "start", fontFamily: T.mono, fontSize: 15, fontWeight: item === selected ? 700 : 400, color: item === selected ? T.text : T.dim, cursor: "pointer", userSelect: "none" }}>
            {typeof item === "number" ? String(item).padStart(2, "0") : item}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Date Time Picker ───────────────────────────────────────────────────────
const DateTimePicker = ({ value, onChange, onClose }) => {
  const years   = Array.from({ length: 5 }, (_, i) => 2024 + i);
  const hours   = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const [sel, setSel] = useState(value);
  const s = k => v => setSel(p => ({ ...p, [k]: v }));
  const daysInMonth = new Date(sel.year, sel.month + 1, 0).getDate();
  const validDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "20px 16px 36px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ color: T.muted, fontSize: 11, fontFamily: T.font, letterSpacing: "0.08em", textTransform: "uppercase" }}>Set Date & Time</div>
          <div style={{ fontFamily: T.mono, fontSize: 12, color: T.red }}>{formatDisplay(sel.day, sel.month, sel.year, sel.hour, sel.minute)}</div>
        </div>
        <div style={{ display: "flex", gap: 2, justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
          <RollerCol items={validDays} selected={Math.min(sel.day, daysInMonth)} onSelect={s("day")} width={44} />
          <span style={{ color: T.dim, fontFamily: T.mono, fontSize: 16 }}>-</span>
          <RollerCol items={MONTHS} selected={MONTHS[sel.month]} onSelect={v => s("month")(MONTHS.indexOf(v))} width={50} />
          <span style={{ color: T.dim, fontFamily: T.mono, fontSize: 16 }}>-</span>
          <RollerCol items={years} selected={sel.year} onSelect={s("year")} width={60} />
          <span style={{ color: T.dim, fontFamily: T.mono, fontSize: 18, margin: "0 6px" }}>·</span>
          <RollerCol items={hours} selected={sel.hour} onSelect={s("hour")} width={42} />
          <span style={{ color: T.dim, fontFamily: T.mono, fontSize: 18 }}>:</span>
          <RollerCol items={minutes} selected={sel.minute} onSelect={s("minute")} width={42} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 10, background: "transparent", border: `1px solid ${T.border}`, color: T.muted, fontFamily: T.font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => { onChange(sel); onClose(); }} style={{ flex: 2, padding: 14, borderRadius: 10, background: T.red, border: "none", color: "#fff", fontFamily: T.font, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Confirm</button>
        </div>
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ color: T.muted, fontSize: 11, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color, fontFamily: T.mono, fontSize: 12 }}>{p.name}: <strong>{p.value}</strong></div>)}
    </div>
  );
};

// ── Log Screen ─────────────────────────────────────────────────────────────
const LogScreen = ({ sessions, setSessions, setToast }) => {
  const lastOpen = sessions.find(s => !s.unplug_ts);
  const hasOpen  = !!lastOpen;
  const [mode, setMode]           = useState(hasOpen ? "end" : "start");
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dateVal, setDateVal]     = useState(nowDubai());
  const [form, setForm]           = useState({ odometer: "", range_plugin: "", range_unplug: "", kwh_added: "", cost: "" });
  const [costMode, setCostMode]   = useState("auto");
  const f = k => v => setForm(p => ({ ...p, [k]: v }));
  const displayDate = formatDisplay(dateVal.day, dateVal.month, dateVal.year, dateVal.hour, dateVal.minute);

  // Keep mode in sync with session state
  useEffect(() => { setMode(hasOpen ? "end" : "start"); }, [hasOpen]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const ts = dubaiISOString();

      if (mode === "start") {
        if (!form.odometer || !form.range_plugin) { showToast("Odometer and range are required", "error"); return; }

        let updated = [...sessions];

        // Update kms_driven on previous session
        if (updated.length > 0) {
          const lastIdx = updated.length - 1;
          const last    = updated[lastIdx];
          if (last.kms_driven == null || last.kms_driven === "") {
            const newKmsDriven = Number(form.odometer) - Number(last.odometer);
            updated[lastIdx]   = { ...last, kms_driven: newKmsDriven };
            await updateRow(lastIdx, updated[lastIdx]); // targeted row update
          }
        }

        // Append new plug-in row
        const newRow = {
          id:           Date.now(),
          datetime:     displayDate,
          odometer:     Number(form.odometer),
          range_plugin: Number(form.range_plugin),
          range_unplug: null, kwh_added: null, kms_added: null, kms_driven: null, cost_aed: null,
          plugin_ts:    ts,
          unplug_ts:    null,
        };
        await appendRow(newRow); // append to sheet
        updated = [...updated, newRow];
        setSessions(updated);
        showToast("Plug-in logged ✓");
        setForm({ odometer: "", range_plugin: "", range_unplug: "", kwh_added: "", cost: "" });
        setDateVal(nowDubai());

      } else {
        if (!lastOpen) { showToast("No open session found", "error"); return; }
        if (!form.range_unplug || !form.kwh_added) { showToast("Range and kWh are required", "error"); return; }

        const kwh      = Number(form.kwh_added);
        const costVal  = costMode === "manual" && form.cost ? Number(form.cost) : parseFloat((kwh * 0.23).toFixed(2));
        const openIdx  = sessions.findIndex(s => s.id === lastOpen.id);
        const updated  = sessions.map((s, i) => i === openIdx ? {
          ...s,
          range_unplug: Number(form.range_unplug),
          kwh_added:    kwh,
          kms_added:    Number(form.range_unplug) - s.range_plugin,
          cost_aed:     costVal,
          unplug_ts:    ts,
        } : s);

        await updateRow(openIdx, updated[openIdx]); // targeted row update
        setSessions(updated);
        showToast(`Charge complete — AED ${costVal} ✓`);
        setForm({ odometer: "", range_plugin: "", range_unplug: "", kwh_added: "", cost: "" });
        setDateVal(nowDubai());
        setMode("start");
      }
    } catch (e) {
      showToast("Sync failed — check connection", "error");
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 24, justifyContent: "center" }}>
        <Pill label="PLUG IN"  active={mode === "start"} onClick={() => setMode("start")} disabled={hasOpen} />
        <Pill label="UNPLUG"   active={mode === "end"}   onClick={() => setMode("end")}   disabled={!hasOpen} />
      </div>

      {hasOpen && (
        <div style={{ background: T.redGlow, border: `1px solid ${T.redDim}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.red, boxShadow: `0 0 8px ${T.red}`, flexShrink: 0 }} />
          <span style={{ color: T.text, fontFamily: T.font, fontSize: 13 }}>
            Charging since <strong>{lastOpen.datetime}</strong> · {lastOpen.range_plugin} km at plug-in
          </span>
        </div>
      )}

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "24px 20px" }}>
        {mode === "start" && (
          <>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", color: T.muted, fontSize: 11, fontFamily: T.font, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Date & Time (Dubai)</label>
              <div onClick={() => setShowPicker(true)} style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px", color: T.text, fontFamily: T.mono, fontSize: 15, cursor: "pointer", display: "flex", justifyContent: "space-between", boxSizing: "border-box" }}>
                <span>{displayDate}</span>
                <span style={{ color: T.muted }}>✎</span>
              </div>
            </div>
            <Field label="Odometer (km)" value={form.odometer} onChange={f("odometer")} type="number" placeholder="e.g. 4545" />
            <Field label="Range at Plug-in (km)" value={form.range_plugin} onChange={f("range_plugin")} type="number" placeholder="e.g. 85" />
          </>
        )}

        {mode === "end" && (
          <>
            <Field label="Range at Unplug (km)" value={form.range_unplug} onChange={f("range_unplug")} type="number" placeholder="e.g. 352" />
            <Field label="kWh Added" value={form.kwh_added} onChange={f("kwh_added")} type="number" placeholder="e.g. 36" />
            <div style={{ marginBottom: 18 }}>
              <label style={{ color: T.muted, fontSize: 11, fontFamily: T.font, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Cost (AED)</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <Pill label="Auto (0.23/kWh)" active={costMode === "auto"}   onClick={() => setCostMode("auto")} />
                <Pill label="Manual"          active={costMode === "manual"} onClick={() => setCostMode("manual")} />
              </div>
              {costMode === "auto" && form.kwh_added && (
                <div style={{ color: T.muted, fontFamily: T.mono, fontSize: 13 }}>= AED <strong style={{ color: T.text }}>{(Number(form.kwh_added) * 0.23).toFixed(2)}</strong></div>
              )}
              {costMode === "manual" && <Field value={form.cost} onChange={f("cost")} type="number" placeholder="Enter total cost" />}
            </div>
          </>
        )}

        <button onClick={handleSubmit} disabled={submitting} style={{
          width: "100%", padding: 14, borderRadius: 10, background: submitting ? T.redDim : T.red,
          border: "none", color: "#fff", fontFamily: T.font, fontSize: 14, fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase", cursor: submitting ? "not-allowed" : "pointer",
          boxShadow: `0 0 24px ${T.redGlow}`, marginTop: 4,
        }}>
          {submitting ? "Saving…" : mode === "start" ? "Log Plug-in" : "Log Charge Complete"}
        </button>
      </div>

      {showPicker && <DateTimePicker value={dateVal} onChange={setDateVal} onClose={() => setShowPicker(false)} />}
    </div>
  );
};

// ── History Screen ─────────────────────────────────────────────────────────
const HistoryScreen = ({ sessions }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {[...sessions].reverse().map(s => {
      const isOpen = !s.unplug_ts;
      return (
        <div key={s.id} style={{ background: T.card, border: `1px solid ${isOpen ? T.redDim : T.border}`, borderRadius: 12, padding: "16px 18px", boxShadow: isOpen ? `0 0 16px ${T.redGlow}` : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ color: T.muted, fontFamily: T.font, fontSize: 12 }}>{s.datetime}</div>
            {isOpen
              ? <span style={{ background: T.redGlow, border: `1px solid ${T.red}`, color: T.red, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontFamily: T.font, fontWeight: 600 }}>CHARGING</span>
              : <span style={{ color: T.success, fontSize: 11, fontFamily: T.font, fontWeight: 600 }}>COMPLETE</span>
            }
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              ["ODO",     s.odometer ? `${s.odometer} km` : "—"],
              ["PLUG-IN", s.range_plugin ? `${s.range_plugin} km` : "—"],
              ["UNPLUG",  s.range_unplug ? `${s.range_unplug} km` : "—"],
              ["kWh",     s.kwh_added ?? "—"],
              ["ADDED",   s.kms_added ? `${s.kms_added} km` : "—"],
              ["DRIVEN",  s.kms_driven != null ? `${s.kms_driven} km` : "—"],
              ["COST",    s.cost_aed ? `AED ${s.cost_aed}` : "—"],
              ["EFF",     s.kms_driven && s.kwh_added ? `${(s.kms_driven / s.kwh_added).toFixed(1)} km/kWh` : "—"],
            ].map(([l, v]) => (
              <div key={l}>
                <div style={{ color: T.dim, fontSize: 10, fontFamily: T.font, letterSpacing: "0.06em" }}>{l}</div>
                <div style={{ color: T.text, fontSize: 13, fontFamily: T.mono, fontWeight: 600, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      );
    })}
  </div>
);

// ── Analytics Screen ───────────────────────────────────────────────────────
const AnalyticsScreen = ({ sessions }) => {
  const complete  = sessions.filter(s => s.range_unplug && s.kms_driven != null && s.kms_driven !== "");
  const last5     = complete.slice(-5);
  const totalKwh  = complete.reduce((a, s) => a + (Number(s.kwh_added) || 0), 0);
  const totalKm   = complete.reduce((a, s) => a + (Number(s.kms_driven) || 0), 0);
  const totalCost = complete.reduce((a, s) => a + (Number(s.cost_aed) || 0), 0);
  const avgEff    = totalKm && totalKwh ? (totalKm / totalKwh).toFixed(2) : "—";

  const monthlyCost = {}, monthlyEff = {}, monthlyCount = {};
  complete.forEach(s => {
    const m = monthLabel(s.plugin_ts || s.datetime);
    monthlyCost[m] = (monthlyCost[m] || 0) + (Number(s.cost_aed) || 0);
    if (s.kms_driven && s.kwh_added) {
      monthlyEff[m]   = (monthlyEff[m] || 0) + (Number(s.kms_driven) / Number(s.kwh_added));
      monthlyCount[m] = (monthlyCount[m] || 0) + 1;
    }
  });
  const monthlyData = Object.entries(monthlyCost).map(([month, cost]) => ({ month, cost: parseFloat(cost.toFixed(2)) }));
  const effData     = Object.entries(monthlyEff).map(([month, total]) => ({ month, efficiency: parseFloat((total / monthlyCount[month]).toFixed(2)) }));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Total km Driven" value={fmt(totalKm, 0)} unit="km" />
        <StatCard label="Total kWh"       value={fmt(totalKwh, 1)} unit="kWh" />
        <StatCard label="Avg Efficiency"  value={avgEff} unit="km/kWh" accent />
        <StatCard label="Total Spent"     value={fmt(totalCost, 2)} unit="AED" />
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 14px", marginBottom: 14 }}>
        <div style={{ color: T.muted, fontSize: 11, fontFamily: T.font, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>Last 5 — Range Added vs km Driven</div>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={last5.map(s => ({ name: s.datetime ? s.datetime.slice(0,6) : "", "Range Added": Number(s.kms_added)||0, "km Driven": Number(s.kms_driven)||0 }))} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="name" tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: T.muted, fontSize: 11, fontFamily: T.mono }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: T.muted, fontSize: 11 }} />
            <Bar dataKey="Range Added" fill={T.redDim} radius={[4,4,0,0]} />
            <Bar dataKey="km Driven"   fill={T.red}    radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 14px", marginBottom: 14 }}>
        <div style={{ color: T.muted, fontSize: 11, fontFamily: T.font, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>Monthly Charging Cost (AED)</div>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="month" tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: T.muted, fontSize: 11, fontFamily: T.mono }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="cost" fill={T.red} radius={[4,4,0,0]} name="Cost AED" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 14px" }}>
        <div style={{ color: T.muted, fontSize: 11, fontFamily: T.font, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>Monthly Avg Efficiency (km/kWh)</div>
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={effData}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="month" tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: T.muted, fontSize: 11, fontFamily: T.mono }} axisLine={false} tickLine={false} domain={["auto","auto"]} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="efficiency" stroke={T.red} strokeWidth={2} dot={{ fill: T.red, r: 4 }} name="km/kWh" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ── Auth Screen ────────────────────────────────────────────────────────────
const AuthScreen = ({ onSignIn, error }) => (
  <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <TeslaLogo />
    <div style={{ marginTop: 20, marginBottom: 8, fontSize: 22, fontWeight: 700, fontFamily: T.font, letterSpacing: "0.04em" }}>Garuda Tracker</div>
    <div style={{ color: T.muted, fontSize: 13, fontFamily: T.font, marginBottom: 40, textAlign: "center" }}>Sign in with Google to load your charging data from Google Sheets.</div>
    <button onClick={onSignIn} style={{ background: T.red, border: "none", color: "#fff", padding: "14px 32px", borderRadius: 10, fontSize: 15, fontWeight: 700, fontFamily: T.font, cursor: "pointer", boxShadow: `0 0 24px ${T.redGlow}` }}>
      Sign in with Google
    </button>
    {error && <div style={{ color: T.red, fontSize: 12, fontFamily: T.font, marginTop: 16 }}>{error}</div>}
  </div>
);

// ── App Shell ──────────────────────────────────────────────────────────────
export default function App() {
  const [authed,   setAuthed]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [authErr,  setAuthErr]  = useState("");
  const [sessions, setSessions] = useState([]);
  const [tab,      setTab]      = useState("log");
  const [toast,    setToast]    = useState(null);
  const isCharging = sessions.some(s => !s.unplug_ts);

  // Init GAPI on mount
  useEffect(() => {
    initGapi()
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);

  const handleSignIn = async () => {
    try {
      setAuthErr("");
      await signIn();
      const rows = await readRows();
      setSessions(rows);
      setAuthed(true);
    } catch (e) {
      setAuthErr("Something went wrong. Please try again.");
      console.error(e);
    }
  };

  const handleSignOut = () => {
    signOut();
    setAuthed(false);
    setSessions([]);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: T.muted, fontFamily: T.font, fontSize: 13 }}>Loading…</div>
    </div>
  );

  if (!authed) return <AuthScreen onSignIn={handleSignIn} error={authErr} />;

  const NAV = [
    { id: "log",       label: "Log",       icon: "⚡" },
    { id: "history",   label: "History",   icon: "📋" },
    { id: "analytics", label: "Analytics", icon: "📊" },
  ];

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: T.font, maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <style>{`*{box-sizing:border-box}input[type=number]::-webkit-inner-spin-button{opacity:.3}@keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>

      {/* Header */}
      <div style={{ padding: "18px 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${T.border}` }}>
        <TeslaLogo />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>Garuda</div>
          <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.06em" }}>MODEL 3 · TRIP TRACKER</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {isCharging && <span style={{ color: T.red, fontFamily: T.font, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em" }}>CHARGING</span>}
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: isCharging ? T.red : T.dim, boxShadow: isCharging ? `0 0 8px ${T.red}` : "none" }} />
          <button onClick={handleSignOut} style={{ background: "none", border: `1px solid ${T.border}`, color: T.dim, borderRadius: 6, padding: "4px 8px", fontSize: 10, fontFamily: T.font, cursor: "pointer" }}>Sign out</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 16px 90px" }}>
        {tab === "log"       && <LogScreen sessions={sessions} setSessions={setSessions} setToast={setToast} />}
        {tab === "history"   && <HistoryScreen sessions={sessions} />}
        {tab === "analytics" && <AnalyticsScreen sessions={sessions} />}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: T.surface, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-around", padding: "10px 0 16px" }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: tab === n.id ? T.red : T.dim, fontFamily: T.font, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", transition: "color 0.2s" }}>
            <span style={{ fontSize: 20 }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}

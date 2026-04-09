import { useState, useEffect, useCallback } from "react";

const DAYS_KR = ["일","월","화","수","목","금","토"];

// ── Claude API 호출 (웹 검색 포함, 멀티턴 안전 처리) ──────────────────
async function callClaude(messages, system) {
  const call = async (msgs, withSearch) => {
    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      system,
      messages: msgs,
      ...(withSearch ? { tools: [{ type: "web_search_20250305", name: "web_search" }] } : {})
    };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  };

  let data = await call(messages, true);

  // 서버가 tool_use를 반환하면 tool_result 포함 2차 호출
  if (data.stop_reason === "tool_use") {
    const toolResults = data.content
      .filter(b => b.type === "tool_use")
      .map(b => ({ type: "tool_result", tool_use_id: b.id, content: "검색 완료. 알고 있는 최신 정보를 바탕으로 JSON 형식으로만 답변해주세요." }));
    const newMsgs = [
      ...messages,
      { role: "assistant", content: data.content },
      { role: "user", content: toolResults }
    ];
    data = await call(newMsgs, false);
  }

  const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  return txt;
}

function extractJSON(text, isArray) {
  const re = isArray ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const m = text.match(re);
  if (!m) throw new Error("JSON 없음");
  try { return JSON.parse(m[0]); }
  catch { return JSON.parse(m[0].replace(/,\s*([}\]])/g, "$1")); }
}

// ── 시계 ─────────────────────────────────────────────────────────────
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const pad = n => String(n).padStart(2, "0");
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const ampm = h < 12 ? "오전" : "오후", h12 = h % 12 || 12;
  return (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 4, letterSpacing: 2 }}>
        {now.getFullYear()}년 {now.getMonth() + 1}월 {now.getDate()}일 ({DAYS_KR[now.getDay()]})
      </div>
      <div style={{ fontSize: 64, fontWeight: 700, color: "#f1f5f9", letterSpacing: 2, lineHeight: 1 }}>
        <span style={{ fontSize: 20, color: "#94a3b8", marginRight: 8 }}>{ampm}</span>
        {pad(h12)}:{pad(m)}<span style={{ color: "#475569", fontSize: 40 }}>:{pad(s)}</span>
      </div>
    </div>
  );
}

// ── 날씨 ─────────────────────────────────────────────────────────────
function WeatherSection({ delayMs = 0 }) {
  const [w, setW] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    const today = new Date().toLocaleDateString("ko-KR");
    callClaude(
      [{ role: "user", content: `천안시 오늘(${today}) 현재 날씨를 검색해서 아래 JSON 구조로만 응답해. 다른 텍스트 없이 JSON만.\n{"temp":숫자,"feelsLike":숫자,"humidity":숫자,"windspeed":숫자,"condition":"날씨 상태","icon":"이모지","forecast":[{"day":"오늘","icon":"이모지","high":숫자,"low":숫자},{"day":"내일","icon":"이모지","high":숫자,"low":숫자},{"day":"모레","icon":"이모지","high":숫자,"low":숫자}]}` }],
      "You are a weather API. Return ONLY valid JSON, no explanation, no markdown."
    )
      .then(txt => { setW(extractJSON(txt, false)); setLoading(false); })
      .catch(e => { setErr("날씨 오류: " + e.message); setLoading(false); });
  }, []);

  useEffect(() => { const t = setTimeout(load, delayMs); return () => clearTimeout(t); }, []);

  return (
    <Card title="🌤️ 날씨 — 천안시" action={
      <button onClick={load} disabled={loading} style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", borderRadius: 8, padding: "4px 12px", fontSize: 12, cursor: loading ? "not-allowed" : "pointer" }}>
        {loading ? "불러오는 중..." : "🔄 새로고침"}
      </button>
    }>
      {loading ? <Spinner label="날씨 불러오는 중..." /> : err ? <Err msg={err} /> : w && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <span style={{ fontSize: 56 }}>{w.icon}</span>
            <div>
              <div style={{ fontSize: 42, fontWeight: 700, color: "#f1f5f9" }}>{w.temp}°C</div>
              <div style={{ color: "#94a3b8", fontSize: 14 }}>{w.condition} · 체감 {w.feelsLike}°C</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#94a3b8" }}>
              <span>💧 습도 {w.humidity}%</span>
              <span>💨 풍속 {w.windspeed} km/h</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {w.forecast.map((f, i) => (
              <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 6px", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{f.day}</div>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</div>
                <div style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 600 }}>{f.high}°</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{f.low}°</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ── 뉴스 ─────────────────────────────────────────────────────────────
const CAT_COLOR = { "모델출시": "#6366f1", "연구": "#0ea5e9", "정책": "#f59e0b", "산업": "#10b981", "기타": "#8b5cf6" };

function NewsSection() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [updated, setUpdated] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    const today = new Date().toISOString().split("T")[0];
    callClaude(
      [{ role: "user", content: `오늘은 ${today}이야. 최근 2~3일간 가장 중요한 AI 뉴스 5개를 검색해서 아래 JSON 배열로만 응답해. 마크다운, 설명 없이 JSON 배열만.\n[{"title":"뉴스 제목(영문 가능)","summary":"한국어 2~3문장 요약","source":"출처명","category":"모델출시|연구|정책|산업|기타"}]` }],
      `You are a JSON-only AI news API. Today is ${today}. Return ONLY a valid JSON array starting with [ and ending with ]. No markdown, no explanation.`
    )
      .then(txt => { setNews(extractJSON(txt, true)); setUpdated(new Date()); setLoading(false); })
      .catch(e => { setErr("뉴스 오류: " + e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card title="🤖 AI 최신 뉴스" action={
      <button onClick={load} disabled={loading} style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", borderRadius: 8, padding: "4px 12px", fontSize: 12, cursor: loading ? "not-allowed" : "pointer" }}>
        {loading ? "불러오는 중..." : "🔄 새로고침"}
      </button>
    }>
      {updated && <div style={{ fontSize: 11, color: "#475569", marginBottom: 12 }}>업데이트: {updated.toLocaleTimeString("ko-KR")}</div>}
      {loading ? <Spinner label="AI 뉴스 검색 중..." /> : err ? <Err msg={err} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {news.map((item, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: (CAT_COLOR[item.category] || "#8b5cf6") + "22", color: CAT_COLOR[item.category] || "#8b5cf6" }}>{item.category}</span>
                <span style={{ fontSize: 11, color: "#475569" }}>{item.source}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 6, lineHeight: 1.5 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7 }}>{item.summary}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────
function Card({ title, children, action }) {
  return (
    <div style={{ background: "rgba(15,23,42,0.7)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#cbd5e1" }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 0" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(99,102,241,0.2)", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      {label && <span style={{ fontSize: 12, color: "#475569" }}>{label}</span>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Err({ msg }) {
  return <p style={{ color: "#ef4444", fontSize: 13, margin: 0, padding: 12, background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>{msg}</p>;
}

// ── 앱 ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f0f1a 0%,#0f172a 50%,#0a0f1e 100%)", fontFamily: "'Segoe UI',system-ui,sans-serif", padding: "32px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Clock />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <WeatherSection delayMs={0} />
          <NewsSection delayMs={3000} />
        </div>
        <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#1e293b" }}>나만의 홈페이지 ✦ 천안</div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { supabase, isSupabaseConfigured } from "./supabase";

const PERIODS = ["AM", "PM"];
const G = {
  red: "#c80f0f", gold: "#fdc400", yellow: "#ffdd00", green: "#89ae10",
  cyan: "#009bc2", blue: "#0077b2", purple: "#876ba1",
  redL: "#eba1a3", greenL: "#bfd688", cyanL: "#83c8d1", blueL: "#6dcff6",
  pinkBg: "#f4d8d3", yellowBg: "#ffffa8", greenBg: "#ddeabb",
  cyanBg: "#bde3e5", purpleBg: "#dfd6e7", grayBg: "#e8e8e8",
  grayMid: "#b2b2b2", black: "#000000", grayDk: "#6f6f6f", white: "#ffffff",
};
const COLORS = [G.red, G.cyan, G.green, G.gold, G.purple, G.blue, G.redL, G.cyanL];
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function getMonday(d) {
  const date = new Date(d); const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0); return date;
}
function fmtDate(d) { return new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }); }
function fmtWeek(d) {
  const m = new Date(d), f = new Date(m); f.setDate(m.getDate() + 4);
  return `${fmtDate(m)} — ${fmtDate(f)}`;
}
function weekKey(d) { return getMonday(d).toISOString().split("T")[0]; }
function todayWeekKey() { return weekKey(new Date()); }
function nextWeekKey() { const d = getMonday(new Date()); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; }
function isUpcomingFridayHoliday(holidays) {
  const monday = getMonday(new Date());
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fridayStr = toDateStr(friday);
  return holidays.some(h => h.date === fridayStr && h.block_am && h.block_pm);
}
function canGoForward(wk, holidays) {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const unlocked = day > 5 || day === 0 || (day === 5 && hour >= 8) || (day === 4 && hour >= 8 && isUpcomingFridayHoliday(holidays));
  const maxWeek = unlocked ? nextWeekKey() : todayWeekKey();
  return wk < maxWeek;
}
function isCurrentWeek(wk) { return wk === todayWeekKey(); }
function isNextWeek(wk) { return wk === nextWeekKey(); }
function toDateStr(d) { return d.toISOString().split("T")[0]; }
function officeImgPath(name) {
  return `/cepal-cluster/offices/${name.toLowerCase().replace(/\s+/g, "-").replace(/\./g, "")}.png`;
}

/* ═══ TOAST SYSTEM ═══ */
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

function ToastHost({ toasts }) {
  const cfg = {
    success: { bg: "#E8F5E9", border: "#89ae10", color: "#3d5200", icon: "✓" },
    error: { bg: "#FDECEA", border: G.red, color: "#8a0a0a", icon: "!" },
    info: { bg: "#E5F0FF", border: G.blue, color: "#00446b", icon: "i" },
  };
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 3000, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => {
        const c = cfg[t.type] || cfg.info;
        return (
          <div key={t.id} style={{
            display: "flex", alignItems: "center", gap: 10, minWidth: 220, maxWidth: 340,
            background: c.bg, border: `1px solid ${c.border}`, borderLeft: `4px solid ${c.border}`,
            borderRadius: 8, padding: "10px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.16)",
            animation: "toastIn 0.22s cubic-bezier(0.2,0.8,0.2,1)",
          }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: c.border, color: G.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{c.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.color }}>{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══ DIALOG (modal confirm / prompt) ═══ */
const DialogCtx = createContext({ confirm: () => Promise.resolve(false), prompt: () => Promise.resolve(null) });
const useDialog = () => useContext(DialogCtx);

function DialogHost({ dialog, onClose }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (dialog) {
      setValue(dialog.defaultValue || "");
      const t = setTimeout(() => { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, 40);
      return () => clearTimeout(t);
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose(dialog.type === "confirm" ? false : null);
      if (e.key === "Enter" && dialog.type === "confirm") onClose(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog, onClose]);

  if (!dialog) return null;
  const isPrompt = dialog.type === "prompt";
  const danger = dialog.danger;
  const confirmColor = danger ? G.red : G.blue;

  const submit = () => onClose(isPrompt ? value : true);
  const cancel = () => onClose(isPrompt ? null : false);

  return (
    <div onMouseDown={cancel} style={{
      position: "fixed", inset: 0, zIndex: 2500, background: "rgba(50,54,58,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      animation: "fadeIn 0.15s ease",
    }}>
      <div onMouseDown={e => e.stopPropagation()} style={{
        background: G.white, borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
        width: "100%", maxWidth: 400, overflow: "hidden", animation: "toastIn 0.2s cubic-bezier(0.2,0.8,0.2,1)",
      }}>
        <div style={{ height: 4, background: confirmColor }} />
        <div style={{ padding: "22px 24px" }}>
          {dialog.title && <div style={{ fontSize: 16, fontWeight: 700, color: "#32363A", marginBottom: 6 }}>{dialog.title}</div>}
          <div style={{ fontSize: 13.5, color: G.grayDk, lineHeight: 1.5 }}>{dialog.message}</div>
          {isPrompt && (
            <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              style={{ ...F.input, width: "100%", marginTop: 14, flex: "none" }} />
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 24px 20px" }}>
          <button onClick={cancel} style={{ ...F.navBtn, padding: "9px 18px" }}>{dialog.cancelLabel || "Cancelar"}</button>
          <button onClick={submit} style={{ ...F.primaryBtn, background: confirmColor, padding: "9px 18px" }}>{dialog.confirmLabel || (danger ? "Eliminar" : "Aceptar")}</button>
        </div>
      </div>
    </div>
  );
}

function useDB() {
  const [people, setPeople] = useState([]);
  const [desks, setDesks] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Faltan las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Crea un archivo .env en base a .env.example.");
      setLoading(false);
      return;
    }
    try {
      const [p, d, a, h] = await Promise.all([
        supabase.from("people").select("*").order("created_at"),
        supabase.from("desks").select("*").order("sort_order"),
        supabase.from("attendance").select("*"),
        supabase.from("holidays").select("*").order("date"),
      ]);
      const firstError = p.error || d.error || a.error || h.error;
      if (firstError) throw firstError;
      setPeople(p.data); setDesks(d.data); setAttendance(a.data); setHolidays(h.data || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const ch = supabase.channel("rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "people" }, () =>
        supabase.from("people").select("*").order("created_at").then(r => r.data && setPeople(r.data)))
      .on("postgres_changes", { event: "*", schema: "public", table: "desks" }, () =>
        supabase.from("desks").select("*").order("sort_order").then(r => r.data && setDesks(r.data)))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () =>
        supabase.from("attendance").select("*").then(r => r.data && setAttendance(r.data)))
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, () =>
        supabase.from("holidays").select("*").order("date").then(r => r.data && setHolidays(r.data)))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  return { people, desks, attendance, holidays, loading, error, reload: load };
}

export default function App() {
  const getTab = () => {
    const h = window.location.hash.replace("#", "");
    return ["registro", "historial", "dashboard", "config"].includes(h) ? h : "registro";
  };
  const [tab, setTabState] = useState(getTab);
  const [navStack, setNavStack] = useState(() => [getTab()]);
  const navigateTo = (t) => {
    window.location.hash = t;
    setTabState(t);
    setNavStack(s => [...s.filter(x => x !== t), t]);
  };
  const setTab = navigateTo;
  const goBack = () => {
    setNavStack(s => {
      if (s.length <= 1) {
        if (s[0] === "registro") return s;
        window.location.hash = "registro";
        setTabState("registro");
        return ["registro"];
      }
      const newStack = s.slice(0, -1);
      const target = newStack[newStack.length - 1];
      window.location.hash = target;
      setTabState(target);
      return newStack;
    });
  };
  const goHome = () => navigateTo("registro");
  useEffect(() => {
    const handler = () => setTabState(getTab());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const [currentWeek, setCurrentWeek] = useState(todayWeekKey());
  const db = useDB();

  const [toasts, setToasts] = useState([]);
  const notify = useCallback((msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(ts => [...ts, { id, msg, type }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 2600);
  }, []);

  const [dialog, setDialog] = useState(null);
  const dialogResolveRef = useRef(null);
  const closeDialog = useCallback((result) => {
    setDialog(null);
    if (dialogResolveRef.current) { dialogResolveRef.current(result); dialogResolveRef.current = null; }
  }, []);
  const dialogApi = useMemo(() => ({
    confirm: (message, opts = {}) => new Promise(resolve => {
      dialogResolveRef.current = resolve;
      setDialog({ type: "confirm", message, danger: opts.danger, title: opts.title, confirmLabel: opts.confirmLabel, cancelLabel: opts.cancelLabel });
    }),
    prompt: (message, defaultValue = "", opts = {}) => new Promise(resolve => {
      dialogResolveRef.current = resolve;
      setDialog({ type: "prompt", message, defaultValue, title: opts.title, confirmLabel: opts.confirmLabel || "Guardar" });
    }),
  }), []);

  if (db.loading) return (
    <div style={F.loadWrap}>
      <img src="/cepal-cluster/branding/giz-workzone-logo.png" alt="GIZ WorkZone" style={{ height: 30, marginBottom: 28, opacity: 0.95 }} />
      <div style={F.spinner} />
      <p style={{ color: G.grayDk, marginTop: 16, fontSize: 13, letterSpacing: 0.3 }}>Cargando registro de asistencia…</p>
    </div>
  );
  if (db.error) return (
    <div style={F.loadWrap}>
      <div style={{ ...F.card, maxWidth: 440, width: "90%", padding: 0, overflow: "hidden", marginBottom: 0 }}>
        <div style={{ background: G.red, height: 4 }} />
        <div style={{ padding: 32, textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#FDECEA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 26, color: G.red, fontWeight: 800 }}>!</div>
          <h2 style={{ color: "#32363A", fontSize: 18, fontWeight: 700 }}>Error de conexión</h2>
          <p style={{ color: G.grayDk, marginTop: 8, fontSize: 13 }}>Verifica las variables de entorno.</p>
          <pre style={{ background: "#F5F6F7", border: "1px solid #DEE2E6", borderRadius: 6, padding: 12, marginTop: 16, fontSize: 12, color: G.grayDk, textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{db.error}</pre>
        </div>
      </div>
    </div>
  );

  const tabs = [
    { id: "registro", label: "Registro Semanal" },
    { id: "historial", label: "Historial" },
    { id: "dashboard", label: "Dashboard" },
    { id: "config", label: "Configuración" },
  ];
  const sectionLabel = tabs.find(t => t.id === tab)?.label || "";
  const atHome = tab === "registro";

  return (
    <ToastCtx.Provider value={notify}>
    <DialogCtx.Provider value={dialogApi}>
    <div style={F.root}>
      <header style={F.shell}>
        <div style={F.shellInner}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/cepal-cluster/branding/giz-workzone-logo.png" alt="GIZ WorkZone" style={F.shellLogo} />
            <div style={F.shellDivider} />
            {!atHome && (
              <>
                <button onClick={goBack} style={F.iconBtn} title="Atrás" aria-label="Atrás">
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={G.grayDk} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <button onClick={goHome} style={F.iconBtn} title="Inicio" aria-label="Inicio">
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={G.grayDk} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>
                </button>
              </>
            )}
            <div>
              <div style={F.shellTitle}>{sectionLabel}</div>
              <div style={F.shellSub}>Clúster CEPAL-DEK · Av. Dag Hammarskjöld 3477</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div ref={menuRef} style={{ position: "relative" }}>
              <button onClick={() => setMenuOpen(o => !o)} style={F.menuButton} aria-haspopup="true" aria-expanded={menuOpen} title="Menú">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={G.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15 1.65 1.65 0 0 0 3.17 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.29l.06.06A1.65 1.65 0 0 0 8.92 4.6 1.65 1.65 0 0 0 9.92 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {menuOpen && (
                <div style={F.menuDropdown}>
                  {tabs.map(t => (
                    <button key={t.id} onClick={() => { setTab(t.id); setMenuOpen(false); }} style={{ ...F.menuItem, ...(tab === t.id ? F.menuItemActive : {}) }}>
                      {t.label}
                      {tab === t.id && <span>✓</span>}
                    </button>
                  ))}
                  <div style={F.menuDivider} />
                  <a href="https://cszreik.github.io/cepal-cluster/core-cepal.html" target="_blank" rel="noopener" onClick={() => setMenuOpen(false)} style={F.menuItemMuted}>
                    <span>CORE · Guía</span>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main style={F.main}>
        {tab === "registro" && <RegistroTab db={db} currentWeek={currentWeek} setCurrentWeek={setCurrentWeek} />}
        {tab === "historial" && <HistorialTab db={db} />}
        {tab === "dashboard" && <DashboardTab db={db} />}
        {tab === "config" && <ConfigTab db={db} />}
      </main>
      <footer style={F.footer}>© 2026 GIZ — Deutsche Gesellschaft für Internationale Zusammenarbeit</footer>
    </div>
    <ToastHost toasts={toasts} />
    <DialogHost dialog={dialog} onClose={closeDialog} />
    </DialogCtx.Provider>
    </ToastCtx.Provider>
  );
}
function OfficeHover({ name }) {
  const [show, setShow] = useState(false);
  const [imgError, setImgError] = useState(false);
  return (
    <>
      <span style={{ cursor: "pointer", borderBottom: "1px dashed #999" }}
        onMouseEnter={() => setShow(true)} onMouseLeave={() => { setShow(false); setImgError(false); }}>
        {name}
        <span style={{ fontSize: 8, color: "#009bc2", marginLeft: 3 }}>[ver]</span>
      </span>
      {show && !imgError && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 999,
          background: G.white, border: "1px solid #DEE2E6", borderRadius: 10,
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 10, width: 630,
          pointerEvents: "none",
        }}>
          <img src={officeImgPath(name)} alt={name}
            onError={() => setImgError(true)}
            style={{ width: "100%", borderRadius: 6, display: "block" }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: "#32363A", textAlign: "center", marginTop: 8 }}>{name}</div>
        </div>
      )}
    </>
  );
}
/* ═══ REGISTRO ═══ */
function RegistroTab({ db, currentWeek, setCurrentWeek }) {
  const { people, desks, attendance, holidays } = db;
  const notify = useToast();
  const { prompt: promptDialog } = useDialog();
  const [saving, setSaving] = useState(false);
  const activePeople = people.filter(p => p.active);
  const monday = new Date(currentWeek + "T00:00:00");
  const weekDates = DAYS.map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });

  const { weekRecords, weekNotes } = useMemo(() => {
    const rec = {}, notes = {};
    attendance.filter(a => a.week_key === currentWeek).forEach(a => {
      const k = `${a.desk_id}_${a.day_index}_${a.period}`;
      rec[k] = a.person_id;
      notes[k] = a.notes || "";
    });
    return { weekRecords: rec, weekNotes: notes };
  }, [attendance, currentWeek]);

  // Holiday lookup for this week's dates
  const dayHolidays = useMemo(() => {
    return weekDates.map(d => {
      const ds = toDateStr(d);
      return holidays.find(h => h.date === ds) || null;
    });
  }, [weekDates, holidays]);

  // Person ids already assigned to some desk for a given day+period, so they
  // don't appear as selectable in other desks for that same slot.
  const usedByDayPeriod = useMemo(() => {
    const m = {};
    Object.entries(weekRecords).forEach(([key, pid]) => {
      const [, dayIdx, period] = key.split("_");
      const k = `${dayIdx}_${period}`;
      if (!m[k]) m[k] = new Set();
      m[k].add(pid);
    });
    return m;
  }, [weekRecords]);

  const isCurrent = isCurrentWeek(currentWeek);
  const isNext = isNextWeek(currentWeek);
  const isPast = !isCurrent && !isNext && currentWeek < todayWeekKey();

  const setCell = async (deskId, dayIdx, period, personId) => {
    setSaving(true);
    try {
      if (personId === "") {
        const { error } = await supabase.from("attendance").delete()
          .eq("week_key", currentWeek).eq("day_index", dayIdx)
          .eq("desk_id", deskId).eq("period", period);
        if (error) throw error;
        notify("Asignación eliminada", "info");
      } else {
        const { error } = await supabase.from("attendance").upsert({
          week_key: currentWeek, day_index: dayIdx,
          desk_id: deskId, person_id: personId, period: period,
        }, { onConflict: "week_key,day_index,desk_id,period" });
        if (error) throw error;
        const who = people.find(p => p.id === personId);
        notify(`${who ? who.initials : "Persona"} · ${DAYS[dayIdx]} ${period} guardado`);
      }
    } catch (e) { console.error(e); notify("No se pudo guardar", "error"); }
    await db.reload();
    setSaving(false);
  };

  const editNote = async (deskId, dayIdx, period) => {
    const key = `${deskId}_${dayIdx}_${period}`;
    if (!weekRecords[key]) return;
    const current = weekNotes[key] || "";
    const note = await promptDialog("Nota para este turno:", current, { title: "Nota" });
    if (note === null) return;
    const { error } = await supabase.from("attendance").update({ notes: note })
      .eq("week_key", currentWeek).eq("day_index", dayIdx)
      .eq("desk_id", deskId).eq("period", period);
    if (error) notify("No se pudo guardar la nota", "error");
    else notify(note.trim() ? "Nota guardada" : "Nota eliminada", "info");
    await db.reload();
  };

  const changeWeek = (offset) => {
    const m = new Date(monday); m.setDate(m.getDate() + offset * 7);
    const nk = weekKey(m);
    if (nk > nextWeekKey()) return;
    setCurrentWeek(nk);
  };
  const goToday = () => setCurrentWeek(todayWeekKey());

  const availDesks = desks.filter(d => d.status === "available");
  const totalSlotsPerDay = availDesks.length * 2;
  const occByDay = DAYS.map((_, dayIdx) => {
    let count = 0;
    availDesks.forEach(d => { PERIODS.forEach(p => { if (weekRecords[`${d.id}_${dayIdx}_${p}`]) count++; }); });
    return count;
  });
  const totalOcc = occByDay.reduce((a, b) => a + b, 0);
  const avgPct = totalSlotsPerDay > 0 ? totalOcc / (totalSlotsPerDay * 5) : 0;

  const grouped = {};
  desks.forEach(d => { if (!grouped[d.office]) grouped[d.office] = []; grouped[d.office].push(d); });

  const todayDow = new Date().getDay();
  const todayDayIdx = isCurrent && todayDow >= 1 && todayDow <= 5 ? todayDow - 1 : -1;

  return (
    <div>
      <div style={F.objectHeader}>
        <div style={F.objectHeaderTop}>
          <div>
            <div style={F.objectHeaderLabel}>Semana</div>
            <div style={F.objectHeaderTitle}>{fmtWeek(monday)}</div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={F.kpiMini}><div style={F.kpiMiniVal}>{totalOcc}</div><div style={F.kpiMiniLabel}>Asignaciones</div></div>
            <div style={F.kpiMini}><div style={{ ...F.kpiMiniVal, color: avgPct >= 0.6 ? G.green : avgPct >= 0.3 ? G.gold : G.red }}>{Math.round(avgPct * 100)}%</div><div style={F.kpiMiniLabel}>Ocupación</div></div>
            <div style={F.kpiMini}><div style={F.kpiMiniVal}>{availDesks.length}</div><div style={F.kpiMiniLabel}>Escritorios</div></div>
          </div>
        </div>
        <div style={F.weekNav}>
          <button onClick={() => changeWeek(-1)} style={F.navBtn}>‹ Anterior</button>
          {isCurrent
            ? <span style={{ ...F.badge, background: G.cyan, color: G.white, padding: "7px 14px" }}>Semana Actual</span>
            : <button onClick={goToday} style={{ ...F.navBtn, background: G.red, color: G.white, fontWeight: 700, border: "none" }}>● Semana Actual</button>}
          <button onClick={() => changeWeek(1)} disabled={!canGoForward(currentWeek, holidays)} style={{ ...F.navBtn, ...(!canGoForward(currentWeek, holidays) ? F.navBtnDisabled : {}) }}>Siguiente ›</button>
          {saving && <span style={{ ...F.badge, background: "#E5F0FF", color: G.blue, marginLeft: 4 }}>Guardando…</span>}
        </div>
      </div>

      {/* Day occupation cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
        {DAYS.map((day, i) => {
          const hol = dayHolidays[i];
          const holAM = hol && hol.block_am;
          const holPM = hol && hol.block_pm;
          const fullHoliday = holAM && holPM;
          const pct = totalSlotsPerDay > 0 ? occByDay[i] / totalSlotsPerDay : 0;
          const isToday = i === todayDayIdx;
          const c = fullHoliday ? G.grayMid : pct >= 0.75 ? G.green : pct >= 0.4 ? G.gold : G.red;
          return (
            <div key={i} style={{ ...F.card, padding: "10px 12px", marginBottom: 0, borderTop: isToday ? `3px solid ${G.red}` : fullHoliday ? `3px solid ${G.gold}` : "3px solid transparent", background: fullHoliday ? G.yellowBg : G.white }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: isToday ? G.red : G.grayDk }}>{day}</span>
                <span style={{ fontSize: 10, color: G.grayDk }}>{fmtDate(weekDates[i])}</span>
              </div>
              {fullHoliday ? (
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#8A6D00" }}>FERIADO</div>
                  <div style={{ fontSize: 10, color: "#8A6D00", marginTop: 2 }}>{hol.name}</div>
                </div>
              ) : (
                <>
                  {hol && <div style={{ fontSize: 9, color: "#8A6D00", marginTop: 4, fontWeight: 700 }}>{hol.name} ({holAM ? "AM" : "PM"})</div>}
                  <div style={{ height: 4, background: G.grayBg, borderRadius: 2, marginTop: hol ? 4 : 8 }}>
                    <div style={{ height: "100%", width: `${Math.max(pct * 100, 2)}%`, background: c, borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: c }}>{Math.round(pct * 100)}%</span>
                    <span style={{ fontSize: 11, color: G.grayDk, alignSelf: "flex-end" }}>{occByDay[i]}/{totalSlotsPerDay}</span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div style={{ ...F.card, overflow: "hidden" }}>
        <div style={F.cardHeader}>
          <span style={F.cardHeaderText}>Asignación de Escritorios</span>
          <span style={{ fontSize: 11, color: G.grayDk, marginLeft: 12 }}>AM = mañana · PM = tarde · Doble click en celda para agregar nota</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={F.table}>
            <thead>
              <tr>
                <th style={{ ...F.th, position: "sticky", left: 0, zIndex: 4, minWidth: 100, background: "#354A5F" }} rowSpan={2}>Oficina</th>
                <th style={{ ...F.th, position: "sticky", left: 100, zIndex: 4, minWidth: 100, background: "#354A5F" }} rowSpan={2}>Escritorio</th>
                {DAYS.map((d, i) => {
                  const hol = dayHolidays[i];
                  const fullH = hol && hol.block_am && hol.block_pm;
                  return (
                    <th key={i} colSpan={2} style={{ ...F.th, textAlign: "center", minWidth: fullH ? 190 : 160, background: fullH ? "#8A6D00" : i === todayDayIdx ? G.red : "#354A5F", borderLeft: "1px solid rgba(255,255,255,0.15)" }}>
                      <div>{d}</div>
                      <div
                        title={fullH ? hol.name : undefined}
                        style={{
                          fontWeight: 400, fontSize: 10, opacity: 0.85, marginTop: 5,
                          textTransform: "none", letterSpacing: "normal",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          maxWidth: fullH ? 180 : "none", marginLeft: "auto", marginRight: "auto",
                        }}
                      >
                        {fmtDate(weekDates[i])}{fullH ? ` · ${hol.name}` : ""}
                      </div>
                    </th>
                  );
                })}
              </tr>
              <tr>
                {DAYS.map((_, i) =>
                  PERIODS.map(p => {
                    const hol = dayHolidays[i];
                    const isBlocked = hol && ((p === "AM" && hol.block_am) || (p === "PM" && hol.block_pm));
                    return (
                      <th key={`${i}_${p}`} style={{
                        ...F.th, textAlign: "center", fontSize: isBlocked ? 8.5 : 10, padding: "4px 6px",
                        background: isBlocked ? "#B8960A" : i === todayDayIdx ? (p === "AM" ? "#a00c0c" : "#8a0a0a") : (p === "AM" ? "#2C3E50" : "#243342"),
                        borderLeft: p === "AM" ? "1px solid rgba(255,255,255,0.15)" : "none", letterSpacing: isBlocked ? 0.4 : 1.5,
                      }}>{isBlocked ? "Feriado" : p}</th>
                    );
                  })
                )}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([office, offDesks]) =>
                offDesks.map((desk, dIdx) => {
                  const deskBlocked = desk.status !== "available";
                  return (
                    <tr key={desk.id} style={{ background: deskBlocked ? "#FFF3F0" : dIdx % 2 === 0 ? "#FAFBFC" : G.white }}>
                      {dIdx === 0 && (
                        <td style={{ ...F.td, position: "sticky", left: 0, fontWeight: 700, background: deskBlocked ? "#FFF3F0" : "#F5F6F7", borderRight: `1px solid ${G.grayBg}`, fontSize: 11, zIndex: 2 }}
                          rowSpan={offDesks.length}>
                          <OfficeHover name={office} />
                        </td>
                      )}
                      <td style={{ ...F.td, position: "sticky", left: 100, background: deskBlocked ? "#FFF3F0" : dIdx % 2 === 0 ? "#FAFBFC" : G.white, borderRight: `1px solid ${G.grayBg}`, fontSize: 11, zIndex: 1 }}>
                        {desk.desk}
                        {desk.status === "reserved" && <span style={{ ...F.statusBadge, background: "#FFF3F0", color: G.red }}>Reservado</span>}
                        {desk.status === "maintenance" && <span style={{ ...F.statusBadge, background: G.yellowBg, color: "#8A6D00" }}>Mantención</span>}
                      </td>
                      {DAYS.map((_, dayIdx) =>
                        PERIODS.map(period => {
                          const hol = dayHolidays[dayIdx];
                          const holBlocked = hol && ((period === "AM" && hol.block_am) || (period === "PM" && hol.block_pm));
                          const blocked = (desk.status === "maintenance") || holBlocked;
                          const key = `${desk.id}_${dayIdx}_${period}`;
                          const pid = weekRecords[key];
                          const person = people.find(p => p.id === pid);
                          const note = weekNotes[key];
                          const isToday = dayIdx === todayDayIdx;
                          const isAM = period === "AM";
                          const usedSet = usedByDayPeriod[`${dayIdx}_${period}`];
                          const selectablePeople = usedSet ? activePeople.filter(p => p.id === pid || !usedSet.has(p.id)) : activePeople;
                          return (
                            <td key={`${dayIdx}_${period}`} style={{
                              ...F.td, padding: 2,
                              background: holBlocked ? G.yellowBg : deskBlocked ? "#FFF3F0" : isToday ? "#FFF8F6" : undefined,
                              borderLeft: isAM ? `1px solid ${G.grayBg}` : "none",
                            }}>
                              {blocked ? (
                                <div style={{ textAlign: "center", color: holBlocked ? "#8A6D00" : G.grayMid, fontSize: holBlocked ? 10 : 12, fontWeight: holBlocked ? 700 : 400 }}>
                                  {holBlocked ? "Feriado" : "—"}
                                </div>
                              ) : (
                                <div onDoubleClick={() => person && editNote(desk.id, dayIdx, period)} title={note ? `Nota: ${note}` : ""}>
                                  <select title={person ? (person.name + (note ? ` — Nota: ${note}` : "")) : "Elegir persona"} value={pid || ""} onChange={e => setCell(desk.id, dayIdx, period, e.target.value)} style={{
                                    ...F.selectSmall,
                                    borderColor: person ? (isAM ? G.cyan : G.purple) : "#DEE2E6",
                                    background: person ? (isAM ? "#EBF8FA" : "#F3EFF7") : G.white,
                                    color: person ? (isAM ? "#004E66" : "#4A3560") : G.grayDk,
                                    fontWeight: person ? 700 : 400,
                                  }}>
                                    <option value="">—</option>
                                    {selectablePeople.map(p => <option key={p.id} value={p.id} title={p.name}>{p.initials}</option>)}
                                  </select>
                                  {person && note && (
                                    <div title={note} style={{
                                      marginTop: 2, padding: "1px 4px", borderRadius: 2,
                                      background: G.yellowBg, fontSize: 9, color: "#8A6D00",
                                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                      maxWidth: "100%", textAlign: "center", cursor: "pointer",
                                    }} onClick={() => editNote(desk.id, dayIdx, period)}>
                                      {note}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══ HISTORIAL ═══ */
function HistorialTab({ db }) {
  const { people, desks, attendance } = db;
  const [fP, setFP] = useState("");
  const [fO, setFO] = useState("");

  const recs = useMemo(() => attendance.map(a => {
    const dk = desks.find(d => d.id === a.desk_id), pe = people.find(p => p.id === a.person_id);
    if (!dk || !pe) return null;
    const mon = new Date(a.week_key + "T00:00:00"), date = new Date(mon); date.setDate(mon.getDate() + a.day_index);
    return { ...a, dk, pe, date, day: DAYS[a.day_index] };
  }).filter(Boolean).sort((a, b) => b.date - a.date || (a.period === "AM" ? -1 : 1)), [attendance, desks, people]);

  const filtered = recs.filter(r => (!fP || r.pe.id === fP) && (!fO || r.dk.office === fO));

  return (
    <div>
      <div style={{ ...F.card, overflow: "hidden" }}>
        <div style={F.cardHeader}><span style={F.cardHeaderText}>Filtros</span></div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "12px 16px", alignItems: "flex-end" }}>
          <div><div style={{ fontSize: 11, color: G.grayDk, marginBottom: 4, fontWeight: 600 }}>Persona</div>
            <select style={F.fieldSelect} value={fP} onChange={e => setFP(e.target.value)}>
              <option value="">Todas</option>{people.map(p => <option key={p.id} value={p.id}>{p.initials} — {p.name}</option>)}
            </select></div>
          <div><div style={{ fontSize: 11, color: G.grayDk, marginBottom: 4, fontWeight: 600 }}>Oficina</div>
            <select style={F.fieldSelect} value={fO} onChange={e => setFO(e.target.value)}>
              <option value="">Todas</option>{[...new Set(desks.map(d => d.office))].map(o => <option key={o} value={o}>{o}</option>)}
            </select></div>
          <div style={{ fontSize: 13, color: G.grayDk, paddingBottom: 8 }}>{filtered.length} registros</div>
        </div>
      </div>
      <div style={{ ...F.card, overflow: "hidden" }}>
        <div style={F.cardHeader}><span style={F.cardHeaderText}>Registros</span></div>
        <div style={{ overflowX: "auto" }}>
          <table style={F.table} className="hoverable">
            <thead><tr>{["Semana", "Día", "Fecha", "Turno", "Oficina", "Escritorio", "Persona", "Nota"].map(h => <th key={h} style={F.th}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={8} style={{ ...F.td, textAlign: "center", padding: 48, color: G.grayDk }}>Sin registros.</td></tr> :
              filtered.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? "#FAFBFC" : G.white }}>
                  <td style={F.td}>{fmtWeek(new Date(r.week_key + "T00:00:00"))}</td>
                  <td style={F.td}>{r.day}</td><td style={F.td}>{r.date.toLocaleDateString("es-CL")}</td>
                  <td style={F.td}><span style={{ ...F.badge, background: r.period === "AM" ? G.cyanBg : G.purpleBg, color: r.period === "AM" ? G.blue : G.purple, fontSize: 10 }}>{r.period}</span></td>
                  <td style={{ ...F.td, fontWeight: 600 }}>{r.dk.office}</td><td style={F.td}>{r.dk.desk}</td>
                  <td style={F.td}><span style={F.pill}>{r.pe.initials}</span> {r.pe.name}</td>
                  <td style={{ ...F.td, fontSize: 11, color: G.grayDk, fontStyle: r.notes ? "normal" : "italic" }}>{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══ DASHBOARD ═══ */
function DashboardTab({ db }) {
  const { people, desks, attendance } = db;
  const stats = useMemo(() => {
    const pD = {}, pW = {}, oC = {}, dd = [0,0,0,0,0], pc = { AM: 0, PM: 0 };
    attendance.forEach(a => {
      dd[a.day_index]++; pc[a.period]++;
      pD[a.person_id] = (pD[a.person_id]||0)+1;
      if (!pW[a.person_id]) pW[a.person_id] = new Set(); pW[a.person_id].add(a.week_key);
      const dk = desks.find(d => d.id === a.desk_id); if (dk) oC[dk.office] = (oC[dk.office]||0)+1;
    });
    const tw = new Set(attendance.map(a => a.week_key)).size, total = attendance.length;
    return {
      total, up: Object.keys(pD).length, tw, avg: tw > 0 ? (total/tw).toFixed(1) : "0", pc,
      pd: Object.entries(pD).map(([pid,days]) => { const p = people.find(x => x.id === pid); const w = pW[pid]?.size||1; return { name: p?.initials||"?", fullName: p?.name||"?", days, weeks: w, avg: (days/w).toFixed(1) }; }).sort((a,b) => b.days-a.days),
      od: Object.entries(oC).map(([n,v]) => ({ name: n, value: v })).sort((a,b) => b.value-a.value),
      dd: DAYS.map((d,i) => ({ name: d.slice(0,3), value: dd[i] })),
    };
  }, [attendance, desks, people]);

  if (!stats.total) return <div style={{ ...F.card, textAlign: "center", padding: 60 }}><div style={{ fontSize: 40 }}>📊</div><p style={{ fontWeight: 600, color: G.grayDk, marginTop: 8 }}>Sin datos aún</p></div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[{ l: "Total", v: stats.total, c: G.blue }, { l: "Personas", v: stats.up, c: G.green }, { l: "Turnos AM", v: stats.pc.AM, c: G.cyan }, { l: "Turnos PM", v: stats.pc.PM, c: G.purple }, { l: "Prom./Sem", v: stats.avg, c: G.red }].map((k,i) => (
          <div key={i} style={{ ...F.card, padding: "16px 14px", marginBottom: 0, borderLeft: `4px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: G.grayDk, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{k.l}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.c, marginTop: 4 }}>{k.v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div style={{ ...F.card, overflow: "hidden" }}><div style={F.cardHeader}><span style={F.cardHeaderText}>Por Persona</span></div><div style={{ padding: "12px 8px" }}>
          <ResponsiveContainer width="100%" height={240}><BarChart data={stats.pd}><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v,n,p) => [`${v} turnos`, p.payload.fullName]} /><Bar dataKey="days" radius={[3,3,0,0]}>{stats.pd.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer>
        </div></div>
        <div style={{ ...F.card, overflow: "hidden" }}><div style={F.cardHeader}><span style={F.cardHeaderText}>Por Día</span></div><div style={{ padding: "12px 8px" }}>
          <ResponsiveContainer width="100%" height={240}><BarChart data={stats.dd}><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" name="Turnos" radius={[3,3,0,0]}>{stats.dd.map((_,i) => <Cell key={i} fill={[G.cyan,G.blue,G.green,G.gold,G.red][i]} />)}</Bar></BarChart></ResponsiveContainer>
        </div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <div style={{ ...F.card, overflow: "hidden" }}><div style={F.cardHeader}><span style={F.cardHeaderText}>Por Oficina</span></div><div style={{ padding: "12px 0" }}>
          <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={stats.od} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({name,percent}) => `${name} (${(percent*100).toFixed(0)}%)`}>{stats.od.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </div></div>
        <div style={{ ...F.card, overflow: "hidden" }}><div style={F.cardHeader}><span style={F.cardHeaderText}>Detalle</span></div>
          <table style={F.table} className="hoverable"><thead><tr>{["Persona","Turnos","Sem.","Prom."].map(h => <th key={h} style={F.th}>{h}</th>)}</tr></thead>
            <tbody>{stats.pd.map((p,i) => (<tr key={i} style={{ background: i%2===0 ? "#FAFBFC" : G.white }}><td style={F.td}><span style={F.pill}>{p.name}</span> {p.fullName}</td><td style={{ ...F.td, textAlign: "center", fontWeight: 700 }}>{p.days}</td><td style={{ ...F.td, textAlign: "center" }}>{p.weeks}</td><td style={{ ...F.td, textAlign: "center", fontWeight: 700, color: G.blue }}>{p.avg}</td></tr>))}</tbody>
          </table></div>
      </div>
    </div>
  );
}

/* ═══ CONFIG ═══ */
function ConfigTab({ db }) {
  const { people, desks, holidays } = db;
  const notify = useToast();
  const { confirm: confirmDialog, prompt: promptDialog } = useDialog();

  const [nP, setNP] = useState({ initials: "", name: "", area: "" });
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [busyP, setBusyP] = useState(false);

  const [nD, setND] = useState({ office: "", desk: "" });
  const [showAddDesk, setShowAddDesk] = useState(false);
  const [busyD, setBusyD] = useState(false);

  const [nH, setNH] = useState({ date: "", name: "", block_am: true, block_pm: true });
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [busyH, setBusyH] = useState(false);

  // People CRUD
  const addPerson = async () => {
    if (!nP.initials || !nP.name) return;
    setBusyP(true);
    const { error } = await supabase.from("people").insert({ initials: nP.initials, name: nP.name, area: nP.area, active: true });
    if (error) notify("No se pudo agregar la persona", "error");
    else notify(`${nP.name} agregado`);
    setNP({ initials: "", name: "", area: "" }); setShowAddPerson(false); setBusyP(false);
  };
  const togglePerson = async (id, a) => {
    await supabase.from("people").update({ active: !a }).eq("id", id);
    notify(a ? "Persona desactivada" : "Persona activada", "info");
  };
  const removePerson = async (id) => {
    const p = people.find(x => x.id === id);
    if (!(await confirmDialog(`Se eliminará ${p ? p.name : "esta persona"} de forma permanente.`, { danger: true, title: "¿Eliminar persona?" }))) return;
    const { error } = await supabase.from("people").delete().eq("id", id);
    notify(error ? "No se pudo eliminar" : "Persona eliminada", error ? "error" : "info");
  };

  // Desk CRUD
  const addDesk = async () => {
    if (!nD.office || !nD.desk) return;
    setBusyD(true);
    const maxSort = desks.length > 0 ? Math.max(...desks.map(d => d.sort_order || 0)) + 1 : 1;
    const { error } = await supabase.from("desks").insert({ office: nD.office, desk: nD.desk, status: "available", sort_order: maxSort });
    if (error) notify("No se pudo agregar el escritorio", "error");
    else notify(`${nD.office} · ${nD.desk} agregado`);
    setND({ office: "", desk: "" }); setShowAddDesk(false); setBusyD(false);
  };
  const cycleDesk = async (id, s) => {
    await supabase.from("desks").update({ status: s === "available" ? "reserved" : s === "reserved" ? "maintenance" : "available" }).eq("id", id);
  };
  const removeDesk = async (id) => {
    const d = desks.find(x => x.id === id);
    if (!(await confirmDialog(`Se eliminará ${d ? `${d.office} · ${d.desk}` : "este escritorio"} de forma permanente.`, { danger: true, title: "¿Eliminar escritorio?" }))) return;
    const { error } = await supabase.from("desks").delete().eq("id", id);
    notify(error ? "No se pudo eliminar" : "Escritorio eliminado", error ? "error" : "info");
  };
  const renameDesk = async (id, field) => {
    const desk = desks.find(d => d.id === id);
    if (!desk) return;
    const current = field === "office" ? desk.office : desk.desk;
    const label = field === "office" ? "Nombre de oficina" : "Nombre de escritorio";
    const val = await promptDialog(`${label}:`, current, { title: "Editar" });
    if (val === null || val === current || !val.trim()) return;
    const { error } = await supabase.from("desks").update({ [field]: val.trim() }).eq("id", id);
    notify(error ? "No se pudo guardar" : "Cambio guardado", error ? "error" : "info");
  };
  const moveDesk = async (id, direction) => {
    const idx = desks.findIndex(d => d.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= desks.length) return;
    const a = desks[idx], b = desks[swapIdx];
    await Promise.all([
      supabase.from("desks").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("desks").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
  };

  // Holiday CRUD
  const addHoliday = async () => {
    if (!nH.date || !nH.name) return;
    setBusyH(true);
    const { error } = await supabase.from("holidays").insert({ date: nH.date, name: nH.name, block_am: nH.block_am, block_pm: nH.block_pm });
    if (error) notify("No se pudo agregar el feriado", "error");
    else notify(`Feriado "${nH.name}" agregado`);
    setNH({ date: "", name: "", block_am: true, block_pm: true }); setShowAddHoliday(false); setBusyH(false);
  };
  const removeHoliday = async (id) => {
    const h = holidays.find(x => x.id === id);
    if (!(await confirmDialog(`Se eliminará el feriado ${h ? `"${h.name}"` : ""} de forma permanente.`, { danger: true, title: "¿Eliminar feriado?" }))) return;
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    notify(error ? "No se pudo eliminar" : "Feriado eliminado", error ? "error" : "info");
  };
  const toggleHolidayPeriod = async (id, field) => {
    const h = holidays.find(x => x.id === id);
    if (!h) return;
    const newVal = !h[field];
    if (!newVal && !h[field === "block_am" ? "block_pm" : "block_am"]) return; // must block at least one
    await supabase.from("holidays").update({ [field]: newVal }).eq("id", id);
  };

  const stM = { available: { l: "Disponible", bg: "#E8F5E9", c: G.green }, reserved: { l: "Reservado", bg: "#FFF3F0", c: G.red }, maintenance: { l: "Mantención", bg: G.yellowBg, c: "#8A6D00" } };
  const uniqueOffices = [...new Set(desks.map(d => d.office))];

  // Split holidays into upcoming and past
  const today = toDateStr(new Date());
  const upcomingHolidays = holidays.filter(h => h.date >= today);
  const pastHolidays = holidays.filter(h => h.date < today);

  return (
    <div>
      {/* People */}
      <div style={{ ...F.card, overflow: "hidden" }}>
        <div style={{ ...F.cardHeader, display: "flex", justifyContent: "space-between" }}>
          <span style={F.cardHeaderText}>Personas Registradas</span>
          <button onClick={() => setShowAddPerson(!showAddPerson)} style={{ ...F.primaryBtn, padding: "6px 14px", fontSize: 12, background: showAddPerson ? G.grayDk : G.blue }}>
            {showAddPerson ? "✕ Cancelar" : "+ Agregar Persona"}
          </button>
        </div>
        {showAddPerson && <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: "#F5F6F7", borderBottom: `1px solid ${G.grayBg}`, flexWrap: "wrap" }}>
          <input placeholder="Iniciales" value={nP.initials} onChange={e => setNP({ ...nP, initials: e.target.value.toUpperCase() })} style={F.input} maxLength={5} />
          <input placeholder="Nombre" value={nP.name} onChange={e => setNP({ ...nP, name: e.target.value })} style={{ ...F.input, flex: 2 }} />
          <input placeholder="Área" value={nP.area} onChange={e => setNP({ ...nP, area: e.target.value })} style={F.input} />
          <button onClick={addPerson} disabled={busyP} style={{ ...F.primaryBtn, background: G.green, opacity: busyP ? 0.6 : 1 }}>{busyP ? "..." : "Guardar"}</button>
        </div>}
        <table style={F.table} className="hoverable"><thead><tr>{["Inic.", "Nombre", "Área", "Estado", "Acciones"].map(h => <th key={h} style={F.th}>{h}</th>)}</tr></thead>
          <tbody>{people.map((p, i) => (
            <tr key={p.id} style={{ background: i % 2 === 0 ? "#FAFBFC" : G.white }}>
              <td style={F.td}><span style={F.pill}>{p.initials}</span></td>
              <td style={{ ...F.td, fontWeight: 600 }}>{p.name}</td>
              <td style={F.td}>{p.area}</td>
              <td style={F.td}><span style={{ ...F.statusBadge, background: p.active ? "#E8F5E9" : "#FFF3F0", color: p.active ? G.green : G.red, marginLeft: 0 }}>{p.active ? "Activo" : "Inactivo"}</span></td>
              <td style={F.td}>
                <button onClick={() => togglePerson(p.id, p.active)} style={F.linkBtn}>{p.active ? "Desactivar" : "Activar"}</button>
                <button onClick={() => removePerson(p.id)} style={{ ...F.linkBtn, color: G.red }}>Eliminar</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Desks */}
      <div style={{ ...F.card, overflow: "hidden" }}>
        <div style={{ ...F.cardHeader, display: "flex", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={F.cardHeaderText}>Oficinas y Escritorios</span>
            <span style={{ fontSize: 11, color: G.grayDk }}>Click nombre para editar · Click estado para rotar</span>
          </div>
          <button onClick={() => setShowAddDesk(!showAddDesk)} style={{ ...F.primaryBtn, padding: "6px 14px", fontSize: 12, background: showAddDesk ? G.grayDk : G.blue }}>
            {showAddDesk ? "✕ Cancelar" : "+ Agregar Escritorio"}
          </button>
        </div>
        {showAddDesk && <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: "#F5F6F7", borderBottom: `1px solid ${G.grayBg}`, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: G.grayDk, marginBottom: 4, fontWeight: 600 }}>Oficina</div>
            <input list="office-list" placeholder="Ej: Oficina 210" value={nD.office} onChange={e => setND({ ...nD, office: e.target.value })} style={F.input} />
            <datalist id="office-list">{uniqueOffices.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: G.grayDk, marginBottom: 4, fontWeight: 600 }}>Escritorio</div>
            <input placeholder="Ej: Escritorio 3" value={nD.desk} onChange={e => setND({ ...nD, desk: e.target.value })} style={F.input} />
          </div>
          <button onClick={addDesk} disabled={busyD} style={{ ...F.primaryBtn, background: G.green, opacity: busyD ? 0.6 : 1 }}>{busyD ? "..." : "Guardar"}</button>
        </div>}
        <table style={F.table} className="hoverable"><thead><tr>{["Orden", "Oficina", "Escritorio", "Estado", "Acciones"].map(h => <th key={h} style={F.th}>{h}</th>)}</tr></thead>
          <tbody>{desks.map((d, i) => {
            const st = stM[d.status];
            return (
              <tr key={d.id} style={{ background: i % 2 === 0 ? "#FAFBFC" : G.white }}>
                <td style={{ ...F.td, textAlign: "center", whiteSpace: "nowrap" }}>
                  <button onClick={() => moveDesk(d.id, -1)} disabled={i === 0} style={{ ...F.linkBtn, fontSize: 16, opacity: i === 0 ? 0.2 : 1 }}>▲</button>
                  <button onClick={() => moveDesk(d.id, 1)} disabled={i === desks.length - 1} style={{ ...F.linkBtn, fontSize: 16, opacity: i === desks.length - 1 ? 0.2 : 1 }}>▼</button>
                </td>
                <td style={{ ...F.td, fontWeight: 600 }}>
                  <button onClick={() => renameDesk(d.id, "office")} style={{ ...F.linkBtn, fontWeight: 600, padding: 0, fontSize: 13 }}>{d.office}</button>
                </td>
                <td style={F.td}>
                  <button onClick={() => renameDesk(d.id, "desk")} style={{ ...F.linkBtn, padding: 0, fontSize: 13 }}>{d.desk}</button>
                </td>
                <td style={F.td}>
                  <button onClick={() => cycleDesk(d.id, d.status)} style={{ ...F.statusBadge, border: "none", cursor: "pointer", background: st.bg, color: st.c, marginLeft: 0 }}>{st.l}</button>
                </td>
                <td style={F.td}>
                  <button onClick={() => removeDesk(d.id)} style={{ ...F.linkBtn, color: G.red }}>Eliminar</button>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>

      {/* Holidays */}
      <div style={{ ...F.card, overflow: "hidden" }}>
        <div style={{ ...F.cardHeader, display: "flex", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={F.cardHeaderText}>Feriados</span>
            <span style={{ fontSize: 11, color: G.grayDk }}>Los días feriados se bloquean automáticamente en el registro</span>
          </div>
          <button onClick={() => setShowAddHoliday(!showAddHoliday)} style={{ ...F.primaryBtn, padding: "6px 14px", fontSize: 12, background: showAddHoliday ? G.grayDk : G.blue }}>
            {showAddHoliday ? "✕ Cancelar" : "+ Agregar Feriado"}
          </button>
        </div>
        {showAddHoliday && <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: "#F5F6F7", borderBottom: `1px solid ${G.grayBg}`, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 150 }}>
            <div style={{ fontSize: 11, color: G.grayDk, marginBottom: 4, fontWeight: 600 }}>Fecha</div>
            <input type="date" value={nH.date} onChange={e => setNH({ ...nH, date: e.target.value })} style={F.input} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: G.grayDk, marginBottom: 4, fontWeight: 600 }}>Nombre</div>
            <input placeholder="Ej: Viernes Santo" value={nH.name} onChange={e => setNH({ ...nH, name: e.target.value })} style={F.input} />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", paddingBottom: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", fontWeight: 600, color: nH.block_am ? G.cyan : G.grayMid }}>
              <input type="checkbox" checked={nH.block_am} onChange={e => setNH({ ...nH, block_am: e.target.checked })} /> AM
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", fontWeight: 600, color: nH.block_pm ? G.purple : G.grayMid }}>
              <input type="checkbox" checked={nH.block_pm} onChange={e => setNH({ ...nH, block_pm: e.target.checked })} /> PM
            </label>
          </div>
          <button onClick={addHoliday} disabled={busyH} style={{ ...F.primaryBtn, background: G.green, opacity: busyH ? 0.6 : 1 }}>{busyH ? "..." : "Guardar"}</button>
        </div>}

        {/* Upcoming holidays */}
        <table style={F.table} className="hoverable"><thead><tr>{["Fecha", "Nombre", "Bloquea", "Acciones"].map(h => <th key={h} style={F.th}>{h}</th>)}</tr></thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr><td colSpan={4} style={{ ...F.td, textAlign: "center", padding: 32, color: G.grayDk }}>No hay feriados configurados.</td></tr>
            ) : (
              <>
                {upcomingHolidays.length > 0 && upcomingHolidays.map((h, i) => (
                  <tr key={h.id} style={{ background: i % 2 === 0 ? G.yellowBg : "#FFFDE0" }}>
                    <td style={{ ...F.td, fontWeight: 600 }}>{new Date(h.date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td style={{ ...F.td, fontWeight: 600 }}>{h.name}</td>
                    <td style={F.td}>
                      <button onClick={() => toggleHolidayPeriod(h.id, "block_am")} style={{ ...F.statusBadge, border: "none", cursor: "pointer", marginLeft: 0, marginRight: 4, background: h.block_am ? G.cyanBg : G.grayBg, color: h.block_am ? G.blue : G.grayMid }}>AM</button>
                      <button onClick={() => toggleHolidayPeriod(h.id, "block_pm")} style={{ ...F.statusBadge, border: "none", cursor: "pointer", marginLeft: 0, background: h.block_pm ? G.purpleBg : G.grayBg, color: h.block_pm ? G.purple : G.grayMid }}>PM</button>
                    </td>
                    <td style={F.td}>
                      <button onClick={() => removeHoliday(h.id)} style={{ ...F.linkBtn, color: G.red }}>Eliminar</button>
                    </td>
                  </tr>
                ))}
                {pastHolidays.length > 0 && (
                  <>
                    <tr><td colSpan={4} style={{ ...F.td, fontSize: 11, color: G.grayDk, fontWeight: 700, background: "#F5F6F7", padding: "6px 12px" }}>Feriados pasados</td></tr>
                    {pastHolidays.map((h, i) => (
                      <tr key={h.id} style={{ background: i % 2 === 0 ? "#FAFBFC" : G.white, opacity: 0.6 }}>
                        <td style={F.td}>{new Date(h.date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td style={F.td}>{h.name}</td>
                        <td style={F.td}>
                          <span style={{ ...F.statusBadge, marginLeft: 0, marginRight: 4, background: h.block_am ? G.cyanBg : G.grayBg, color: h.block_am ? G.blue : G.grayMid }}>AM</span>
                          <span style={{ ...F.statusBadge, marginLeft: 0, background: h.block_pm ? G.purpleBg : G.grayBg, color: h.block_pm ? G.purple : G.grayMid }}>PM</span>
                        </td>
                        <td style={F.td}>
                          <button onClick={() => removeHoliday(h.id)} style={{ ...F.linkBtn, color: G.red }}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══ FIORI STYLES ═══ */
const F = {
  root: { fontFamily: "'72','Arial Narrow',Arial,sans-serif", background: "#F5F6F7", minHeight: "100vh", color: "#32363A", fontSize: 14 },
  loadWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F5F6F7" },
  spinner: { width: 36, height: 36, border: "3px solid #DEE2E6", borderTopColor: G.red, borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  shell: { background: G.white, color: "#32363A", position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid #DEE2E6" },
  shellInner: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px", height: 56, maxWidth: 1200, margin: "0 auto" },
  shellLogo: { height: 26, display: "block" },
  shellDivider: { width: 1, height: 28, background: "#DEE2E6" },
  shellTitle: { fontSize: 15, fontWeight: 700, letterSpacing: 0.2, color: "#32363A", lineHeight: 1.3 },
  shellSub: { fontSize: 10.5, color: G.grayDk, lineHeight: 1.3 },
  iconBtn: { width: 28, height: 28, borderRadius: 6, border: "1px solid #DEE2E6", background: G.white, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  menuButton: { width: 30, height: 30, borderRadius: "50%", background: "#E5F0FF", border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" },
  menuDropdown: { position: "absolute", top: 38, right: 0, background: G.white, border: "1px solid #DEE2E6", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 6, minWidth: 180, zIndex: 200 },
  menuItem: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "9px 12px", border: "none", background: "transparent", color: "#32363A", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 6, fontFamily: "inherit", textAlign: "left" },
  menuItemActive: { color: G.red, background: "#FFF3F0" },
  menuDivider: { height: 1, background: "#EEE", margin: "6px 4px" },
  menuItemMuted: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "8px 12px", border: "none", background: "transparent", color: G.grayDk, fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 6, fontFamily: "inherit", textAlign: "left", textDecoration: "none", boxSizing: "border-box" },
  main: { maxWidth: 1200, margin: "0 auto", padding: "16px 20px" },
  objectHeader: { background: G.white, border: "1px solid #DEE2E6", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", padding: "20px 24px", marginBottom: 16 },
  objectHeaderTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 },
  objectHeaderLabel: { fontSize: 11, color: G.grayDk, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 },
  objectHeaderTitle: { fontSize: 24, fontWeight: 700, color: "#32363A", marginTop: 2 },
  badge: { display: "inline-block", padding: "3px 10px", borderRadius: 3, fontSize: 11, fontWeight: 700 },
  kpiMini: { textAlign: "center", minWidth: 70 },
  kpiMiniVal: { fontSize: 26, fontWeight: 800, color: "#32363A" },
  kpiMiniLabel: { fontSize: 10, color: G.grayDk, marginTop: 2 },
  weekNav: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" },
  navBtn: { padding: "8px 16px", border: "1px solid #DEE2E6", borderRadius: 6, background: G.white, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#32363A" },
  navBtnDisabled: { opacity: 0.35, cursor: "not-allowed", pointerEvents: "none" },
  card: { background: G.white, border: "1px solid #DEE2E6", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 12 },
  cardHeader: { padding: "12px 16px", borderBottom: "1px solid #DEE2E6", background: "#F5F6F7", display: "flex", alignItems: "center" },
  cardHeaderText: { fontSize: 14, fontWeight: 700, color: "#32363A" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "inherit" },
  th: { padding: "10px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: G.white, background: "#354A5F" },
  td: { padding: "8px 12px", borderBottom: "1px solid #EEE", fontSize: 13 },
  selectSmall: { width: "100%", padding: "5px 2px", border: "1px solid #DEE2E6", borderRadius: 3, fontSize: 10, cursor: "pointer", outline: "none", fontFamily: "inherit", transition: "border-color 0.15s", textAlign: "center" },
  fieldSelect: { padding: "7px 12px", border: "1px solid #DEE2E6", borderRadius: 4, fontSize: 13, fontFamily: "inherit", minWidth: 140, background: G.white },
  input: { padding: "7px 12px", border: "1px solid #DEE2E6", borderRadius: 4, fontSize: 13, fontFamily: "inherit", flex: 1, minWidth: 100, outline: "none" },
  pill: { display: "inline-block", padding: "2px 8px", borderRadius: 4, background: "#E5F0FF", color: G.blue, fontWeight: 700, fontSize: 11, marginRight: 6 },
  statusBadge: { display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, marginLeft: 6, fontFamily: "inherit" },
  primaryBtn: { padding: "8px 16px", border: "none", borderRadius: 6, background: G.blue, color: G.white, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 1px 2px rgba(0,0,0,0.12)" },
  linkBtn: { background: "transparent", border: "none", color: G.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 8px", fontFamily: "inherit" },
  footer: { textAlign: "center", padding: "20px 16px", fontSize: 11, color: G.grayMid, borderTop: "1px solid #DEE2E6", marginTop: 24, background: G.white },
};

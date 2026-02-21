import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  AlertTriangle,
  CheckCircle2,
  X,
  ShieldCheck,
  Lock,
  Check,
  Loader2,
  Terminal,
  ChevronUp,
  GitPullRequest,
  FileCode,
  Upload,
  GitBranch,
  Folder,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════ */

const sourceLines = [
  "IDENTIFICATION DIVISION.",
  "PROGRAM-ID. HH-PPS-PRICER.",
  "WORKING-STORAGE SECTION.",
  "01 WS-FISCAL-YEAR    PIC 9(4).",
  '01 WS-CLAIM-AMOUNT   PIC 9(7)V99.',
  "01 WS-ROUNDING-MODE  PIC X(10).",
  "PROCEDURE DIVISION.",
  '    ACCEPT WS-FISCAL-YEAR FROM',
  '        ENVIRONMENT \"FISCAL-YEAR\"',
  "    PERFORM CALCULATE-PPS-PAYMENT",
  "    STOP RUN.",
];

const targetLines = [
  "from decimal import Decimal, ROUND_HALF_UP",
  "from dataclasses import dataclass",
  "import os",
  "",
  "@dataclass",
  "class ClaimRecord:",
  "    fiscal_year: int",
  "    claim_amount: Decimal",
  '    rounding_mode: str = "HALF_UP"',
  "",
  "class HHPPSPricer:",
  "    def __init__(self):",
  "        self.fiscal_year = int(",
  '            os.environ.get(\"FISCAL_YEAR\", \"2019\"))',
];

const diffLines: { type: "removed" | "added" | "context" | "header"; text: string; flag?: boolean; oldNum?: string; newNum?: string }[] = [
  { type: "header", text: "--- a/PPS-CALC/HH-PPS-PRICER.cbl" },
  { type: "header", text: "+++ b/pps_calc/hh_pps_pricer.py" },
  { type: "header", text: "@@ -1,8 +1,12 @@" },
  { type: "removed", text: " IDENTIFICATION DIVISION.", oldNum: "1" },
  { type: "removed", text: " PROGRAM-ID. HH-PPS-PRICER.", oldNum: "2" },
  { type: "removed", text: " DATA DIVISION.", oldNum: "3" },
  { type: "removed", text: " WORKING-STORAGE SECTION.", oldNum: "4" },
  { type: "removed", text: " 01 WS-FISCAL-YEAR    PIC 9(4).", oldNum: "5" },
  { type: "removed", text: " 01 WS-CLAIM-AMOUNT   PIC 9(7)V99.", oldNum: "6" },
  { type: "removed", text: " 01 WS-PAYMENT-RESULT  PIC 9(7)V99.", oldNum: "7" },
  { type: "removed", text: " 01 WS-ROUNDING-MODE   PIC X(10) VALUE 'HALF-UP'.", oldNum: "8" },
  { type: "added", text: " from decimal import Decimal, ROUND_HALF_UP", newNum: "1" },
  { type: "added", text: " from dataclasses import dataclass", newNum: "2" },
  { type: "added", text: " from typing import Optional", newNum: "3" },
  { type: "added", text: " import os", newNum: "4" },
  { type: "added", text: "", newNum: "5" },
  { type: "added", text: " @dataclass", newNum: "6" },
  { type: "added", text: " class ClaimRecord:", newNum: "7" },
  { type: "added", text: "     fiscal_year: int", newNum: "8" },
  { type: "added", text: "     claim_amount: Decimal", newNum: "9" },
  { type: "added", text: "     payment_result: Optional[Decimal] = None", newNum: "10" },
  { type: "added", text: '     rounding_mode: str = "HALF_UP"', newNum: "11" },
  { type: "header", text: "@@ -18,10 +16,10 @@" },
  { type: "removed", text: " PROCEDURE DIVISION.", oldNum: "18" },
  { type: "removed", text: " MAIN-PROCESS.", oldNum: "19" },
  { type: "removed", text: '     ACCEPT WS-FISCAL-YEAR FROM ENVIRONMENT "FISCAL-YEAR"', oldNum: "20" },
  { type: "removed", text: "     IF WS-FISCAL-YEAR = SPACES", oldNum: "21" },
  { type: "removed", text: "         MOVE 2019 TO WS-FISCAL-YEAR", oldNum: "22" },
  { type: "removed", text: "     END-IF", oldNum: "23" },
  { type: "removed", text: "     PERFORM LOAD-RATE-TABLE", oldNum: "24" },
  { type: "removed", text: "     PERFORM CALCULATE-PPS-PAYMENT", oldNum: "25" },
  { type: "removed", text: "     PERFORM WRITE-OUTPUT", oldNum: "26" },
  { type: "removed", text: "     STOP RUN.", oldNum: "27" },
  { type: "added", text: " class HHPPSPricer:", newNum: "16" },
  { type: "added", text: "     def __init__(self):", newNum: "17" },
  { type: "added", text: "         # PRESERVED: Legacy default to 2019 if not configured", newNum: "18", flag: true },
  { type: "added", text: "         # FLAGGED: Silent default — verify with stakeholder", newNum: "19", flag: true },
  { type: "added", text: '         self.fiscal_year = int(os.environ.get("FISCAL_YEAR", "2019"))', newNum: "20" },
  { type: "added", text: "         self.rate_table = self._load_rate_table()", newNum: "21" },
  { type: "added", text: "", newNum: "22" },
  { type: "added", text: "     def process(self, claim: ClaimRecord) -> ClaimRecord:", newNum: "23" },
  { type: "added", text: "         payment = self._calculate_pps_payment(claim)", newNum: "24" },
  { type: "added", text: "         claim.payment_result = payment", newNum: "25" },
  { type: "added", text: "         return claim", newNum: "26" },
];

const patchStats = [
  { label: "Files translated", value: "4" },
  { label: "Lines removed", value: "1,240" },
  { label: "Lines added", value: "680" },
  { label: "Changes", value: "61" },
  { label: "Lint gate", value: "Pass ✓", green: true },
];

interface FlaggedItem {
  title: string; severity: string; severityColor: string; desc: string; accepted: boolean;
}

const initialFlagged: FlaggedItem[] = [
  { title: "Fiscal year silent default", severity: "Critical", severityColor: "#fca5a5", desc: "Defaults to FY2019 when env var unset. Preserved — verify intentional.", accepted: false },
  { title: "Rounding preserved as HALF_UP", severity: "Info", severityColor: "#71717a", desc: "Python 3 defaults HALF_EVEN. Migration keeps HALF_UP.", accepted: false },
  { title: "3 Fujitsu APIs approximated", severity: "Medium", severityColor: "#fcd34d", desc: "JMPCINT3, COBDUMP, JMPCINT4 mapped to closest stdlib.", accepted: false },
];

const testResults: { icon: "pass" | "fail" | "warn"; name: string; ms: number }[] = [
  { icon: "pass", name: "test_hh_pps_basic_claim", ms: 45 },
  { icon: "pass", name: "test_esrd_pps_standard", ms: 52 },
  { icon: "pass", name: "test_claim_input_30day", ms: 12 },
  { icon: "pass", name: "test_claim_input_60day", ms: 14 },
  { icon: "pass", name: "test_fiscal_year_rate_2023", ms: 8 },
  { icon: "pass", name: "test_fiscal_year_rate_2024", ms: 7 },
  { icon: "fail", name: "test_fiscal_year_default_fallback", ms: 5 },
  { icon: "pass", name: "test_payment_output_format", ms: 22 },
  { icon: "pass", name: "test_payment_rounding_half_up", ms: 3 },
  { icon: "pass", name: "test_error_handling_invalid_claim", ms: 15 },
  { icon: "warn", name: "test_30day_60day_edge_rates", ms: 28 },
  { icon: "pass", name: "test_rate_table_boundary", ms: 18 },
  { icon: "pass", name: "test_esrd_comorbidity_adj", ms: 41 },
  { icon: "pass", name: "test_hh_pps_multi_dates", ms: 38 },
];

const checklistItems = [
  { text: "I have reviewed the fiscal year default drift and accept the logging change", dropdown: ["Accept as improvement", "Revert to silent", "Document only"] },
  { text: "I have reviewed the rate precision drift (0.0001) and confirm within tolerance", dropdown: ["Accept — below threshold", "Reject — match legacy", "Escalate"] },
  { text: "85.7% behavior preservation meets migration threshold", dropdown: null },
  { text: "3 unmapped Fujitsu APIs are resolved or deferred", dropdown: null },
  { text: "I acknowledge the rollback plan", dropdown: null },
];

/* ─── Activity Log Data ─── */
interface LogEntry { time: string; icon: "file" | "upload" | "branch" | "pr" | "folder" | "check"; text: string; detail?: string }

const activityLogs: LogEntry[] = [
  { time: "00:00", icon: "branch", text: "Created branch", detail: "migration/hh-pps-pricer-py3" },
  { time: "00:01", icon: "file", text: "Generated", detail: "pps_calc/hh_pps_pricer.py" },
  { time: "00:01", icon: "file", text: "Generated", detail: "pps_calc/esrd_pps_pricer.py" },
  { time: "00:02", icon: "file", text: "Generated", detail: "pps_calc/claim_record.py" },
  { time: "00:02", icon: "file", text: "Generated", detail: "pps_calc/rate_table.py" },
  { time: "00:03", icon: "folder", text: "Created test suite", detail: "tests/test_hh_pps_pricer.py (14 tests)" },
  { time: "00:03", icon: "check", text: "Flake8 lint gate", detail: "passed — 0 errors, 0 warnings" },
  { time: "00:04", icon: "upload", text: "Pushed 4 files", detail: "to migration/hh-pps-pricer-py3" },
  { time: "00:05", icon: "file", text: "Generated", detail: "pps_calc/fujitsu_bridge.py" },
  { time: "00:05", icon: "file", text: "Generated", detail: "pps_calc/env_config.py" },
  { time: "00:06", icon: "upload", text: "Pushed 2 files", detail: "to migration/hh-pps-pricer-py3" },
  { time: "00:07", icon: "check", text: "All tests passing", detail: "12 passed · 1 failed · 1 warning" },
  { time: "00:08", icon: "pr", text: "Opened PR #42", detail: "Migration: COBOL HH-PPS-PRICER → Python 3" },
  { time: "00:08", icon: "check", text: "CI pipeline triggered", detail: "github-actions: lint, test, build" },
];

const logIcon = (type: LogEntry["icon"]) => {
  const s = { className: "w-3 h-3 shrink-0" as const, strokeWidth: 1.5 };
  switch (type) {
    case "file": return <FileCode {...s} style={{ color: "#818cf8" }} />;
    case "upload": return <Upload {...s} style={{ color: "#22d3ee" }} />;
    case "branch": return <GitBranch {...s} style={{ color: "#a1a1aa" }} />;
    case "pr": return <GitPullRequest {...s} style={{ color: "#6ee7b7" }} />;
    case "folder": return <Folder {...s} style={{ color: "#fcd34d" }} />;
    case "check": return <CheckCircle2 {...s} style={{ color: "#6ee7b7" }} />;
  }
};

/*
   COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

const Tab3Build = () => {
  // Section visibility
  const [showMigrationAnim, setShowMigrationAnim] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showApproval, setShowApproval] = useState(false);
  const [success, setSuccess] = useState(false);

  // Migration animation
  const [animProgress, setAnimProgress] = useState(0); // 0-100
  const [animLabel, setAnimLabel] = useState("Generating migration patch...");
  const [sourceOpacity, setSourceOpacity] = useState<number[]>(sourceLines.map(() => 1));
  const [targetOpacity, setTargetOpacity] = useState<number[]>(targetLines.map(() => 0));
  const [dotTop, setDotTop] = useState(0);

  // Diff
  const [flagged, setFlagged] = useState(initialFlagged);

  // Validation
  const [visibleTests, setVisibleTests] = useState(0);
  const [showVerdict, setShowVerdict] = useState(false);

  // Approval
  const [checked, setChecked] = useState<boolean[]>(checklistItems.map(() => false));
  const [dropdowns, setDropdowns] = useState<(string | null)[]>(checklistItems.map(() => null));
  const [deploying, setDeploying] = useState(false);

  // Activity log
  const [logOpen, setLogOpen] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const validationRef = useRef<HTMLDivElement>(null);
  const approvalRef = useRef<HTMLDivElement>(null);

  // ─── Migration animation ───
  useEffect(() => {
    if (!showMigrationAnim) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Fade out source lines
    sourceLines.forEach((_, i) => {
      timers.push(setTimeout(() => setSourceOpacity((p) => { const n = [...p]; n[i] = 0.2; return n; }), i * 200));
    });
    // Fade in target lines with offset
    targetLines.forEach((_, i) => {
      timers.push(setTimeout(() => setTargetOpacity((p) => { const n = [...p]; n[i] = 1; return n; }), 100 + i * 200));
    });
    // Dot travels
    const dur = 3000;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setDotTop(p * 100);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Labels
    timers.push(setTimeout(() => setAnimLabel("Running lint gate..."), 2000));
    timers.push(setTimeout(() => setAnimLabel("Migration complete ✓"), 2800));
    timers.push(setTimeout(() => { setShowMigrationAnim(false); setShowDiff(true); }, 3200));
    // Start validation after diff appears
    timers.push(setTimeout(() => setShowValidation(true), 5200));

    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [showMigrationAnim]);

  // ─── Activity log entries appearing over time ───
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    activityLogs.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setVisibleLogs(i + 1);
      }, 800 + i * 600));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleLogs]);

  // ─── Test results animation ───
  useEffect(() => {
    if (!showValidation) return;
    setTimeout(() => validationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    const timers: ReturnType<typeof setTimeout>[] = [];
    testResults.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleTests(i + 1), i * 200));
    });
    timers.push(setTimeout(() => setShowVerdict(true), testResults.length * 200 + 1000));
    timers.push(setTimeout(() => setShowApproval(true), testResults.length * 200 + 2000));
    return () => timers.forEach(clearTimeout);
  }, [showValidation]);

  // Auto-scroll to approval
  useEffect(() => {
    if (showApproval) setTimeout(() => approvalRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }, [showApproval]);

  const allChecked = checked.every(Boolean);

  const handleDeploy = () => {
    setDeploying(true);
    setTimeout(() => setSuccess(true), 2000);
  };

  const testIcon = (icon: "pass" | "fail" | "warn") => {
    if (icon === "pass") return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />;
    if (icon === "fail") return <X className="w-3.5 h-3.5 shrink-0" style={{ color: "#fca5a5" }} strokeWidth={1.5} />;
    return <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "#fcd34d" }} strokeWidth={1.5} />;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 py-8">

        {/* ═══ SECTION 1: MIGRATION ═══ */}

        {/* Animation */}
        {showMigrationAnim && (
          <div className="glass p-6 mb-6">
            <div className="flex gap-[4%]">
              {/* Source */}
              <div className="w-[48%]">
                <div className="text-[11px] mb-2" style={{ color: "#71717a" }}>Source</div>
                <div className="rounded-lg p-3.5 font-mono text-[12px] overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", maxHeight: 200 }}>
                  {sourceLines.map((line, i) => (
                    <div key={i} style={{ color: "#71717a", opacity: sourceOpacity[i], transition: "opacity 0.3s ease" }}>{line}</div>
                  ))}
                </div>
              </div>
              {/* Separator with dot */}
              <div className="relative" style={{ width: 1 }}>
                <div className="absolute inset-0" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="absolute w-1.5 h-1.5 rounded-full -left-[2px]" style={{ background: "#818cf8", top: `${dotTop}%`, transition: "none" }} />
              </div>
              {/* Target */}
              <div className="w-[48%]">
                <div className="text-[11px] mb-2" style={{ color: "#71717a" }}>Target</div>
                <div className="rounded-lg p-3.5 font-mono text-[12px] overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", maxHeight: 200 }}>
                  {targetLines.map((line, i) => (
                    <div key={i} style={{ color: "#71717a", opacity: targetOpacity[i], transition: "opacity 0.3s ease" }}>{line || "\u00A0"}</div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-center text-[12px] mt-4" style={{ color: animLabel.includes("✓") ? "#6ee7b7" : "#71717a" }}>{animLabel}</p>
          </div>
        )}

        {/* Diff + Summary */}
        {showDiff && (
          <div className="flex gap-3 mb-8 animate-fade-in max-md:flex-col">
            {/* Diff viewer */}
            <div className="w-[60%] max-md:w-full glass overflow-hidden" style={{ borderRadius: 12 }}>
              {/* Diff header */}
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex items-center gap-2">
                  <GitCompare className="w-3.5 h-3.5" style={{ color: "#71717a" }} strokeWidth={1.5} />
                  <span className="font-mono text-[12px]" style={{ color: "#a1a1aa" }}>HH-PPS-PRICER.cbl → hh_pps_pricer.py</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[12px]" style={{ color: "#52525b" }}>1/4</span>
                  <ChevronLeft className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />
                  <ChevronRight className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />
                </div>
              </div>
              {/* Diff body */}
              <div className="overflow-y-auto font-mono text-[11px]" style={{ maxHeight: 400, lineHeight: "1.8" }}>
                {diffLines.map((l, i) => {
                  if (l.type === "header") return (
                    <div key={i} className="px-4 py-0.5" style={{ color: "#52525b" }}>{l.text}</div>
                  );
                  const bg = l.type === "removed" ? "rgba(248,113,113,0.04)" : l.type === "added" ? "rgba(110,231,183,0.04)" : "transparent";
                  return (
                    <div
                      key={i}
                      className="flex transition-colors"
                      style={{ background: bg }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = bg)}
                    >
                      <div className="w-10 text-right pr-1 shrink-0 select-none" style={{ color: "#52525b", background: "rgba(0,0,0,0.15)" }}>
                        {l.flag && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" style={{ color: "#fcd34d" }} strokeWidth={1.5} />}
                        {l.type === "removed" ? l.oldNum : ""}
                      </div>
                      <div className="w-10 text-right pr-1 shrink-0 select-none" style={{ color: "#52525b", background: "rgba(0,0,0,0.15)" }}>
                        {l.type === "added" ? l.newNum : ""}
                      </div>
                      <div className="w-4 text-center shrink-0 select-none" style={{ color: "#71717a" }}>
                        {l.type === "removed" ? "-" : l.type === "added" ? "+" : " "}
                      </div>
                      <div className="flex-1 pr-4" style={{ color: "#a1a1aa" }}>{l.text || "\u00A0"}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary cards */}
            <div className="w-[40%] max-md:w-full space-y-2">
              {/* Patch stats */}
              <div className="glass p-5">
                <div className="text-[14px] font-medium mb-3" style={{ color: "#a1a1aa" }}>Patch</div>
                {patchStats.map((s) => (
                  <div key={s.label} className="flex justify-between py-1">
                    <span className="text-[12px]" style={{ color: "#52525b" }}>{s.label}</span>
                    <span className="font-mono text-[13px]" style={{ color: s.green ? "#6ee7b7" : "#a1a1aa" }}>{s.value}</span>
                  </div>
                ))}
              </div>

              {/* Flagged */}
              <div className="glass p-5" style={{ borderTop: "1px solid rgba(252,165,165,0.1)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#71717a" }} strokeWidth={1.5} />
                  <span className="text-[14px] font-medium" style={{ color: "#a1a1aa" }}>Flagged for review</span>
                </div>
                <div className="space-y-3">
                  {flagged.map((f, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium" style={{ color: "#a1a1aa" }}>{f.title}</span>
                        {f.accepted && <Check className="w-3 h-3" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />}
                      </div>
                      <div className="text-[12px]" style={{ color: f.severityColor }}>{f.severity}</div>
                      <div className="text-[12px]" style={{ color: "#71717a" }}>{f.desc}</div>
                      <div className="flex gap-2 mt-1.5">
                        {!f.accepted ? (
                          <>
                            <button className="btn-ghost text-[12px]" onClick={() => setFlagged((p) => p.map((x, j) => j === i ? { ...x, accepted: true } : x))}>Accept</button>
                            {i === 2 && <button className="btn-ghost text-[12px]">Review</button>}
                          </>
                        ) : (
                          <span className="text-[12px]" style={{ color: "#6ee7b7" }}>Accepted ✓</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Divider */}
        {showValidation && <div className="w-full h-px my-8" style={{ background: "rgba(255,255,255,0.04)" }} />}

        {/* ═══ SECTION 2: VALIDATION ═══ */}
        {showValidation && (
          <div ref={validationRef}>
            <h2 className="text-[20px] font-medium text-foreground mb-1">Validation</h2>
            <p className="text-[13px] mb-4" style={{ color: "#a1a1aa" }}>Running characterization tests against migrated code</p>

            {/* Test results */}
            <div className="glass p-5 mb-4">
              {testResults.map((t, i) => {
                if (i >= visibleTests) return null;
                const rowBg = t.icon === "fail" ? "rgba(252,165,165,0.03)" : t.icon === "warn" ? "rgba(252,211,77,0.03)" : "transparent";
                return (
                  <div key={i} className="flex items-center justify-between py-1 px-2 rounded animate-fade-in" style={{ background: rowBg }}>
                    <div className="flex items-center gap-2">
                      {testIcon(t.icon)}
                      <span className="font-mono text-[12px]" style={{ color: "#a1a1aa" }}>{t.name}</span>
                    </div>
                    <span className="text-[11px]" style={{ color: "#52525b" }}>{t.ms}ms</span>
                  </div>
                );
              })}
              {visibleTests >= testResults.length && (
                <p className="text-[12px] mt-3 px-2" style={{ color: "#71717a" }}>12 passed · 1 failed · 1 warning</p>
              )}
            </div>

            {/* Verdict */}
            {showVerdict && (
              <div className="glass p-7 animate-fade-in" style={{ background: "rgba(255,255,255,0.05)", borderTop: "1px solid rgba(252,211,77,0.12)" }}>
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="font-mono text-[28px] font-bold" style={{ color: "#fcd34d" }}>RISKY</div>
                    <div className="text-[13px]" style={{ color: "#71717a" }}>Behavioral drift detected</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[36px] font-bold text-foreground">85.7%</div>
                    <div className="text-[13px]" style={{ color: "#71717a" }}>behavior preserved</div>
                  </div>
                </div>

                <div className="h-px w-full mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />

                {/* Stats row */}
                <div className="flex justify-between text-center mb-5">
                  {[
                    { label: "Tests passed", value: "12/14", color: "#a1a1aa" },
                    { label: "Critical drifts", value: "1", color: "#fca5a5" },
                    { label: "Non-critical", value: "1", color: "#a1a1aa" },
                    { label: "Trust coverage", value: "71%", color: "#fcd34d" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="font-mono text-[14px]" style={{ color: s.color }}>{s.value}</div>
                      <div className="text-[11px]" style={{ color: "#52525b" }}>{s.label}</div>
                    </div>
                  ))}
                  <div>
                    <div className="font-mono text-[14px]" style={{ color: "#a1a1aa" }}>0.42</div>
                    <div className="text-[11px] mb-1" style={{ color: "#52525b" }}>Risk score</div>
                    <div className="w-20 h-[3px] rounded-full mx-auto" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="h-full rounded-full" style={{ width: "42%", background: "#fcd34d" }} />
                    </div>
                  </div>
                </div>

                {/* Drifts */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[12px] font-medium" style={{ color: "#fca5a5" }}>Critical</span>
                      <span className="font-mono text-[12px]" style={{ color: "#a1a1aa" }}>test_fiscal_year_default_fallback</span>
                    </div>
                    <div className="flex gap-3 mb-2">
                      <div className="flex-1 rounded-md p-2 font-mono text-[11px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="text-[10px] mb-1" style={{ color: "#52525b" }}>Expected</div>
                        <div style={{ color: "#a1a1aa" }}>No warning emitted</div>
                      </div>
                      <div className="flex-1 rounded-md p-2 font-mono text-[11px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="text-[10px] mb-1" style={{ color: "#52525b" }}>Actual</div>
                        <div style={{ color: "#a1a1aa" }}>Warning log emitted <span style={{ color: "#fcd34d" }}>← new</span></div>
                      </div>
                    </div>
                    <p className="text-[12px]" style={{ color: "#71717a" }}>Calculations identical. Migrated code adds a warning log — technically a behavioral change.</p>
                  </div>

                  <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[12px] font-medium" style={{ color: "#fcd34d" }}>Non-critical</span>
                      <span className="font-mono text-[12px]" style={{ color: "#a1a1aa" }}>test_30day_60day_edge_rates</span>
                    </div>
                    <div className="flex gap-3 mb-2">
                      <div className="flex-1 rounded-md p-2 font-mono text-[11px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="text-[10px] mb-1" style={{ color: "#52525b" }}>Expected</div>
                        <div style={{ color: "#a1a1aa" }}>1.0247</div>
                      </div>
                      <div className="flex-1 rounded-md p-2 font-mono text-[11px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="text-[10px] mb-1" style={{ color: "#52525b" }}>Actual</div>
                        <div style={{ color: "#a1a1aa" }}>1.0248</div>
                      </div>
                    </div>
                    <p className="text-[12px]" style={{ color: "#71717a" }}>Floating point precision delta: 0.0001. Below CMS rounding threshold.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        {showApproval && <div className="w-full h-px my-8" style={{ background: "rgba(255,255,255,0.04)" }} />}

        {/* ═══ SECTION 3: APPROVAL ═══ */}
        {showApproval && (
          <div ref={approvalRef} className="animate-fade-in mb-12">
            {!success ? (
              <div className="glass p-7" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-4 h-4" style={{ color: "#a1a1aa" }} strokeWidth={1.5} />
                  <span className="text-[16px] font-medium text-foreground">Approval required</span>
                </div>
                <p className="text-[13px] mb-4" style={{ color: "#71717a" }}>Review each item before deployment</p>

                <div className="h-px mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />

                {/* Checklist */}
                <div className="space-y-4">
                  {checklistItems.map((item, i) => {
                    const canCheck = item.dropdown ? dropdowns[i] !== null : true;
                    return (
                      <div key={i}>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <button
                            onClick={() => canCheck && setChecked((p) => p.map((v, j) => j === i ? !v : v))}
                            className="w-[18px] h-[18px] rounded shrink-0 flex items-center justify-center mt-0.5 transition-all"
                            style={{
                              border: `1.5px solid ${checked[i] ? "rgba(110,231,183,0.3)" : "rgba(255,255,255,0.15)"}`,
                              background: checked[i] ? "rgba(110,231,183,0.1)" : "transparent",
                              borderRadius: 4,
                              cursor: canCheck ? "pointer" : "not-allowed",
                              opacity: canCheck ? 1 : 0.4,
                            }}
                          >
                            {checked[i] && <Check className="w-2.5 h-2.5" style={{ color: "#6ee7b7" }} strokeWidth={2} />}
                          </button>
                          <span className="text-[13px]" style={{ color: "#a1a1aa" }}>{item.text}</span>
                        </label>
                        {item.dropdown && (
                          <select
                            className="glass-input ml-8 mt-2 px-3 py-1.5 text-[12px] text-foreground"
                            style={{ borderRadius: 6 }}
                            value={dropdowns[i] || ""}
                            onChange={(e) => setDropdowns((p) => p.map((v, j) => j === i ? e.target.value : v))}
                          >
                            <option value="" disabled>Select decision...</option>
                            {item.dropdown.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div className="mt-5">
                  <div className="w-full h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(checked.filter(Boolean).length / checked.length) * 100}%`,
                        background: allChecked ? "#6ee7b7" : "#52525b",
                        transitionDuration: "0.3s",
                      }}
                    />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "#52525b" }}>
                    {checked.filter(Boolean).length} of {checked.length}{allChecked ? " confirmed" : ""}
                  </p>
                </div>

                <div className="h-px my-5" style={{ background: "rgba(255,255,255,0.06)" }} />

                {/* Buttons */}
                <div className="flex justify-end gap-3">
                  <button className="btn-ghost text-[13px]" style={{ color: "#fca5a5" }}>Reject & rollback</button>
                  <button
                    onClick={handleDeploy}
                    disabled={!allChecked || deploying}
                    className="flex items-center gap-2 px-7 py-3 rounded-lg text-[13px] font-medium transition-all disabled:cursor-not-allowed"
                    style={{
                      background: allChecked && !deploying ? "rgba(110,231,183,0.1)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${allChecked && !deploying ? "rgba(110,231,183,0.2)" : "rgba(255,255,255,0.06)"}`,
                      color: allChecked && !deploying ? "#6ee7b7" : "#52525b",
                      boxShadow: allChecked && !deploying ? "0 0 12px rgba(110,231,183,0.08)" : "none",
                      transitionDuration: "0.3s",
                    }}
                  >
                    {deploying ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> Deploying...</>
                    ) : allChecked ? (
                      <><Check className="w-3.5 h-3.5" strokeWidth={1.5} /> Approve & deploy</>
                    ) : (
                      <><Lock className="w-3.5 h-3.5" strokeWidth={1.5} /> Approve & deploy</>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Success */
              <div className="glass p-10 text-center animate-fade-in" style={{ background: "rgba(255,255,255,0.05)" }}>
                <CheckCircle2 className="w-10 h-10 mx-auto mb-4" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />
                <div className="text-[18px] font-medium text-foreground mb-2">Migration approved</div>
                <div className="font-mono text-[12px]" style={{ color: "#52525b" }}>
                  Deployment queued · Session: demo · 85.7% preserved · 2 drifts accepted
                </div>
                <div className="flex justify-center gap-4 mt-5">
                  <button className="btn-ghost text-[13px]">View report</button>
                  <button className="btn-ghost text-[13px]">New migration</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-8 pb-20">
          <p className="text-[13px] italic" style={{ color: "#3f3f46" }}>Modernization speed without trust is useless. We deliver both.</p>
          <p className="text-[11px] mt-1" style={{ color: "#27272a" }}>B.LOC v0.1</p>
        </div>
      </div>

      {/* ═══ ACTIVITY LOG PANEL ═══ */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 transition-all"
        style={{
          transitionDuration: "0.25s",
          maxHeight: logOpen ? 320 : 40,
          background: "rgba(9,9,11,0.95)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Toggle bar */}
        <button
          onClick={() => setLogOpen(!logOpen)}
          className="w-full flex items-center justify-between px-5 h-10 transition-colors"
          style={{ color: "#71717a", background: "transparent", border: "none", cursor: "pointer" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[12px] font-medium">Activity Log</span>
            {visibleLogs > 0 && (
              <span className="font-mono text-[10px]" style={{ color: "#52525b" }}>
                {visibleLogs} {visibleLogs === 1 ? "entry" : "entries"}
              </span>
            )}
            {visibleLogs === activityLogs.length && (
              <span className="flex items-center gap-1 text-[10px]" style={{ color: "#6ee7b7" }}>
                <GitPullRequest className="w-2.5 h-2.5" strokeWidth={1.5} /> PR raised
              </span>
            )}
          </div>
          <ChevronUp
            className="w-3.5 h-3.5 transition-transform"
            style={{ color: "#52525b", transform: logOpen ? "rotate(180deg)" : "rotate(0)" }}
            strokeWidth={1.5}
          />
        </button>

        {/* Log content */}
        {logOpen && (
          <div className="overflow-y-auto px-5 pb-3" style={{ maxHeight: 272 }}>
            <div className="space-y-0.5">
              {activityLogs.map((log, i) => {
                if (i >= visibleLogs) return null;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded transition-colors animate-fade-in"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span className="font-mono text-[10px] shrink-0 w-10" style={{ color: "#3f3f46" }}>{log.time}</span>
                    {logIcon(log.icon)}
                    <span className="text-[12px]" style={{ color: "#a1a1aa" }}>{log.text}</span>
                    {log.detail && (
                      <span className="font-mono text-[11px] truncate" style={{ color: log.icon === "pr" ? "#6ee7b7" : "#52525b" }}>
                        {log.detail}
                      </span>
                    )}
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tab3Build;

import { useState, useEffect, useRef, useCallback } from "react";
import {
  GitCompareArrows, ChevronLeft, ChevronRight, Copy, AlertTriangle,
  Check, Brain, ArrowRight, Loader2, X
} from "lucide-react";
import { toast } from "sonner";

// ── Diff data ──────────────────────────────────────────────────────
const files = [
  { from: "HH-PPS-PRICER.cbl", to: "hh_pps_pricer.py" },
  { from: "ESRD-PPS-PRICER.cbl", to: "esrd_pps_pricer.py" },
  { from: "CLAIM-INPUT.cbl", to: "claim_input.py" },
  { from: "PAYMENT-OUTPUT.cbl", to: "payment_output.py" },
  { from: "FILE-ACCESS.cbl", to: "db_access.py" },
  { from: "ENV-CONFIG.cbl", to: "config.py" },
];

type DiffLineType = "header" | "chunk" | "removed" | "added" | "context";

interface DiffLine {
  type: DiffLineType;
  text: string;
  oldNum?: number | string;
  newNum?: number | string;
  highlights?: [number, number][];
  flagged?: boolean;
}

const diffLines: DiffLine[] = [
  { type: "header", text: "--- a/PPS-CALC/HH-PPS-PRICER.cbl", oldNum: "", newNum: "" },
  { type: "header", text: "+++ b/pps_calc/hh_pps_pricer.py", oldNum: "", newNum: "" },
  { type: "chunk", text: "@@ -1,14 +1,12 @@", oldNum: "", newNum: "" },
  { type: "removed", text: " IDENTIFICATION DIVISION.", oldNum: 1, newNum: "" },
  { type: "removed", text: " PROGRAM-ID. HH-PPS-PRICER.", oldNum: 2, newNum: "" },
  { type: "removed", text: " DATA DIVISION.", oldNum: 3, newNum: "" },
  { type: "removed", text: " WORKING-STORAGE SECTION.", oldNum: 4, newNum: "" },
  { type: "removed", text: " 01 WS-FISCAL-YEAR    PIC 9(4).", oldNum: 5, newNum: "" },
  { type: "removed", text: " 01 WS-CLAIM-AMOUNT   PIC 9(7)V99.", oldNum: 6, newNum: "" },
  { type: "removed", text: " 01 WS-PAYMENT-RESULT  PIC 9(7)V99.", oldNum: 7, newNum: "" },
  { type: "removed", text: " 01 WS-ROUNDING-MODE   PIC X(10) VALUE 'HALF-UP'.", oldNum: 8, newNum: "" },
  { type: "added", text: " from decimal import Decimal, ROUND_HALF_UP", oldNum: "", newNum: 1 },
  { type: "added", text: " from dataclasses import dataclass", oldNum: "", newNum: 2 },
  { type: "added", text: " from typing import Optional", oldNum: "", newNum: 3 },
  { type: "added", text: " import os", oldNum: "", newNum: 4 },
  { type: "added", text: "", oldNum: "", newNum: 5 },
  { type: "added", text: " @dataclass", oldNum: "", newNum: 6 },
  { type: "added", text: " class ClaimRecord:", oldNum: "", newNum: 7 },
  { type: "added", text: "     fiscal_year: int", oldNum: "", newNum: 8 },
  { type: "added", text: "     claim_amount: Decimal", oldNum: "", newNum: 9 },
  { type: "added", text: "     payment_result: Optional[Decimal] = None", oldNum: "", newNum: 10 },
  { type: "added", text: '     rounding_mode: str = "HALF_UP"', oldNum: "", newNum: 11, highlights: [[30, 37]] },
  { type: "chunk", text: "@@ -18,16 +16,18 @@", oldNum: "", newNum: "" },
  { type: "removed", text: " PROCEDURE DIVISION.", oldNum: 18, newNum: "" },
  { type: "removed", text: " MAIN-PROCESS.", oldNum: 19, newNum: "" },
  { type: "removed", text: '     ACCEPT WS-FISCAL-YEAR FROM ENVIRONMENT "FISCAL-YEAR"', oldNum: 20, newNum: "" },
  { type: "removed", text: "     IF WS-FISCAL-YEAR = SPACES", oldNum: 21, newNum: "" },
  { type: "removed", text: "         MOVE 2019 TO WS-FISCAL-YEAR", oldNum: 22, newNum: "", highlights: [[14, 18]] },
  { type: "removed", text: "     END-IF", oldNum: 23, newNum: "" },
  { type: "removed", text: "     PERFORM LOAD-RATE-TABLE", oldNum: 24, newNum: "" },
  { type: "removed", text: "     PERFORM CALCULATE-PPS-PAYMENT", oldNum: 25, newNum: "" },
  { type: "removed", text: "     PERFORM WRITE-OUTPUT", oldNum: 26, newNum: "" },
  { type: "removed", text: "     STOP RUN.", oldNum: 27, newNum: "" },
  { type: "added", text: " class HHPPSPricer:", oldNum: "", newNum: 16 },
  { type: "added", text: "     def __init__(self):", oldNum: "", newNum: 17 },
  { type: "added", text: "         # PRESERVED: Legacy default to 2019 if not configured", oldNum: "", newNum: 18, flagged: true },
  { type: "added", text: "         # FLAGGED: Silent default — verify with stakeholder", oldNum: "", newNum: 19, flagged: true },
  { type: "added", text: '         self.fiscal_year = int(os.environ.get("FISCAL_YEAR", "2019"))', oldNum: "", newNum: 20, highlights: [[58, 64]] },
  { type: "added", text: "         self.rate_table = self._load_rate_table()", oldNum: "", newNum: 21 },
  { type: "added", text: "", oldNum: "", newNum: 22 },
  { type: "added", text: "     def process(self, claim: ClaimRecord) -> ClaimRecord:", oldNum: "", newNum: 23 },
  { type: "added", text: '         """Main entry point — replaces MAIN-PROCESS paragraph."""', oldNum: "", newNum: 24 },
  { type: "added", text: "         payment = self._calculate_pps_payment(claim)", oldNum: "", newNum: 25 },
  { type: "added", text: "         claim.payment_result = payment", oldNum: "", newNum: 26 },
  { type: "added", text: "         self._write_output(claim)", oldNum: "", newNum: 27 },
  { type: "added", text: "         return claim", oldNum: "", newNum: 28 },
  { type: "chunk", text: "@@ -38,12 +38,14 @@", oldNum: "", newNum: "" },
  { type: "removed", text: " CALCULATE-PPS-PAYMENT.", oldNum: 38, newNum: "" },
  { type: "removed", text: "     COMPUTE WS-PAYMENT-RESULT =", oldNum: 39, newNum: "" },
  { type: "removed", text: "         WS-CLAIM-AMOUNT * WS-RATE-FACTOR", oldNum: 40, newNum: "" },
  { type: "removed", text: "     IF WS-ROUNDING-MODE = 'HALF-UP'", oldNum: 41, newNum: "" },
  { type: "removed", text: "         COMPUTE WS-PAYMENT-RESULT ROUNDED", oldNum: 42, newNum: "" },
  { type: "removed", text: "             = WS-PAYMENT-RESULT", oldNum: 43, newNum: "" },
  { type: "removed", text: "     END-IF.", oldNum: 44, newNum: "" },
  { type: "added", text: "     def _calculate_pps_payment(self, claim: ClaimRecord) -> Decimal:", oldNum: "", newNum: 38 },
  { type: "added", text: '         """Replaces CALCULATE-PPS-PAYMENT paragraph."""', oldNum: "", newNum: 39 },
  { type: "added", text: "         rate_factor = self.rate_table.get_factor(claim.fiscal_year)", oldNum: "", newNum: 40 },
  { type: "added", text: "         raw_payment = claim.claim_amount * rate_factor", oldNum: "", newNum: 41 },
  { type: "added", text: '         if claim.rounding_mode == "HALF_UP":', oldNum: "", newNum: 42 },
  { type: "added", text: "             return raw_payment.quantize(", oldNum: "", newNum: 43 },
  { type: "added", text: '                 Decimal("0.01"), rounding=ROUND_HALF_UP', oldNum: "", newNum: 44 },
  { type: "added", text: "             )", oldNum: "", newNum: 45 },
  { type: "added", text: '         return raw_payment.quantize(Decimal("0.01"))', oldNum: "", newNum: 46 },
  { type: "chunk", text: "@@ -54,8 +56,10 @@", oldNum: "", newNum: "" },
  { type: "removed", text: ' WRITE-OUTPUT.', oldNum: 54, newNum: "" },
  { type: "removed", text: '     DISPLAY "Payment: " WS-PAYMENT-RESULT', oldNum: 55, newNum: "" },
  { type: "removed", text: "     WRITE OUTPUT-RECORD FROM WS-PAYMENT-RESULT", oldNum: 56, newNum: "" },
  { type: "removed", text: '     DISPLAY "Processing complete.".', oldNum: 57, newNum: "" },
  { type: "added", text: "     def _write_output(self, claim: ClaimRecord) -> None:", oldNum: "", newNum: 56 },
  { type: "added", text: '         """Replaces WRITE-OUTPUT paragraph.', oldNum: "", newNum: 57 },
  { type: "added", text: '         PRESERVED: Logging behavior maintained."""', oldNum: "", newNum: 58, flagged: true },
  { type: "added", text: "         import logging", oldNum: "", newNum: 59 },
  { type: "added", text: "         logger = logging.getLogger(__name__)", oldNum: "", newNum: 60 },
  { type: "added", text: '         logger.info(f"Payment: {claim.payment_result}")', oldNum: "", newNum: 61 },
  { type: "added", text: "         self.db.write_record(claim)", oldNum: "", newNum: 62 },
  { type: "added", text: '         logger.info("Processing complete.")', oldNum: "", newNum: 63 },
];

// ── Count up hook ──────────────────────────────────────────────────
const useCountUp = (target: number, duration = 600, start = false) => {
  const [value, setValue] = useState(0);
  const ref = useRef<number>();
  useEffect(() => {
    if (!start) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 2))));
      if (p < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [target, duration, start]);
  return value;
};

// ── Changes data ───────────────────────────────────────────────────
const changes = [
  { name: "Data divisions → dataclasses", count: 8, status: "translated", changeType: "syntax" },
  { name: "PERFORM → method calls", count: 12, status: "translated", changeType: "syntax" },
  { name: "Flat file I/O → database", count: 5, status: "verify", changeType: "api" },
  { name: "FISCAL-YEAR default", count: 1, status: "flagged", changeType: "logic" },
  { name: "DISPLAY → logging", count: 6, status: "translated", changeType: "style" },
  { name: "Fujitsu runtime → stdlib", count: 20, status: "3 to review", changeType: "api" },
  { name: "COMPUTE → arithmetic", count: 9, status: "translated", changeType: "syntax" },
];

const changeStatusColor = (s: string) => {
  if (s === "flagged") return "#fca5a5";
  if (s === "verify" || s.includes("review")) return "#fcd34d";
  return "#52525b";
};

// ── Flagged items ──────────────────────────────────────────────────
interface FlaggedItem {
  title: string;
  severity: string;
  sevColor: string;
  desc: string;
  source: string;
  actions: string[];
}

const flaggedItems: FlaggedItem[] = [
  {
    title: "Fiscal year silent default",
    severity: "Critical",
    sevColor: "#fca5a5",
    desc: "Legacy defaults to FY2019 when env var is unset. Preserved in migration — verify this is intentional.",
    source: "Source: migrator detected via workflow_miner side_effect_path",
    actions: ["Accept", "Modify"],
  },
  {
    title: "Rounding mode preserved as HALF_UP",
    severity: "Info",
    sevColor: "#71717a",
    desc: "Python 3 defaults to HALF_EVEN. Migration explicitly keeps HALF_UP to match legacy.",
    source: "Source: migrator preserved based on proactive memory warning",
    actions: ["Accept"],
  },
  {
    title: "3 Fujitsu APIs mapped to approximations",
    severity: "Medium",
    sevColor: "#fcd34d",
    desc: "JMPCINT3, COBDUMP, JMPCINT4 mapped to closest stdlib equivalents. Not exact matches.",
    source: "Source: migrator flagged 3 of 23 API calls as approximate",
    actions: ["Accept", "Review mapping"],
  },
];

// ── Main Component ─────────────────────────────────────────────────
interface Props {
  onProceed: () => void;
}

const MigrationResults = ({ onProceed }: Props) => {
  const [visible, setVisible] = useState(false);
  const [fileIdx, setFileIdx] = useState(0);
  const [accepted, setAccepted] = useState<Record<number, boolean>>({});
  const [running, setRunning] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [hoveredLine, setHoveredLine] = useState(-1);

  const filesRemoved = useCountUp(1240, 600, visible);
  const filesAdded = useCountUp(680, 600, visible);
  const structures = useCountUp(8, 400, visible);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const handleCopy = useCallback(() => {
    const text = diffLines.map((l) => {
      const prefix = l.type === "removed" ? "-" : l.type === "added" ? "+" : " ";
      return l.type === "header" || l.type === "chunk" ? l.text : `${prefix}${l.text}`;
    }).join("\n");
    navigator.clipboard.writeText(text);
    toast("Copied to clipboard", { duration: 2000 });
  }, []);

  const handleRun = () => {
    setRunning(true);
    setTimeout(() => onProceed(), 1500);
  };

  const unreviewed = flaggedItems.length - Object.keys(accepted).length;

  const stagger = (i: number) => ({
    opacity: visible ? 1 : 0,
    transition: `opacity 0.3s ease ${i * 50}ms`,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}>
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 20px 100px" }}>
        <div className="max-w-[1120px] mx-auto">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* LEFT — Diff viewer */}
            <div className="lg:w-[62%] min-w-0" style={stagger(0)}>
              <div className="glass overflow-hidden" style={{ borderRadius: 12 }}>
                {/* Diff header */}
                <div className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <GitCompareArrows className="w-4 h-4 shrink-0" style={{ color: "#71717a" }} strokeWidth={1.5} />
                    <span className="font-mono text-[13px] truncate" style={{ color: "#d4d4d8" }}>
                      {files[fileIdx].from} → {files[fileIdx].to}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setFileIdx((p) => Math.max(0, p - 1))}
                      className="w-6 h-6 flex items-center justify-center rounded transition-all"
                      style={{ transitionDuration: "0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />
                    </button>
                    <span className="text-[12px] font-mono" style={{ color: "#52525b" }}>{fileIdx + 1} / {files.length}</span>
                    <button
                      onClick={() => setFileIdx((p) => Math.min(files.length - 1, p + 1))}
                      className="w-6 h-6 flex items-center justify-center rounded transition-all"
                      style={{ transitionDuration: "0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <ChevronRight className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* Diff body */}
                <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
                  {diffLines.map((line, i) => {
                    const isHovered = hoveredLine === i;
                    let bg = "transparent";
                    if (line.type === "removed") bg = "rgba(248,113,113,0.04)";
                    if (line.type === "added") bg = "rgba(110,231,183,0.04)";
                    if (isHovered) bg = line.type === "removed" ? "rgba(248,113,113,0.06)" : line.type === "added" ? "rgba(110,231,183,0.06)" : "rgba(255,255,255,0.02)";

                    const gutterChar = line.type === "removed" ? "−" : line.type === "added" ? "+" : "";
                    const textColor =
                      line.type === "header" ? "#a1a1aa" :
                      line.type === "chunk" ? "#52525b" :
                      line.type === "context" ? "#52525b" : "#a1a1aa";

                    return (
                      <div
                        key={i}
                        className="flex font-mono text-[12px] leading-[1.8] select-text"
                        style={{ background: bg, transition: "background 0.1s ease" }}
                        onMouseEnter={() => setHoveredLine(i)}
                        onMouseLeave={() => setHoveredLine(-1)}
                      >
                        {/* Gutter */}
                        <div className="shrink-0 flex items-center" style={{ width: 44, background: "rgba(0,0,0,0.2)" }}>
                          {line.type !== "header" && line.type !== "chunk" && (
                            <>
                              <span className="w-5 text-right text-[11px]" style={{ color: isHovered ? "#71717a" : "#3f3f46" }}>
                                {line.oldNum}
                              </span>
                              <span className="w-5 text-right text-[11px]" style={{ color: isHovered ? "#71717a" : "#3f3f46" }}>
                                {line.newNum}
                              </span>
                            </>
                          )}
                        </div>
                        {/* Gutter sign */}
                        <span className="w-4 text-center shrink-0 text-[11px]" style={{ color: "#52525b" }}>
                          {gutterChar}
                        </span>
                        {/* Flag icon */}
                        {line.flagged && (
                          <span className="shrink-0 flex items-center mr-1 relative group cursor-default">
                            <AlertTriangle className="w-3 h-3" style={{ color: "#fcd34d" }} strokeWidth={1.5} />
                            <div className="absolute left-4 bottom-0 w-60 opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity" style={{ transitionDuration: "0.15s" }}>
                              <div className="glass p-2 text-[11px]" style={{ color: "#71717a" }}>
                                AI preserved this behavior from legacy code — review recommended
                              </div>
                            </div>
                          </span>
                        )}
                        {/* Code text */}
                        <span
                          className="flex-1 min-w-0 pr-3"
                          style={{
                            color: textColor,
                            fontWeight: line.type === "header" ? 500 : 400,
                            fontStyle: line.type === "chunk" ? "italic" : undefined,
                            whiteSpace: "pre",
                          }}
                        >
                          {line.highlights
                            ? renderHighlights(line.text, line.highlights, line.type === "removed")
                            : (line.text || "\u00A0")}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Diff footer */}
                <div
                  className="flex items-center justify-between px-4 py-2"
                  style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <span className="text-[12px]" style={{ color: "#52525b" }}>Showing file {fileIdx + 1} of {files.length}</span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[12px] transition-all"
                    style={{ color: "#52525b", transitionDuration: "0.15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
                  >
                    <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT — Summary cards */}
            <div className="lg:w-[38%] space-y-2">
              {/* Card 1: Patch stats */}
              <div className="glass p-5" style={{ ...stagger(1), borderRadius: 12 }}>
                <h3 className="text-[14px] font-medium mb-3" style={{ color: "#d4d4d8" }}>Patch summary</h3>
                <div className="space-y-1.5">
                  {[
                    { label: "Files translated", value: "4" },
                    { label: "Lines removed", value: filesRemoved.toLocaleString() },
                    { label: "Lines added", value: filesAdded.toLocaleString() },
                    { label: "Structures converted", value: structures.toString() },
                    { label: "Flake8", value: "Pass", pass: true },
                    { label: "Dead code removed", value: "8 blocks" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-[13px]" style={{ color: "#71717a" }}>{row.label}</span>
                      <span className="text-[13px] font-mono flex items-center gap-1" style={{ color: "#d4d4d8" }}>
                        {row.pass && <Check className="w-3 h-3" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />}
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 2: Changes */}
              <div className="glass p-5" style={{ ...stagger(2), borderRadius: 12 }}>
                <h3 className="text-[14px] font-medium mb-3" style={{ color: "#d4d4d8" }}>Changes</h3>
                <div className="space-y-0.5">
                  {changes.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center justify-between py-1.5 px-2 rounded transition-all cursor-default"
                      style={{ transitionDuration: "0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="text-[13px]" style={{ color: "#a1a1aa" }}>
                        {c.name}
                        <span className="text-[10px] font-mono ml-1.5" style={{ color: "#3f3f46" }}>{c.changeType}</span>
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] font-mono" style={{ color: "#52525b" }}>{c.count}</span>
                        <span className="text-[12px]" style={{ color: changeStatusColor(c.status) }}>{c.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <p className="text-[12px]" style={{ color: "#52525b" }}>61 total · 54 translated · 4 to verify · 3 to review</p>
                </div>
              </div>

              {/* Card 3: Flagged */}
              <div
                className="glass p-5"
                style={{ ...stagger(3), borderRadius: 12, borderTop: "1px solid rgba(252,165,165,0.15)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
                  <h3 className="text-[14px] font-medium" style={{ color: "#d4d4d8" }}>Flagged for review</h3>
                </div>
                <div className="space-y-0">
                  {flaggedItems.map((item, i) => (
                    <div key={i}>
                      <div className="py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] font-medium flex items-center gap-1.5" style={{ color: "#d4d4d8" }}>
                            {accepted[i] && <Check className="w-3 h-3 shrink-0" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />}
                            {item.title}
                          </span>
                          <span className="text-[12px]" style={{ color: item.sevColor }}>{item.severity}</span>
                        </div>
                        <p className="text-[12px] leading-relaxed mb-1" style={{ color: "#71717a" }}>{item.desc}</p>
                        <p className="text-[11px] mb-2" style={{ color: "#3f3f46" }}>{item.source}</p>
                        <div className="flex items-center gap-2">
                          {item.actions.map((action) => (
                            <button
                              key={action}
                              onClick={() => {
                                if (action === "Accept") setAccepted((p) => ({ ...p, [i]: true }));
                              }}
                              className="text-[12px] transition-all"
                              style={{
                                color: accepted[i] && action === "Accept" ? "#6ee7b7" : "#71717a",
                                transitionDuration: "0.15s",
                              }}
                              onMouseEnter={(e) => {
                                if (!(accepted[i] && action === "Accept")) e.currentTarget.style.color = "#a1a1aa";
                              }}
                              onMouseLeave={(e) => {
                                if (!(accepted[i] && action === "Accept")) e.currentTarget.style.color = "#71717a";
                              }}
                            >
                              {accepted[i] && action === "Accept" ? (
                                <span className="flex items-center gap-1"><Check className="w-3 h-3" strokeWidth={1.5} /> Accepted</span>
                              ) : action}
                            </button>
                          ))}
                        </div>
                      </div>
                      {i < flaggedItems.length - 1 && <div style={{ height: 1, background: "rgba(255,255,255,0.03)" }} />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 4: AI notes */}
              <div className="glass p-5" style={{ ...stagger(4), borderRadius: 12 }}>
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
                  <h3 className="text-[14px] font-medium" style={{ color: "#d4d4d8" }}>Migration notes</h3>
                </div>
                <p className="text-[13px] leading-[1.7]" style={{ color: "#71717a" }}>
                  Translated 4 COBOL modules (1,240 lines) to Python 3 (680 lines). Rounding behavior explicitly preserved as <span className="font-mono">ROUND_HALF_UP</span>. Fiscal year fallback to 2019 maintained — consider requiring explicit configuration in production. All flat file operations replaced with database abstraction. COBOL <span className="font-mono">DISPLAY</span> statements converted to Python logging module with original message strings preserved.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        className="sticky bottom-0 flex items-center justify-between flex-wrap gap-2 z-40"
        style={{ padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.04)", backdropFilter: "blur(16px)", background: "rgba(9,9,11,0.85)" }}
      >
        <p className="font-mono text-[12px]" style={{ color: "#52525b" }}>
          4 files · 61 changes · {unreviewed > 0 ? unreviewed : 0} flagged
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowReject(true)}
            className="text-[13px] transition-all"
            style={{ color: "#fca5a5", transitionDuration: "0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Reject patch
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="btn-primary text-[13px] font-medium flex items-center gap-2 px-5 py-2 relative"
          >
            {running ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> Running...</>
            ) : (
              <>Run validation <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} /></>
            )}
            {unreviewed > 0 && !running && (
              <span
                className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full"
                style={{ background: "#fcd34d" }}
                title={`${unreviewed} items not yet reviewed`}
              />
            )}
          </button>
        </div>
      </div>

      {/* Reject modal */}
      {showReject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowReject(false)}
        >
          <div className="glass p-6 max-w-md w-full mx-4" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-medium mb-2" style={{ color: "#d4d4d8" }}>Discard migration patch?</h3>
            <p className="text-[13px] mb-5" style={{ color: "#71717a" }}>Changes will be lost. Requirements and review decisions are preserved.</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowReject(false)} className="text-[13px]" style={{ color: "#71717a" }}>Cancel</button>
              <button onClick={() => setShowReject(false)} className="text-[13px] font-medium" style={{ color: "#fca5a5" }}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Highlight specific tokens in a line
function renderHighlights(text: string, highlights: [number, number][], isRemoved: boolean) {
  const bg = isRemoved ? "rgba(248,113,113,0.1)" : "rgba(110,231,183,0.1)";
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const [start, end] of highlights) {
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span key={start} style={{ background: bg, borderRadius: 2, padding: "0 1px" }}>
        {text.slice(start, end)}
      </span>
    );
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export default MigrationResults;

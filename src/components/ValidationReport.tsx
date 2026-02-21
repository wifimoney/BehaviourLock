import { useState, useEffect, useRef, useCallback } from "react";
import {
  FlaskConical, GitCompareArrows, Undo2, ShieldCheck, Brain, Info,
  Check, X, AlertTriangle, Lock, Loader2, CheckCircle2, Copy,
  FileText, Plus,
} from "lucide-react";
import { toast } from "sonner";

// ── Count-up hook ──
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

// ── Data ──
type Verdict = "SAFE" | "RISKY" | "BLOCKED";

const verdictColors: Record<Verdict, { text: string; border: string }> = {
  SAFE: { text: "#6ee7b7", border: "rgba(110,231,183,0.12)" },
  RISKY: { text: "#fcd34d", border: "rgba(252,211,77,0.12)" },
  BLOCKED: { text: "#fca5a5", border: "rgba(252,165,165,0.12)" },
};

const currentVerdict: Verdict = "RISKY";

interface TestRow {
  name: string;
  fn: string;
  time: string;
  status: "pass" | "fail" | "warn";
}

const testRows: TestRow[] = [
  { name: "test_process_order_basic_0", fn: "process_order", time: "45ms", status: "pass" },
  { name: "test_process_order_edge_cases_1", fn: "process_order", time: "38ms", status: "pass" },
  { name: "test_calc_total_standard_2", fn: "calc_total", time: "52ms", status: "pass" },
  { name: "test_calc_total_discount_3", fn: "calc_total", time: "41ms", status: "pass" },
  { name: "test_validate_claim_30day_4", fn: "validate_claim", time: "12ms", status: "pass" },
  { name: "test_validate_claim_60day_5", fn: "validate_claim", time: "14ms", status: "pass" },
  { name: "test_rate_lookup_fy2023_6", fn: "rate_lookup", time: "8ms", status: "pass" },
  { name: "test_rate_lookup_fy2024_7", fn: "rate_lookup", time: "7ms", status: "pass" },
  { name: "test_env_config_fallback_8", fn: "env_config", time: "5ms", status: "fail" },
  { name: "test_payment_output_format_9", fn: "payment_output", time: "22ms", status: "pass" },
  { name: "test_round_payment_halfup_10", fn: "round_payment", time: "3ms", status: "pass" },
  { name: "test_error_handling_11", fn: "claim_validate", time: "15ms", status: "pass" },
  { name: "test_claim_edge_rates_12", fn: "validate_claim", time: "28ms", status: "warn" },
  { name: "test_rate_table_boundary_13", fn: "rate_table", time: "18ms", status: "pass" },
];

interface ChecklistItem {
  text: string;
  hasDropdown: boolean;
  options?: string[];
}

const checklistItems: ChecklistItem[] = [
  {
    text: "I have reviewed the fiscal year default drift and accept the warning log as an improvement",
    hasDropdown: true,
    options: ["Accept as improvement", "Revert to silent default", "Accept with documentation"],
  },
  {
    text: "I have reviewed the rate factor precision drift (0.0001) and confirm it is within tolerance",
    hasDropdown: true,
    options: ["Accept — below threshold", "Reject — align to legacy precision", "Escalate to SME"],
  },
  {
    text: "I confirm that 85.7% behavior preservation meets our threshold for this migration phase",
    hasDropdown: false,
  },
  {
    text: "I have verified the 3 unmapped Fujitsu APIs are resolved or deferred",
    hasDropdown: false,
  },
  {
    text: "I acknowledge the rollback plan and understand how to revert",
    hasDropdown: false,
  },
];

// ── Component ──
const ValidationReport = () => {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [flashDropdown, setFlashDropdown] = useState<number | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [hoveredTestRow, setHoveredTestRow] = useState(-1);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const passed = useCountUp(12, 600, visible);
  const linesRemoved = useCountUp(1240, 600, visible);
  const linesAdded = useCountUp(680, 600, visible);

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const allChecked = checkedCount === checklistItems.length;

  // Verify dropdowns are selected for items that need them
  const canApprove = allChecked && checklistItems.every((item, i) =>
    !item.hasDropdown || selections[i]
  );

  const handleCheck = (idx: number) => {
    const item = checklistItems[idx];
    if (item.hasDropdown && !selections[idx]) {
      setFlashDropdown(idx);
      setTimeout(() => setFlashDropdown(null), 600);
      return;
    }
    setChecked(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleDeploy = () => {
    if (!canApprove) return;
    setDeploying(true);
    setTimeout(() => {
      setDeploying(false);
      setDeployed(true);
    }, 2000);
  };

  const handleCopyRollback = useCallback(() => {
    navigator.clipboard.writeText("git stash pop");
    toast("Copied", { duration: 2000 });
  }, []);

  const stagger = (i: number) => ({
    opacity: visible ? 1 : 0,
    transition: `opacity 0.3s ease ${i * 50}ms`,
  });

  const vc = verdictColors[currentVerdict];

  const StatusIcon = ({ status }: { status: TestRow["status"] }) => {
    if (status === "pass") return <Check className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />;
    if (status === "fail") return <X className="w-3.5 h-3.5" style={{ color: "#fca5a5" }} strokeWidth={1.5} />;
    return <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#fcd34d" }} strokeWidth={1.5} />;
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: "24px 20px 80px" }}>
      <div className="max-w-[880px] mx-auto flex flex-col gap-2">

        {/* ── CARD 1: Verdict ── */}
        <div
          className="glass p-8"
          style={{
            ...stagger(0),
            background: "rgba(255,255,255,0.05)",
            borderTop: `1px solid ${vc.border}`,
          }}
        >
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="font-mono text-[32px] font-bold" style={{ color: vc.text }}>
                {currentVerdict}
              </div>
              <div className="text-[13px] mt-1" style={{ color: "#71717a" }}>
                Behavioral drift detected in migrated code
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[40px] font-bold" style={{ color: "#e4e4e7" }}>
                85.7%
              </div>
              <div className="text-[13px]" style={{ color: "#71717a" }}>
                behavior preserved
              </div>
            </div>
          </div>

          <div className="my-5" style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "Tests passed", value: `${passed} / 14` },
              { label: "Critical drifts", value: "1", color: "#fca5a5" },
              { label: "Non-critical drifts", value: "1" },
              { label: "Trust coverage", value: "71%", color: "#fcd34d" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[12px] mb-1" style={{ color: "#52525b" }}>{s.label}</div>
                <div className="font-mono text-[16px]" style={{ color: s.color || "#d4d4d8" }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div className="my-5" style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />

          <div className="flex items-start gap-1.5 mb-4">
            <Info className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#3f3f46" }} strokeWidth={1.5} />
            <p className="text-[12px] leading-[1.5]" style={{ color: "#52525b" }}>
              Trust coverage measures the percentage of high-value business logic (entrypoints + side-effect functions) guarded by characterization tests. 71% means 29% of critical paths are unverified blind spots. (10 tests / 14 high-value functions = 71%)
            </p>
          </div>

          {/* What changed / Why / Judge summary / Risk score */}
          <div className="space-y-3">
            <div>
              <div className="text-[12px] mb-1" style={{ color: "#52525b" }}>What changed</div>
              <p className="text-[13px]" style={{ color: "#a1a1aa" }}>
                Migration converted COBOL data divisions to Python dataclasses, PERFORM paragraphs to methods, and flat file I/O to database access. Rounding behavior explicitly preserved.
              </p>
            </div>
            <div>
              <div className="text-[12px] mb-1" style={{ color: "#52525b" }}>Why</div>
              <p className="text-[13px]" style={{ color: "#a1a1aa" }}>
                COBOL-85 syntax is incompatible with modern Python runtimes. Fujitsu NetCOBOL dependencies require replacement with standard library equivalents.
              </p>
            </div>
            <p className="text-[13px] font-medium" style={{ color: "#d4d4d8" }}>
              85.7% safe with one fiscal year edge case and one precision delta — both documented and reversible.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[12px]" style={{ color: "#52525b" }}>Risk score</span>
              <div className="relative" style={{ width: 100, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ width: "42%", height: "100%", borderRadius: 2, background: "#fcd34d" }} />
              </div>
              <span className="font-mono text-[11px]" style={{ color: "#52525b" }}>0.42</span>
            </div>
          </div>
        </div>

        {/* ── CARD 2: Test Results ── */}
        <div className="glass p-5" style={stagger(1)}>
          <div className="flex items-center gap-2 mb-4">
            <FlaskConical className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
            <span className="text-[14px] font-medium" style={{ color: "#d4d4d8" }}>Test results</span>
          </div>

          {/* Header */}
          <div className="grid grid-cols-[1fr_120px_60px_40px] px-3 mb-1">
            <span className="text-[12px] font-medium" style={{ color: "#52525b" }}>Test</span>
            <span className="text-[12px] font-medium" style={{ color: "#52525b" }}>Function</span>
            <span className="text-[12px] font-medium text-right" style={{ color: "#52525b" }}>Time</span>
            <span className="text-[12px] font-medium text-right" style={{ color: "#52525b" }}>Status</span>
          </div>

          {testRows.map((row, i) => {
            const isHovered = hoveredTestRow === i;
            let bg = i % 2 === 1 ? "rgba(255,255,255,0.02)" : "transparent";
            if (row.status === "fail") bg = "rgba(252,165,165,0.03)";
            if (row.status === "warn") bg = "rgba(252,211,77,0.03)";
            if (isHovered) bg = "rgba(255,255,255,0.03)";

            return (
              <div
                key={row.name}
                className="grid grid-cols-[1fr_120px_60px_40px] items-center px-3 rounded-md"
                style={{ height: 36, background: bg, transition: "background 0.1s ease" }}
                onMouseEnter={() => setHoveredTestRow(i)}
                onMouseLeave={() => setHoveredTestRow(-1)}
              >
                <span className="font-mono text-[12px] truncate" style={{ color: "#a1a1aa" }}>{row.name}</span>
                <span className="text-[12px]" style={{ color: "#52525b" }}>{row.fn}</span>
                <span className="font-mono text-[11px] text-right" style={{ color: "#52525b" }}>{row.time}</span>
                <div className="flex justify-end"><StatusIcon status={row.status} /></div>
              </div>
            );
          })}

          <div className="mt-3 px-3 text-[12px]" style={{ color: "#52525b" }}>
            {passed} passed · 1 failed · 1 warning · 308ms total
          </div>
        </div>

        {/* ── CARD 3: Drift Analysis ── */}
        <div className="glass p-5" style={stagger(2)}>
          <div className="flex items-center gap-2 mb-4">
            <GitCompareArrows className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
            <span className="text-[14px] font-medium" style={{ color: "#d4d4d8" }}>Behavioral drifts</span>
          </div>

          {/* Drift 1 */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <X className="w-3 h-3" style={{ color: "#fca5a5" }} strokeWidth={1.5} />
              <span className="text-[12px]" style={{ color: "#fca5a5" }}>Critical</span>
              <span className="font-mono text-[12px] ml-1" style={{ color: "#a1a1aa" }}>test_env_config_fallback_8</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-1">
              <div className="flex-1">
                <div className="text-[11px] mb-1.5" style={{ color: "#52525b" }}>Expected (baseline)</div>
                <div className="rounded-lg p-3 font-mono text-[12px] leading-[1.7]" style={{ background: "rgba(0,0,0,0.2)", color: "#a1a1aa" }}>
                  FISCAL-YEAR not set<br />
                  → silently defaults to 2019<br />
                  → Rate table: FY2019 applied<br />
                  → No warning emitted
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[11px] mb-1.5" style={{ color: "#52525b" }}>Actual (migrated)</div>
                <div className="rounded-lg p-3 font-mono text-[12px] leading-[1.7]" style={{ background: "rgba(0,0,0,0.2)", color: "#a1a1aa" }}>
                  FISCAL_YEAR not set<br />
                  → defaults to 2019 ✓<br />
                  → Rate table: FY2019 applied ✓<br />
                  → Warning log emitted <span style={{ color: "#fcd34d" }}>← NEW</span>
                </div>
              </div>
            </div>

            <p className="text-[12px] leading-[1.5] mt-3" style={{ color: "#71717a" }}>
              Test passed on legacy code but FAILED after migration. Migration likely changed behavior. Error: <span className="font-mono">AssertionError — expected no warning log output, got: WARNING:hh_pps_pricer:Using default fiscal year 2019</span>
            </p>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />

          {/* Drift 2 */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-3 h-3" style={{ color: "#fcd34d" }} strokeWidth={1.5} />
              <span className="text-[12px]" style={{ color: "#fcd34d" }}>Non-critical</span>
              <span className="font-mono text-[12px] ml-1" style={{ color: "#a1a1aa" }}>test_claim_edge_rates_12</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-1">
              <div className="flex-1">
                <div className="text-[11px] mb-1.5" style={{ color: "#52525b" }}>Expected (baseline)</div>
                <div className="rounded-lg p-3 font-mono text-[12px] leading-[1.7]" style={{ background: "rgba(0,0,0,0.2)", color: "#a1a1aa" }}>
                  30-day rate factor: 1.0247<br />
                  60-day rate factor: 1.0251
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[11px] mb-1.5" style={{ color: "#52525b" }}>Actual (migrated)</div>
                <div className="rounded-lg p-3 font-mono text-[12px] leading-[1.7]" style={{ background: "rgba(0,0,0,0.2)", color: "#a1a1aa" }}>
                  30-day rate factor: 1.0248<br />
                  60-day rate factor: 1.0252
                </div>
              </div>
            </div>

            <p className="text-[12px] leading-[1.5] mt-3" style={{ color: "#71717a" }}>
              Test passed both before and after, but output changed. May indicate cosmetic change or subtle logic shift.
            </p>
          </div>
        </div>

        {/* ── CARD 4: Rollback ── */}
        <div className="glass p-5" style={stagger(3)}>
          <div className="flex items-center gap-2 mb-3">
            <Undo2 className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
            <span className="text-[14px] font-medium" style={{ color: "#d4d4d8" }}>Rollback plan</span>
          </div>

          <p className="text-[13px] mb-3" style={{ color: "#71717a" }}>
            If this migration is rejected, all changes can be reverted:
          </p>

          <div className="relative rounded-lg p-3.5" style={{ background: "rgba(0,0,0,0.2)" }}>
            <code className="font-mono text-[13px]" style={{ color: "#d4d4d8" }}>git stash pop</code>
            <button
              onClick={handleCopyRollback}
              className="absolute top-2.5 right-2.5 p-1 rounded transition-all"
              style={{ transitionDuration: "0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Copy className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />
            </button>
          </div>

          <p className="text-[12px] mt-3" style={{ color: "#52525b" }}>
            Scope: 4 modified files reverted to pre-migration state. Requirements and review decisions are preserved.
          </p>
        </div>

        {/* ── CARD 5: Human Approval Gate ── */}
        <div
          className="glass"
          style={{ ...stagger(4), padding: 28, background: "rgba(255,255,255,0.05)" }}
        >
          {!deployed ? (
            <>
              <div className="flex items-center gap-2.5 mb-1">
                <ShieldCheck className="w-[18px] h-[18px]" style={{ color: "#a1a1aa" }} strokeWidth={1.5} />
                <span className="text-[16px] font-medium" style={{ color: "#e4e4e7" }}>Approval required</span>
              </div>
              <p className="text-[13px] mb-4" style={{ color: "#71717a" }}>
                Review each item and confirm before deployment
              </p>

              <div style={{ height: 1, background: "rgba(255,255,255,0.04)" }} className="mb-4" />

              {/* Checklist */}
              <div className="flex flex-col gap-3">
                {checklistItems.map((item, idx) => (
                  <div key={idx}>
                    <div
                      className="flex items-start gap-3 cursor-pointer group"
                      onClick={() => handleCheck(idx)}
                    >
                      {/* Checkbox */}
                      <div
                        className="w-5 h-5 shrink-0 rounded flex items-center justify-center mt-0.5 transition-all"
                        style={{
                          transitionDuration: "0.15s",
                          border: checked[idx]
                            ? "1.5px solid rgba(110,231,183,0.3)"
                            : "1.5px solid rgba(255,255,255,0.15)",
                          background: checked[idx] ? "rgba(110,231,183,0.1)" : "transparent",
                        }}
                      >
                        {checked[idx] && (
                          <Check
                            className="w-3 h-3"
                            style={{ color: "#6ee7b7", transform: "scale(1)", transition: "transform 0.1s ease" }}
                            strokeWidth={2}
                          />
                        )}
                      </div>
                      <span
                        className="text-[13px] leading-[1.5] transition-colors"
                        style={{
                          color: checked[idx] ? "#d4d4d8" : "#a1a1aa",
                          transitionDuration: "0.15s",
                        }}
                      >
                        {item.text}
                      </span>
                    </div>

                    {/* Dropdown */}
                    {item.hasDropdown && (
                      <div className="ml-8 mt-2">
                        <select
                          className="w-full glass-input text-[12px] px-3 py-2 appearance-none cursor-pointer"
                          style={{
                            color: selections[idx] ? "#a1a1aa" : "#52525b",
                            borderColor: flashDropdown === idx ? "rgba(252,165,165,0.3)" : undefined,
                            transition: "border-color 0.15s ease",
                          }}
                          value={selections[idx] || ""}
                          onChange={(e) => {
                            setSelections(prev => ({ ...prev, [idx]: e.target.value }));
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="" disabled>Select a decision...</option>
                          {item.options!.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="mt-5">
                <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(checkedCount / checklistItems.length) * 100}%`,
                      background: allChecked ? "#6ee7b7" : "#52525b",
                      transitionDuration: "0.2s",
                    }}
                  />
                </div>
                <div className="text-[11px] mt-1.5" style={{ color: "#52525b" }}>
                  {checkedCount} of {checklistItems.length} confirmed
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.04)" }} className="my-5" />

              {/* Actions */}
              <div className="flex items-center justify-end gap-3">
                <button
                  className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg transition-all"
                  style={{ color: "#fca5a5", transitionDuration: "0.15s" }}
                  onClick={() => setShowReject(true)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(252,165,165,0.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Reject & rollback
                </button>

                <div className="relative group">
                  <button
                    className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium rounded-lg transition-all"
                    style={{
                      transitionDuration: "0.3s",
                      ...(canApprove && !deploying
                        ? {
                            background: "rgba(110,231,183,0.1)",
                            border: "1px solid rgba(110,231,183,0.2)",
                            color: "#6ee7b7",
                            cursor: "pointer",
                          }
                        : {
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            color: "#52525b",
                            cursor: "not-allowed",
                          }),
                    }}
                    onMouseEnter={(e) => {
                      if (canApprove && !deploying) {
                        e.currentTarget.style.background = "rgba(110,231,183,0.15)";
                        e.currentTarget.style.boxShadow = "0 0 12px rgba(110,231,183,0.08)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (canApprove && !deploying) {
                        e.currentTarget.style.background = "rgba(110,231,183,0.1)";
                        e.currentTarget.style.boxShadow = "none";
                      }
                    }}
                    onClick={handleDeploy}
                    disabled={!canApprove || deploying}
                  >
                    {deploying ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />
                    ) : canApprove ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                    ) : (
                      <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
                    )}
                    {deploying ? "Deploying..." : "Approve & deploy"}
                  </button>

                  {/* Unreviewed dot + tooltip */}
                  {!canApprove && !deploying && (
                    <>
                      <div
                        className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full"
                        style={{ background: "#fcd34d" }}
                      />
                      <div className="absolute bottom-full right-0 mb-2 w-52 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" style={{ transitionDuration: "0.15s" }}>
                        <div className="glass p-2 text-[12px]" style={{ color: "#71717a" }}>
                          Complete all review items to approve
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* ── SUCCESS STATE ── */
            <div className="flex flex-col items-center py-6">
              <CheckCircle2 className="w-12 h-12 mb-4" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />
              <div className="text-[20px] font-medium mb-1" style={{ color: "#e4e4e7" }}>
                Migration approved
              </div>
              <div className="text-[13px] mb-5" style={{ color: "#71717a" }}>
                Deployment queued successfully
              </div>
              <div className="text-[12px] mb-5 text-center" style={{ color: "#52525b" }}>
                Run persisted to memory · 2 drift patterns updated · Next run will use these as proactive warnings
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.04)", width: "100%", maxWidth: 400 }} className="mb-4" />
              <div className="text-[12px] font-mono text-center" style={{ color: "#52525b" }}>
                Approved at {new Date().toLocaleTimeString()} · Session: demo · Verdict: RISKY (85.7%) · 2 drifts accepted
              </div>
              <div className="flex items-center gap-4 mt-5">
                <button className="flex items-center gap-1.5 text-[12px] btn-ghost">
                  <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                  View full report
                </button>
                <button className="flex items-center gap-1.5 text-[12px] btn-ghost">
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Start new migration
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── CARD 6: AI Summary (before approval) ── */}
        {!deployed && (
          <div className="glass p-5" style={stagger(5)}>
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
              <span className="text-[14px] font-medium" style={{ color: "#d4d4d8" }}>Analysis summary</span>
            </div>
            <p className="text-[13px] leading-[1.7]" style={{ color: "#71717a" }}>
              This migration translates 4 COBOL modules ({linesRemoved.toLocaleString()} lines) into Python 3 ({linesAdded.toLocaleString()} lines) with 85.7% behavioral parity. One critical drift was detected in the fiscal year default handling — the migrated code adds a warning log that the legacy system did not emit. One non-critical precision difference was found in rate factor calculations (0.0001 delta, below CMS rounding threshold). Trust coverage is 71%, meaning 29% of high-value business logic paths lack characterization test coverage. These blind spots are primarily in the <span className="font-mono">Fujitsu</span> runtime bridge module, which has been deferred to phase 2. Both drifts have been recorded to <span className="font-mono">drift_patterns</span> and will surface as proactive warnings in future migration runs via <span className="font-mono">mem.proactive_warnings()</span>.
            </p>
          </div>
        )}

        {/* ── Bottom closing line ── */}
        <div className="text-center mt-12 mb-2">
          <p className="text-[13px] italic" style={{ color: "#3f3f46" }}>
            Modernization speed without trust is useless. We deliver both.
          </p>
          <p className="text-[11px] mt-6" style={{ color: "#27272a" }}>
            B.LOC v0.1 · Built at Hackathon 2025
          </p>
        </div>
      </div>

      {/* ── Reject Modal ── */}
      {showReject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowReject(false)}
        >
          <div
            className="glass p-6 w-full max-w-[420px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-medium mb-3" style={{ color: "#d4d4d8" }}>
              Reject migration?
            </h3>
            <p className="text-[13px] mb-5" style={{ color: "#71717a" }}>
              All code changes will be reverted. Requirements, review decisions, and test data are preserved for the next attempt.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button className="btn-ghost text-[13px] px-3 py-2" onClick={() => setShowReject(false)}>
                Cancel
              </button>
              <button
                className="text-[13px] font-medium px-3 py-2 rounded-lg transition-all"
                style={{ color: "#fca5a5", transitionDuration: "0.15s" }}
                onClick={() => setShowReject(false)}
              >
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidationReport;

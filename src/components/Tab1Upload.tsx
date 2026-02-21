import { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  Upload,
  Loader2,
  FolderGit2,
  AlertTriangle,
  FileCheck,
} from "lucide-react";

interface Tab1UploadProps {
  onContinue: () => void;
}

const scanLines = [
  "Ingesting repository...",
  "Parsing AST and mapping call graph...",
  "Detecting side effects and entrypoints...",
  "Extracting behavioral requirements...",
  'Analysis complete ✓',
];

const stats = [
  { label: "Functions", value: 87, color: "#fafafa" },
  { label: "Side effects", value: 23, color: "#fcd34d" },
  { label: "Entrypoints", value: 8, color: "#fafafa" },
  { label: "Test coverage", value: 0, suffix: "%", color: "#fca5a5" },
];

const risks = [
  { severity: "Critical", color: "#fca5a5", text: "FISCAL-YEAR environment variable silently defaults to 2019 when unset — affects all payment calculations" },
  { severity: "Critical", color: "#fca5a5", text: "Fujitsu NetCOBOL runtime is end-of-support — 23 proprietary API calls require replacement" },
  { severity: "Critical", color: "#fca5a5", text: "Zero test coverage — no existing tests to verify behavior during migration" },
  { severity: "High", color: "#fcd34d", text: "COBOL ROUND_HALF_UP behavior will silently change to Python 3 ROUND_HALF_EVEN default" },
  { severity: "Medium", color: "#a1a1aa", text: "30-day and 60-day claim paths use different hardcoded rate factors that differ from published CMS tables" },
];

const requirements = [
  { id: "R1", name: "Accurate Medicare PPS payment estimation", dot: "#6ee7b7" },
  { id: "R2", name: "Support multiple PPS pricer types", dot: "#6ee7b7" },
  { id: "R3", name: "Historical claims processing (30/60-day)", dot: "#fcd34d" },
  { id: "R4", name: "Claim data input and payment output", dot: "#6ee7b7" },
  { id: "R5", name: "Modernized runtime environment", dot: "#fcd34d" },
];

type Phase = "idle" | "scanning" | "results";

const Tab1Upload = ({ onContinue }: Tab1UploadProps) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [repoPath, setRepoPath] = useState("");
  const [visibleLines, setVisibleLines] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [animatedStats, setAnimatedStats] = useState(stats.map(() => 0));
  const [dragOver, setDragOver] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const startScan = (path: string) => {
    if (!path.trim()) return;
    setRepoPath(path);
    setPhase("scanning");
    setVisibleLines(0);
  };

  // Scanning animation
  useEffect(() => {
    if (phase !== "scanning") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    scanLines.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), 300 + i * 400));
    });
    timers.push(
      setTimeout(() => {
        setPhase("results");
        setShowResults(true);
      }, 300 + scanLines.length * 400 + 500)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Stat counter animation
  useEffect(() => {
    if (!showResults) return;
    const duration = 600;
    const steps = 30;
    const interval = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedStats(stats.map((s) => Math.round(s.value * eased)));
      if (step >= steps) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [showResults]);

  // Auto-scroll to results
  useEffect(() => {
    if (showResults && resultsRef.current) {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [showResults]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[720px] mx-auto px-6 py-12">
        {/* Hero */}
        <h1 className="text-[20px] font-medium text-foreground mb-2">Analyze your legacy codebase</h1>
        <p className="text-[14px] leading-relaxed mb-6" style={{ color: "#a1a1aa" }}>
          Point B.LOC at your repo. We'll extract behavioral requirements, detect risks, and build a migration plan.
        </p>

        {/* Input card */}
        <div className="glass p-6 mb-6">
          {phase === "idle" || phase === "results" ? (
            <>
              <label className="text-[12px] font-medium block mb-2" style={{ color: "#a1a1aa" }}>
                Repository path
              </label>
              <input
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="./path/to/repo"
                className="glass-input w-full px-3.5 py-3 text-[14px] font-mono text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === "Enter" && startScan(repoPath)}
              />

              {/* Divider with "or" */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                <span className="text-[12px]" style={{ color: "#52525b" }}>or</span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              </div>

              {/* Drop zone */}
              <div
                className={`dashed-drop-zone flex flex-col items-center justify-center gap-2 py-8 cursor-pointer ${dragOver ? "drag-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) startScan(file.name.replace(/\.(zip|tar\.gz|tgz)$/, ""));
                }}
              >
                <Upload className="w-5 h-5" style={{ color: "#52525b" }} strokeWidth={1.5} />
                <span className="text-[13px]" style={{ color: "#71717a" }}>Drop .zip file here</span>
              </div>

              {/* Try demo */}
              <div className="text-center mt-3">
                <button
                  className="text-[13px] underline transition-colors"
                  style={{ color: "#71717a", background: "none", border: "none", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#71717a")}
                  onClick={() => {
                    setRepoPath("./sample_legacy");
                    setTimeout(() => startScan("./sample_legacy"), 100);
                  }}
                >
                  Try demo
                </button>
              </div>

              {/* Analyze button */}
              <button
                onClick={() => startScan(repoPath)}
                disabled={!repoPath.trim()}
                className="btn-primary w-full py-3 mt-4 text-[13px] font-medium flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Analyze repository <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </>
          ) : (
            /* Scanning state */
            <div className="py-4">
              <div className="flex items-center gap-2 mb-4">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#71717a" }} strokeWidth={1.5} />
                <span className="text-[13px]" style={{ color: "#a1a1aa" }}>Analyzing...</span>
              </div>
              <div className="space-y-1.5 font-mono text-[12px]">
                {scanLines.map((line, i) => {
                  const isComplete = line.includes("✓");
                  return (
                    <div
                      key={i}
                      style={{
                        opacity: i < visibleLines ? 1 : 0,
                        transform: i < visibleLines ? "translateX(0)" : "translateX(-4px)",
                        transition: "all 0.3s ease",
                        color: isComplete && i < visibleLines ? "#6ee7b7" : "#71717a",
                      }}
                    >
                      {line}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {showResults && (
          <div ref={resultsRef} className="space-y-2 animate-fade-in">
            {/* Repository summary */}
            <div className="glass p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
                  <span className="font-mono text-[14px] text-foreground">cms/pc-pricer-legacy</span>
                </div>
                <span className="text-[12px]" style={{ color: "#71717a" }}>COBOL · 156 files · 48,230 lines</span>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {stats.map((s, i) => (
                  <div key={s.label} className="text-center">
                    <div className="font-mono text-[20px] font-medium" style={{ color: s.color }}>
                      {animatedStats[i]}{s.suffix || ""}
                    </div>
                    <div className="text-[12px]" style={{ color: "#71717a" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risks */}
            <div className="glass p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
                <span className="text-[14px] font-medium" style={{ color: "#a1a1aa" }}>Risks detected</span>
              </div>
              <div>
                {risks.map((r, i) => (
                  <div
                    key={i}
                    className="flex gap-3 py-2.5 transition-colors"
                    style={{ cursor: "default" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span className="text-[12px] font-medium shrink-0 w-14" style={{ color: r.color }}>{r.severity}</span>
                    <span className="text-[13px]" style={{ color: "#a1a1aa" }}>{r.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Requirements preview */}
            <div className="glass p-5">
              <div className="flex items-center gap-2 mb-1">
                <FileCheck className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
                <span className="text-[14px] font-medium" style={{ color: "#a1a1aa" }}>Extracted requirements</span>
              </div>
              <p className="text-[12px] mb-3" style={{ color: "#52525b" }}>
                5 behavioral requirements detected — review and refine in the next tab
              </p>
              <div className="space-y-1.5">
                {requirements.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.dot }} />
                    <span className="font-mono text-[11px]" style={{ color: "#818cf8" }}>{r.id}</span>
                    <span className="text-[13px]" style={{ color: "#a1a1aa" }}>{r.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-[12px] mt-3" style={{ color: "#71717a" }}>3 verified · 2 need your review</p>
            </div>

            {/* CTA */}
            <div className="pt-6 text-center">
              <button
                onClick={onContinue}
                className="btn-primary px-8 py-3 text-[13px] font-medium inline-flex items-center gap-2"
              >
                Continue to Requirements <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
              <p className="text-[12px] mt-3 max-w-[480px] mx-auto" style={{ color: "#52525b" }}>
                B.LOC extracted these requirements using AST analysis and AI inference. You'll review, edit, and approve them before any code is changed.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tab1Upload;

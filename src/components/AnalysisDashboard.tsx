import { useState, useEffect } from "react";
import { ArrowRight, Code2 } from "lucide-react";
import LegacyScoreGauge from "./analysis/LegacyScoreGauge";
import StatsRow from "./analysis/StatsRow";
import OutdatedPatterns from "./analysis/OutdatedPatterns";
import DependencyHealth from "./analysis/DependencyHealth";
import CodeAgeChart from "./analysis/CodeAgeChart";
import HiddenDependencies from "./analysis/HiddenDependencies";
import MigrationEstimate from "./analysis/MigrationEstimate";

interface AnalysisDashboardProps {
  repoName: string;
  onContinue: () => void;
}

const AnalysisDashboard = ({ repoName, onContinue }: AnalysisDashboardProps) => {
  const [visible, setVisible] = useState(false);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleContinue = () => {
    setBuilding(true);
    setTimeout(() => onContinue(), 1500);
  };

  const stagger = (delayMs: number) => ({
    opacity: visible ? 1 : 0,
    transition: `opacity 0.3s ease ${delayMs}ms`,
  });

  return (
    <div className="flex-1 px-4 md:px-8 py-8 max-w-[1080px] mx-auto w-full space-y-2 pb-20">
      {/* Repo Identity Card */}
      <div className="glass p-6" style={stagger(0)}>
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Code2 className="w-4 h-4" style={{ color: "#52525b" }} strokeWidth={1.5} />
              <h2 className="font-mono text-lg font-medium">{repoName || "cms/pc-pricer-legacy"}</h2>
            </div>
            <p className="text-[13px] mb-3" style={{ color: "#71717a" }}>
              Medicare Prospective Payment System — COBOL-based claim pricer for HH PPS and ESRD PPS programs
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "COBOL", cls: "pill-amber" },
                { label: "Fujitsu NetCOBOL", cls: "pill-red" },
                { label: "Healthcare / CMS", cls: "pill-muted" },
                { label: "Production System", cls: "pill-green" },
              ].map((p) => (
                <span key={p.label} className={`${p.cls} px-2.5 py-0.5 rounded-md text-[10px] font-mono`}>
                  {p.label}
                </span>
              ))}
            </div>
          </div>
          <div className="shrink-0">
            <LegacyScoreGauge target={78} start={visible} />
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={stagger(50)}>
        <StatsRow visible={visible} />
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <div className="space-y-2" style={stagger(100)}>
          <OutdatedPatterns />
          <DependencyHealth />
        </div>
        <div className="space-y-2" style={stagger(150)}>
          <CodeAgeChart visible={visible} />
          <HiddenDependencies />
          <MigrationEstimate />
        </div>
      </div>

      {/* CTA Section */}
      <div className="flex flex-col items-center" style={{ marginTop: 32, ...stagger(200) }}>
        <div
          className="glass max-w-[720px] w-full p-5 mb-6"
        >
          <p className="text-[13px] leading-relaxed" style={{ color: "#71717a" }}>
            Analysis complete. This codebase has{" "}
            <strong className="text-foreground font-medium">significant legacy risk</strong> — outdated runtime,{" "}
            <strong className="text-foreground font-medium">zero test coverage</strong>, and{" "}
            <strong className="text-foreground font-medium">critical hidden dependencies</strong>. B.LOC has extracted 5 behavioral requirements that must be preserved during migration.
          </p>
        </div>

        <button
          onClick={handleContinue}
          disabled={building}
          className="btn-primary px-8 py-3 text-[13px] font-medium flex items-center gap-2 disabled:cursor-wait"
        >
          {building ? (
            <>
              <span
                className="w-4 h-4 rounded-full border-[1.5px] border-white/20 border-t-white/60 animate-spin"
                style={{ display: "inline-block" }}
              />
              Preparing requirements...
            </>
          ) : (
            <>
              Continue to Requirements <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </>
          )}
        </button>

        <span className="text-[12px] mt-3 cursor-default" style={{ color: "#52525b" }}>
          Download full report (PDF)
        </span>
      </div>
    </div>
  );
};

export default AnalysisDashboard;

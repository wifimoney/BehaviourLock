import { AlertTriangle } from "lucide-react";

const findings = [
  { severity: "Critical", name: "COBOL-85 Syntax", count: "156 files", desc: "Entire codebase uses 40-year-old COBOL-85 standard. No COBOL-2002+ features." },
  { severity: "Critical", name: "Fujitsu Proprietary APIs", count: "23 calls", desc: "JMPCINT3, COBDUMP, JMPCINT4 — non-portable, vendor-locked runtime calls" },
  { severity: "Critical", name: "No Structured Error Handling", count: "34 locations", desc: "COBOL has no try/catch. Errors propagate silently through WORKING-STORAGE flags." },
  { severity: "High", name: "Flat File I/O", count: "18 operations", desc: "All data access through sequential flat files. No database abstraction layer." },
  { severity: "Moderate", name: "DISPLAY Statement Logging", count: "42 statements", desc: "Debug output via DISPLAY — no structured logging, no log levels, no rotation" },
  { severity: "Moderate", name: "Hardcoded Business Constants", count: "15 values", desc: "Rate factors, fiscal years, thresholds embedded directly in PROCEDURE DIVISION" },
  { severity: "Moderate", name: "Dead Code Blocks", count: "8 paragraphs", desc: "Unreachable PERFORM targets — likely remnants of previous modifications" },
];

const severityColor = (s: string) => {
  if (s === "Critical") return "#fca5a5";
  if (s === "High") return "#fcd34d";
  return "#71717a";
};

const OutdatedPatterns = () => (
  <div className="glass p-5">
    <div className="flex items-center gap-2 mb-1">
      <AlertTriangle className="w-4 h-4" style={{ color: "#fcd34d" }} strokeWidth={1.5} />
      <h3 className="text-[13px] font-medium" style={{ color: "#a1a1aa" }}>Outdated patterns</h3>
    </div>
    <p className="text-[12px] mb-4" style={{ color: "#52525b" }}>Legacy code patterns that require migration</p>
    <div className="space-y-0.5">
      {findings.map((f) => (
        <div
          key={f.name}
          className="group flex items-start gap-3 p-2.5 rounded-md transition-all cursor-default"
          style={{ transitionDuration: "0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: severityColor(f.severity) }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium">{f.name}</span>
              <span className="text-[11px] font-mono" style={{ color: "#52525b" }}>{f.count}</span>
            </div>
            <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "#52525b" }}>{f.desc}</p>
          </div>
          <span className="text-[11px] shrink-0 mt-0.5" style={{ color: severityColor(f.severity) }}>{f.severity}</span>
        </div>
      ))}
    </div>
  </div>
);

export default OutdatedPatterns;

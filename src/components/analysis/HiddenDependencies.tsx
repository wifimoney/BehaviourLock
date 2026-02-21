import { Search } from "lucide-react";

const deps = [
  {
    name: "FISCAL-YEAR Environment Variable",
    desc: "Read silently by ENV-CONFIG.cbl via os.environ / getenv. If unset, all rate calculations default to FY2019. No documentation, no error.",
    affected: ["PPS-CALC/", "CLAIM-PROC/"],
    impact: "Critical — silent data corruption",
    severity: "critical",
    sideEffect: "env_read",
    chain: "process_order → calc_total → load_rates → ENV_READ",
  },
  {
    name: "ROUNDING Mode Implicit Default",
    desc: "WS-ROUNDING-MODE defaults to 'HALF-UP' via VALUE clause. Not configurable at runtime. Changing this changes every financial calculation.",
    affected: ["payment/rounding"],
    impact: "Critical — financial accuracy",
    severity: "critical",
    sideEffect: "env_read",
    chain: "round_payment → get_rounding_mode → ENV_READ",
  },
  {
    name: "Flat File I/O Dependencies",
    desc: "CLAIM-INPUT.cbl uses open(), read(), write() for sequential file access. Upstream JCL SORT step assumed. Records must arrive sorted by date.",
    affected: ["CLAIM-PROC/", "FILE-ACCESS/"],
    impact: "High — silent incorrect output",
    severity: "high",
    sideEffect: "file_io",
    chain: "main_process → read_claims → FILE_IO",
  },
  {
    name: "Cross-Copybook Field Dependencies",
    desc: "WS-CLAIM-RECORD.cpy fields are referenced by 12 different programs. Changing any field cascades across the entire codebase.",
    affected: ["All modules"],
    impact: "High — structural coupling",
    severity: "high",
    sideEffect: "file_io",
    chain: "load_copybook → parse_record → FILE_IO",
  },
  {
    name: "DISPLAY Side Effects for Monitoring",
    desc: "Operations team scrapes DISPLAY output for monitoring alerts. Removing DISPLAY statements breaks production monitoring.",
    affected: ["OUTPUT/"],
    impact: "Medium — ops dependency",
    severity: "medium",
    sideEffect: "file_io",
    chain: "write_output → DISPLAY → FILE_IO",
  },
];

const impactColor = (s: string) => {
  if (s === "critical") return "#fca5a5";
  if (s === "high") return "#fcd34d";
  return "#71717a";
};

const HiddenDependencies = () => (
  <div className="glass p-5">
    <div className="flex items-center gap-2 mb-1">
      <Search className="w-4 h-4" style={{ color: "#fca5a5" }} strokeWidth={1.5} />
      <h3 className="text-[13px] font-medium" style={{ color: "#a1a1aa" }}>Hidden dependencies</h3>
    </div>
    <p className="text-[12px] mb-4" style={{ color: "#52525b" }}>Undocumented behaviors that will break if not preserved</p>
    <div className="space-y-1">
      {deps.map((d) => (
        <div
          key={d.name}
          className="group p-2.5 rounded-md transition-all cursor-default"
          style={{ background: "rgba(255,255,255,0.02)", transitionDuration: "0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
        >
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: impactColor(d.severity) }} />
            <span className="text-[13px] font-medium">{d.name}</span>
            <span className="text-[10px] font-mono ml-auto" style={{ color: "#3f3f46" }}>{d.sideEffect}</span>
          </div>
          <p className="text-[11px] leading-relaxed mb-1 ml-3.5" style={{ color: "#52525b" }}>{d.desc}</p>
          <div className="text-[10px] font-mono ml-3.5 mb-1.5" style={{ color: "#3f3f46" }}>{d.chain}</div>
          <div className="flex items-center gap-2 ml-3.5 flex-wrap">
            {d.affected.map((a) => (
              <span key={a} className="text-[10px] font-mono" style={{ color: "#52525b" }}>{a}</span>
            ))}
            <span className="text-[10px] ml-auto" style={{ color: impactColor(d.severity) }}>{d.impact}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default HiddenDependencies;

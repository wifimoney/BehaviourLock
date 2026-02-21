import { Package } from "lucide-react";

const deps = [
  { name: "Fujitsu NetCOBOL Runtime v10.3", status: "End of support", note: "Last updated: 2018. Vendor recommends migration.", critical: true },
  { name: "COBOL-85 Compiler", status: "Obsolete", note: "Standard ratified 1985. Superseded by COBOL-2002, COBOL-2014.", critical: true },
  { name: "Sequential File System (VSAM-style)", status: "Legacy", note: "Flat file access. Modern alternative: database or object storage.", critical: false },
  { name: "JCL Job Control", status: "Legacy", note: "Batch processing via JCL. Modern alternative: workflow orchestration.", critical: false },
  { name: "EBCDIC Encoding", status: "Compatibility risk", note: "Requires translation layer for modern UTF-8 systems.", critical: false },
];

const statusColor = (s: string) => {
  if (s === "End of support" || s === "Obsolete") return "#fca5a5";
  if (s === "Compatibility risk") return "#fcd34d";
  return "#71717a";
};

const DependencyHealth = () => (
  <div className="glass p-5">
    <div className="flex items-center gap-2 mb-1">
      <Package className="w-4 h-4" style={{ color: "#52525b" }} strokeWidth={1.5} />
      <h3 className="text-[13px] font-medium" style={{ color: "#a1a1aa" }}>Dependency health</h3>
    </div>
    <p className="text-[12px] mb-4" style={{ color: "#52525b" }}>Runtime and system dependencies</p>
    <div className="space-y-1">
      {deps.map((d) => (
        <div
          key={d.name}
          className="p-2.5 rounded-md"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px]" style={{ color: "#a1a1aa" }}>{d.name}</span>
            <span className="text-[10px] shrink-0" style={{ color: statusColor(d.status) }}>{d.status}</span>
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: "#52525b" }}>{d.note}</p>
        </div>
      ))}
    </div>
    <p className="text-[11px] font-mono mt-3" style={{ color: "#fca5a5" }}>
      0 of 5 dependencies are modern · 2 end-of-life · 3 legacy
    </p>
  </div>
);

export default DependencyHealth;

import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";

const bars = [
  { name: "RUNTIME/", year: 2001, age: 25, label: "2001" },
  { name: "PPS-CALC/", year: 2003, age: 23, label: "2003" },
  { name: "COPYBOOKS/", year: 2003, age: 23, label: "2003" },
  { name: "CLAIM-PROC/", year: 2005, age: 21, label: "2005" },
  { name: "OUTPUT/", year: 2007, age: 19, label: "2007" },
  { name: "Last modified", year: 2019, age: 7, label: "2019" },
];

const maxAge = 25;

interface CodeAgeChartProps {
  visible: boolean;
}

const CodeAgeChart = ({ visible }: CodeAgeChartProps) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setAnimate(true), 150);
      return () => clearTimeout(t);
    }
  }, [visible]);

  return (
    <div className="glass p-5">
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="w-4 h-4" style={{ color: "#52525b" }} strokeWidth={1.5} />
        <h3 className="text-[13px] font-medium" style={{ color: "#a1a1aa" }}>Code age</h3>
      </div>
      <p className="text-[12px] mb-4" style={{ color: "#52525b" }}>How old different parts of the codebase are</p>
      <div className="space-y-2.5">
        {bars.map((bar, i) => {
          const isAmber = bar.age < 15;
          const color = isAmber ? "rgba(252,211,77,0.5)" : "rgba(252,165,165,0.4)";
          const widthPct = (bar.age / maxAge) * 100;
          return (
            <div key={bar.name} className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] w-24 shrink-0 text-right" style={{ color: "#52525b" }}>
                {bar.name}
              </span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: animate ? `${widthPct}%` : "0%",
                    background: color,
                    transition: `width 0.8s ease-out ${i * 80}ms`,
                  }}
                />
              </div>
              <span className="font-mono text-[10px] w-8 shrink-0" style={{ color: "#52525b" }}>
                {bar.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] mt-4" style={{ color: "#52525b" }}>
        Oldest code: <span style={{ color: "#fca5a5" }}>25 years</span> · Average age: <span style={{ color: "#fca5a5" }}>22 years</span>
      </p>
    </div>
  );
};

export default CodeAgeChart;

import { useState, useEffect, useRef } from "react";
import { Folder, FileText, Calendar, Settings, FlaskConical, BarChart3 } from "lucide-react";

const useCountUp = (target: number, duration = 600, start = false) => {
  const [value, setValue] = useState(0);
  const ref = useRef<number>();
  useEffect(() => {
    if (!start) return;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 2);
      setValue(Math.round(target * eased));
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [target, duration, start]);
  return value;
};

interface StatsRowProps {
  visible: boolean;
}

const StatsRow = ({ visible }: StatsRowProps) => {
  const files = useCountUp(156, 600, visible);
  const loc = useCountUp(48230, 800, visible);
  const copybooks = useCountUp(34, 600, visible);

  const stats = [
    { icon: Folder, value: files.toString(), label: "Files", sub: "across 6 modules", danger: false },
    { icon: FileText, value: loc.toLocaleString(), label: "Lines of Code", sub: "avg 309 per file", danger: false },
    { icon: Calendar, value: "COBOL-85", label: "Language Standard", sub: "40 years old", danger: true },
    { icon: Settings, value: "Fujitsu", label: "Runtime", sub: "end-of-support", danger: true, smallValue: true },
    { icon: FlaskConical, value: "0%", label: "Test Coverage", sub: "no existing tests", danger: true },
    { icon: BarChart3, value: copybooks.toString(), label: "Functions", sub: "from graph nodes", danger: false },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="glass p-4 text-center"
            style={{
              opacity: visible ? 1 : 0,
              transition: `opacity 0.3s ease ${50 + i * 50}ms`,
            }}
          >
            <Icon className="w-4 h-4 mx-auto mb-2" style={{ color: "#52525b" }} strokeWidth={1.5} />
            <div className={`font-mono font-medium leading-none mb-1 ${stat.smallValue ? "text-base" : "text-xl"}`}>
              {stat.value}
            </div>
            <div className="text-[11px] mt-2" style={{ color: "#52525b" }}>
              {stat.label}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: stat.danger ? "#fca5a5" : "#52525b" }}>
              {stat.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsRow;

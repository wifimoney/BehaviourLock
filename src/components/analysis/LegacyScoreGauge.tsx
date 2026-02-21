import { useState, useEffect, useRef } from "react";

interface LegacyScoreGaugeProps {
  target: number;
  start: boolean;
}

const LegacyScoreGauge = ({ target, start }: LegacyScoreGaugeProps) => {
  const [value, setValue] = useState(0);
  const ref = useRef<number>();

  useEffect(() => {
    if (!start) return;
    const startTime = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [target, start]);

  const pct = value / 100;
  const circumference = 2 * Math.PI * 52;
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[100px] h-[100px] group cursor-default">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="6"
          />
          <circle
            cx="60" cy="60" r="52"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke="#fcd34d"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 0.1s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-medium" style={{ color: "#fcd34d" }}>
            {value}
          </span>
        </div>
        {/* Tooltip */}
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-52 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10" style={{ transitionDuration: "0.15s" }}>
          <div className="glass p-2.5 text-center text-[10px]" style={{ color: "#71717a" }}>
            Scored on: language age, dependency health, pattern obsolescence, runtime risk, test coverage
          </div>
        </div>
      </div>
      <span className="text-[10px] mt-2.5" style={{ color: "#52525b" }}>
        Legacy score
      </span>
      <span className="text-[11px] mt-0.5" style={{ color: "#fcd34d" }}>
        High migration urgency
      </span>
    </div>
  );
};

export default LegacyScoreGauge;

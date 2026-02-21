import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

const scanLines = [
  "Ingesting repository...",
  "Parsing AST and building call graph...",
  "Detecting dead code paths...",
  "Mapping function side effects...",
  "Identifying entrypoints...",
  "Legacy analysis complete",
];

interface AnalysisLoadingProps {
  onComplete: () => void;
}

const AnalysisLoading = ({ onComplete }: AnalysisLoadingProps) => {
  const [visibleLines, setVisibleLines] = useState(0);
  const [completedLine, setCompletedLine] = useState(-1);
  const [collapsing, setCollapsing] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    scanLines.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleLines(i + 1);
          if (i > 0) setCompletedLine(i - 1);
        }, 400 + i * 450)
      );
    });
    const totalTime = 400 + scanLines.length * 450;
    timers.push(setTimeout(() => setCompletedLine(scanLines.length - 1), totalTime + 200));
    timers.push(setTimeout(() => setCollapsing(true), totalTime + 600));
    timers.push(setTimeout(() => onComplete(), totalTime + 900));
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div
      className="flex-1 flex items-center justify-center px-4 py-12"
      style={{
        opacity: collapsing ? 0 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      <div className="glass p-12 max-w-md w-full text-center">
        {/* Code file icon with scan line */}
        <div className="relative w-12 h-16 mx-auto mb-8">
          <div
            className="w-full h-full rounded-md"
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {[22, 34, 46, 58, 70].map((top, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: `${top}%`,
                  left: "20%",
                  width: `${35 + (i % 3) * 10}%`,
                  height: "1px",
                  background: "rgba(255,255,255,0.08)",
                }}
              />
            ))}
            <div
              style={{
                position: "absolute",
                left: "10%",
                width: "80%",
                height: "1px",
                background: "rgba(129,140,248,0.5)",
                boxShadow: "0 0 8px rgba(129,140,248,0.3)",
                animation: "scan-line 1.5s ease-in-out infinite",
              }}
            />
          </div>
        </div>

        {/* Typewriter lines */}
        <div className="text-left space-y-2 font-mono text-[12px] max-w-sm mx-auto">
          {scanLines.map((line, i) => {
            const isLast = i === scanLines.length - 1;
            const isVisible = i < visibleLines;
            const isDimmed = completedLine >= i && !isLast;

            return (
              <div
                key={i}
                className="transition-all"
                style={{
                  opacity: !isVisible ? 0 : isDimmed ? 0.3 : 1,
                  transform: isVisible ? "translateX(0)" : "translateX(-4px)",
                  transitionDuration: "0.2s",
                }}
              >
                {isLast && isVisible ? (
                  <span className="flex items-center gap-1.5" style={{ color: "#6ee7b7" }}>
                    {line}
                    <CheckCircle2
                      className="w-3.5 h-3.5"
                      strokeWidth={1.5}
                      style={{
                        animation: "checkPop 0.3s ease-out forwards",
                      }}
                    />
                  </span>
                ) : (
                  <span style={{ color: "#71717a" }}>{line}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AnalysisLoading;

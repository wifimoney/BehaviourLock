import { useState, useEffect } from "react";
import { FileText, FileCode, Loader2, Check } from "lucide-react";

const cobolLines = [
  { text: "IDENTIFICATION DIVISION.", kw: true },
  { text: "PROGRAM-ID. HH-PPS-PRICER.", kw: false },
  { text: "WORKING-STORAGE SECTION.", kw: true },
  { text: '01 WS-FISCAL-YEAR    PIC 9(4).', kw: false },
  { text: '01 WS-CLAIM-AMOUNT   PIC 9(7)V99.', kw: false },
  { text: "01 WS-ROUNDING-MODE  PIC X(10).", kw: false },
  { text: "PROCEDURE DIVISION.", kw: true },
  { text: "    ACCEPT WS-FISCAL-YEAR FROM", kw: false },
  { text: '        ENVIRONMENT "FISCAL-YEAR"', kw: false },
  { text: "    PERFORM CALCULATE-PPS-PAYMENT", kw: false },
  { text: "    STOP RUN.", kw: true },
];

const pythonLines = [
  { text: "from decimal import Decimal, ROUND_HALF_UP", kw: true },
  { text: "from dataclasses import dataclass", kw: true },
  { text: "import os", kw: true },
  { text: "", kw: false },
  { text: "@dataclass", kw: false },
  { text: "class ClaimRecord:", kw: true },
  { text: "    fiscal_year: int", kw: false },
  { text: "    claim_amount: Decimal", kw: false },
  { text: '    rounding_mode: str = "HALF_UP"', kw: false },
  { text: "", kw: false },
  { text: "class HHPPSPricer:", kw: true },
  { text: "    def __init__(self):", kw: true },
  { text: "        self.fiscal_year = int(", kw: false },
  { text: '            os.environ.get("FISCAL_YEAR", "2019"))', kw: false },
  { text: "", kw: false },
  { text: "    def process(self, claim):", kw: true },
  { text: "        return self._calculate_pps(claim)", kw: true },
];

const progressSteps = [
  "Reading workflow graph for context...",
  "Generating migration patch...",
  "Writing migrated files...",
  "Running flake8 lint gate...",
  "Migration complete",
];

interface Props {
  onComplete: () => void;
}

const MigrationAnimation = ({ onComplete }: Props) => {
  const [fadeIdx, setFadeIdx] = useState(-1);
  const [pyIdx, setPyIdx] = useState(-1);
  const [dotProgress, setDotProgress] = useState(0);
  const [progressStep, setProgressStep] = useState(0);
  const [done, setDone] = useState(false);
  const [collapsing, setCollapsing] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Fade out COBOL lines
    cobolLines.forEach((_, i) => {
      timers.push(setTimeout(() => setFadeIdx(i), 200 + i * 250));
    });

    // Fade in Python lines (starts 150ms after COBOL starts)
    pythonLines.forEach((_, i) => {
      timers.push(setTimeout(() => setPyIdx(i), 350 + i * 200));
    });

    // Dot progress
    const dotInterval = setInterval(() => {
      setDotProgress((p) => Math.min(p + 0.025, 1));
    }, 100);
    timers.push(setTimeout(() => clearInterval(dotInterval), 4000) as any);

    // Progress text
    timers.push(setTimeout(() => setProgressStep(1), 1000));
    timers.push(setTimeout(() => setProgressStep(2), 2000));
    timers.push(setTimeout(() => setProgressStep(3), 3000));
    timers.push(setTimeout(() => { setProgressStep(4); setDone(true); }, 3800));
    timers.push(setTimeout(() => setCollapsing(true), 4200));
    timers.push(setTimeout(() => onComplete(), 4500));

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(dotInterval);
    };
  }, [onComplete]);

  return (
    <div
      className="flex-1 flex items-center justify-center px-6 py-20"
      style={{ opacity: collapsing ? 0 : 1, transition: "opacity 0.3s ease" }}
    >
      <div className="w-full max-w-[640px]">
        <div className="flex gap-6 mb-8 items-stretch">
          {/* Left: COBOL */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />
              <span className="text-[12px] font-medium" style={{ color: "#71717a" }}>Source</span>
            </div>
            <div className="glass p-4 overflow-hidden" style={{ maxHeight: 280 }}>
              <pre className="font-mono text-[12px] leading-[1.7]">
                {cobolLines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.kw ? "#a1a1aa" : "#71717a",
                      opacity: fadeIdx >= i ? 0.15 : 1,
                      transition: "opacity 0.3s ease",
                    }}
                  >
                    {line.text}
                  </div>
                ))}
              </pre>
            </div>
          </div>

          {/* Center line with dot */}
          <div className="relative flex-shrink-0" style={{ width: 1 }}>
            <div
              className="absolute inset-0"
              style={{ background: "rgba(255,255,255,0.06)" }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
              style={{
                background: "#818cf8",
                top: `${dotProgress * 100}%`,
                transition: "top 0.1s linear",
              }}
            />
          </div>

          {/* Right: Python */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-2">
              <FileCode className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />
              <span className="text-[12px] font-medium" style={{ color: "#71717a" }}>Target</span>
            </div>
            <div className="glass p-4 overflow-hidden" style={{ maxHeight: 280 }}>
              <pre className="font-mono text-[12px] leading-[1.7]">
                {pythonLines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.kw ? "#a1a1aa" : "#71717a",
                      opacity: pyIdx >= i ? 1 : 0,
                      transition: "opacity 0.3s ease",
                    }}
                  >
                    {line.text || "\u00A0"}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>

        {/* Progress text */}
        <div className="flex items-center justify-center gap-2 text-[13px]" style={{ color: done ? "#a1a1aa" : "#71717a" }}>
          {done ? (
            <Check className="w-3.5 h-3.5" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#71717a" }} strokeWidth={1.5} />
          )}
          <span>{progressSteps[progressStep]}</span>
        </div>
      </div>
    </div>
  );
};

export default MigrationAnimation;

import { useState } from "react";

const stages = ["Upload", "Analysis", "Requirements", "Migration", "Review"];

interface StageIndicatorProps {
  currentStage: number;
  onStageClick?: (stage: number) => void;
}

const StageIndicator = ({ currentStage, onStageClick }: StageIndicatorProps) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div className="flex items-center justify-center gap-0 py-4 px-4">
      {stages.map((stage, i) => {
        const stageNum = i + 1;
        const isActive = stageNum === currentStage;
        const isCompleted = stageNum < currentStage;
        const isClickable = isCompleted || isActive;
        const showLabel = isActive || hoveredIdx === i;

        return (
          <div
            key={stage}
            className="flex items-center"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div
              className="flex flex-col items-center relative"
              style={{ minWidth: 24, cursor: isClickable ? "pointer" : "default" }}
              onClick={() => isClickable && onStageClick?.(stageNum)}
            >
              {/* Dot */}
              <div
                className="rounded-full transition-all"
                style={{
                  width: 6,
                  height: 6,
                  background: isCompleted
                    ? "#6ee7b7"
                    : isActive
                    ? "#818cf8"
                    : "#3f3f46",
                  boxShadow: isActive
                    ? "0 0 0 3px rgba(129,140,248,0.15)"
                    : "none",
                  transitionDuration: "0.15s",
                }}
              />
              {/* Label */}
              <span
                className="absolute top-4 whitespace-nowrap text-[11px] transition-opacity"
                style={{
                  color: isActive ? "#a1a1aa" : "#71717a",
                  opacity: showLabel ? 1 : 0,
                  transitionDuration: "0.15s",
                }}
              >
                {stage}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                className="mx-3"
                style={{
                  width: 24,
                  height: 1,
                  background: isCompleted
                    ? "rgba(110,231,183,0.2)"
                    : "rgba(255,255,255,0.06)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StageIndicator;

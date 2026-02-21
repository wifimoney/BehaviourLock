import { useState, useEffect, useCallback } from "react";
import { ArrowRight, Lock, Download } from "lucide-react";
import AgentPipeline from "./AgentPipeline";
import TaskBoard from "./TaskBoard";
import RequirementsPanelV2 from "./RequirementsPanelV2";

interface CollaborationScreenProps {
  onProceed: () => void;
}

interface ToastItem {
  id: number;
  msg: string;
  duration: number;
  created: number;
}

const CollaborationScreen = ({ onProceed }: CollaborationScreenProps) => {
  const [hoveredTaskReqs, setHoveredTaskReqs] = useState<string[] | null>(null);
  const [hoveredReq, setHoveredReq] = useState<string | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const addToast = useCallback((msg: string, duration = 4000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, duration, created: Date.now() }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const handleClickLinkedTask = (taskId: number) => {
    setHighlightTaskId(taskId);
    const el = document.getElementById(`task-${taskId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightTaskId(null), 1500);
  };

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Toast notifications */}
      <div className="fixed top-20 right-4 z-50 space-y-2" style={{ width: "320px" }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="animate-slide-in-right"
            style={{
              padding: "12px 20px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.06)",
              border: toast.msg.includes("👤") ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(24px) saturate(1.4)",
              color: "#e2e8f0",
              fontSize: "12px",
              boxShadow: toast.msg.includes("👤") ? "0 0 20px rgba(245,158,11,0.1), 0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            {toast.msg}
            <div className="mt-2 h-[2px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  background: "rgba(167,139,250,0.5)",
                  animation: `shrinkBar ${toast.duration}ms linear forwards`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden px-3 gap-0">
        {/* Left — Agent Pipeline */}
        <div className="w-[20%] min-w-[220px] flex flex-col min-h-0 py-3 pr-2 max-lg:hidden">
          <AgentPipeline onToast={addToast} />
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px self-stretch my-3" style={{ background: "rgba(255,255,255,0.04)" }} />

        {/* Center — Task Board */}
        <div className="flex-1 lg:w-[50%] flex flex-col min-h-0 py-3 px-3">
          <TaskBoard hoveredReq={hoveredReq} onHoverTask={setHoveredTaskReqs} highlightTaskId={highlightTaskId} />
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px self-stretch my-3" style={{ background: "rgba(255,255,255,0.04)" }} />

        {/* Right — Requirements */}
        <div className="w-[30%] min-w-[260px] flex flex-col min-h-0 py-3 pl-2 max-lg:hidden">
          <RequirementsPanelV2 hoveredTaskReqs={hoveredTaskReqs} onHoverReq={setHoveredReq} onClickLinkedTask={handleClickLinkedTask} />
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        className="sticky bottom-0 flex items-center justify-between flex-wrap gap-3 px-7 py-3.5"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(24px)",
          background: "rgba(2,6,23,0.85)",
        }}
      >
        {/* Left stats */}
        <div className="font-mono text-[12px] flex items-center gap-1 flex-wrap" style={{ color: "#64748b" }}>
          <span style={{ color: "#34d399" }}>8</span> ready ·{" "}
          <span style={{ color: "#fbbf24" }}>3</span> need review ·{" "}
          <span style={{ color: "#f87171" }}>1</span> blocked ·{" "}
          <span style={{ color: "#a78bfa" }}>2</span> suggested |{" "}
          4 of 6 requirements verified
        </div>

        {/* Center pipeline dots */}
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "#64748b" }}>
          <span>Agent Pipeline:</span>
          <div className="flex gap-1">
            {["#34d399", "#a78bfa", "#fbbf24", "#64748b", "#64748b"].map((c, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  background: c,
                  animation: i === 1 ? "pulse-glow 1.5s ease-in-out infinite" : "none",
                }}
              />
            ))}
          </div>
          <span style={{ color: "#fbbf24" }}>Writer Agent active</span>
        </div>

        {/* Right buttons */}
        <div className="flex items-center gap-3">
          <button className="text-[12px] px-4 py-2 rounded-xl transition-all" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#64748b" }}>
            <Download className="w-3.5 h-3.5 inline mr-1.5" />Export Plan
          </button>
          <button
            onClick={onProceed}
            className="text-[13px] px-7 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all"
            style={{
              background: "linear-gradient(135deg, #a78bfa, #6366f1)",
              color: "white",
              opacity: 0.7,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            title="1 critical item awaiting your approval — you can still proceed"
          >
            <Lock className="w-3.5 h-3.5" /> Proceed to Migration <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CollaborationScreen;

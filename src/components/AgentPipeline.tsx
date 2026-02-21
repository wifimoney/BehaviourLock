import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface AgentPipelineProps {
  onToast: (msg: string, duration?: number) => void;
}

interface AgentState {
  status: "complete" | "active" | "queued";
  progress?: number;
}

const AgentPipeline = ({ onToast }: AgentPipelineProps) => {
  const [agents, setAgents] = useState<AgentState[]>([
    { status: "complete" },
    { status: "active", progress: 0 },
    { status: "queued" },
    { status: "queued" },
    { status: "queued" } as AgentState,
  ]);
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);
  const [typedText, setTypedText] = useState("");
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const writerFullText =
    "The HH-PPS-PRICER module calculates Home Health Prospective Payment System amounts based on claim type, service dates, and applicable rate tables. The pricer reads fiscal year configuration from the FISCAL-YEAR environment variable to determine which rate table set to apply. Critical dependency: rate tables are loaded from sequential flat files...";

  // Typewriter for writer agent
  useEffect(() => {
    if (agents[1].status === "active") {
      let i = 0;
      typingRef.current = setInterval(() => {
        i++;
        setTypedText(writerFullText.slice(0, i));
        if (i >= writerFullText.length && typingRef.current) clearInterval(typingRef.current);
      }, 30);
      return () => { if (typingRef.current) clearInterval(typingRef.current); };
    }
  }, [agents[1].status]);

  // Progress bar animation for writer
  useEffect(() => {
    if (agents[1].status === "active") {
      const dur = 7500;
      const start = Date.now();
      const frame = () => {
        const elapsed = Date.now() - start;
        const p = Math.min(elapsed / dur * 65, 65);
        setAgents(prev => {
          const next = [...prev];
          next[1] = { ...next[1], progress: p };
          return next;
        });
        if (elapsed < dur) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
  }, []);

  // Auto-progression demo
  useEffect(() => {
    const t1 = setTimeout(() => {
      setAgents(prev => {
        const next = [...prev];
        next[1] = { status: "complete", progress: 100 };
        next[2] = { status: "active" };
        return next;
      });
      onToast("🧠 QA Agent is reviewing business logic...");
    }, 8000);

    const t2 = setTimeout(() => {
      setAgents(prev => {
        const next = [...prev];
        next[2] = { status: "complete" };
        next[3] = { status: "active" };
        return next;
      });
      onToast("🧠 QA Agent flagged 4 items — 2 require your decision");
    }, 14000);

    const t3 = setTimeout(() => {
      setAgents(prev => {
        const next = [...prev];
        next[3] = { status: "complete" };
        next[4] = { status: "active" };
        return next;
      });
      onToast("✅ Proofreader finished — all documentation verified");
    }, 19000);

    const t4 = setTimeout(() => {
      onToast("👤 3 items ready for your review", 6000);
    }, 20000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onToast]);

  const agentDefs = [
    {
      name: "Scanner Agent",
      emoji: "🔍",
      color: "#22d3ee",
      desc: "Reads code, extracts functions, classes, params, return types, side effects, business logic hints",
      outputPills: ["156 files", "34 copybooks", "87 paragraphs", "23 side effects", "5 runtime deps"],
      expandText:
        'Found: HH-PPS-PRICER.cbl → 12 paragraphs, 6 side effects (file I/O, DB calls). FUJITSU-BRIDGE.cbl → 23 runtime API calls flagged. ENV-CONFIG.cbl → hidden FISCAL-YEAR dependency detected.',
      timestamp: "Completed 2m ago",
    },
    {
      name: "Writer Agent",
      emoji: "✍️",
      color: "#a78bfa",
      desc: "Drafting documentation for payment/rounding logic...",
      timestamp: "Started 45s ago",
    },
    {
      name: "QA & Biz Logic Agent",
      emoji: "🧠",
      color: "#fbbf24",
      desc: "Reviews draft, verifies business logic accuracy, checks for gaps, adds context the writer missed",
      timestamp: "Waiting...",
    },
    {
      name: "Proofreader Agent",
      emoji: "✅",
      color: "#34d399",
      desc: "Final polish — consistency, tone, formatting, removes hallucinations, tightens language",
      timestamp: "Waiting...",
    },
    {
      name: "Human Review",
      emoji: "👤",
      color: "#f59e0b",
      desc: "Review, approve, or send back with comments. Nothing merges without your sign-off.",
      timestamp: "Waiting for agents...",
      isHuman: true,
    },
  ];

  const getStatusBadge = (status: string, isHuman?: boolean) => {
    if (status === "complete")
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
          Complete ✓
        </span>
      );
    if (status === "active" && isHuman)
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium animate-pulse" style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(245,158,11,0.15))", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.2)" }}>
          Ready for your review
        </span>
      );
    if (status === "active")
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)", animation: "pulse-glow 1.5s ease-in-out infinite" }}>
          In Progress
        </span>
      );
    if (isHuman)
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(255,255,255,0.06)", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)", animation: "pulse-glow 2s ease-in-out infinite" }}>
          Waiting for agents...
        </span>
      );
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(255,255,255,0.06)", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }}>
        Queued
      </span>
    );
  };

  const getTimestamp = (i: number) => {
    const a = agents[i];
    if (a.status === "complete") return "Completed";
    if (a.status === "active") return agentDefs[i].isHuman ? "Ready now" : "In progress...";
    return "Waiting...";
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="font-mono text-[11px] uppercase tracking-[2px] mb-4" style={{ color: "#64748b" }}>
        Agent Pipeline
      </h3>

      <div className="flex-1 overflow-y-auto space-y-0 pr-1 min-h-0">
        {agentDefs.map((agent, i) => {
          const state = agents[i];
          const isExp = expandedAgent === i;
          const isHuman = agent.isHuman;
          const opacity = state.status === "queued" ? (isHuman ? 0.55 : 0.45) : 1;

          // Flowing line between agents
          const showLine = i < agentDefs.length - 1;
          const lineActive = state.status === "complete" && agents[i + 1]?.status === "active";
          const lineDone = state.status === "complete" && agents[i + 1]?.status === "complete";

          return (
            <div key={i}>
              <div
                className="relative transition-all duration-500"
                style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderLeft: `3px solid ${agent.color}`,
                  opacity,
                  backdropFilter: "blur(24px) saturate(1.4)",
                  WebkitBackdropFilter: "blur(24px) saturate(1.4)",
                  boxShadow: state.status === "active"
                    ? `0 0 12px ${agent.color}33, 0 8px 32px rgba(0,0,0,0.3)`
                    : isHuman
                    ? "0 0 20px rgba(245,158,11,0.12), inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.3)"
                    : "0 8px 32px rgba(0,0,0,0.3)",
                }}
              >
                {/* Top row */}
                <div className="flex items-center gap-2.5">
                  <div
                    className="shrink-0 rounded-full flex items-center justify-center text-sm"
                    style={{
                      width: isHuman ? 36 : 32,
                      height: isHuman ? 36 : 32,
                      background: `${agent.color}33`,
                    }}
                  >
                    {agent.emoji}
                  </div>
                  <span className={`font-semibold truncate ${isHuman ? "text-[14px]" : "text-[13px]"}`} style={{ color: "#e2e8f0" }}>
                    {agent.name}
                  </span>
                  {isHuman && state.status === "active" && (
                    <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#ef4444", color: "white" }}>
                      3
                    </span>
                  )}
                  <div className="ml-auto shrink-0">{getStatusBadge(state.status, isHuman)}</div>
                </div>

                {/* Description */}
                <p className={`mt-2 leading-relaxed ${isHuman ? "text-[12px] text-white/80" : "text-[11px]"}`} style={!isHuman ? { color: "#64748b" } : {}}>
                  {agent.desc}
                  {isHuman && " 🔒"}
                </p>

                {/* Scanner output pills */}
                {i === 0 && agent.outputPills && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {agent.outputPills.map((p) => (
                      <span key={p} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${agent.color}15`, color: `${agent.color}cc`, border: `1px solid ${agent.color}22` }}>
                        {p}
                      </span>
                    ))}
                  </div>
                )}

                {/* Scanner expandable */}
                {i === 0 && agent.expandText && (
                  <button
                    className="text-[10px] mt-2 flex items-center gap-1 transition-colors"
                    style={{ color: "#64748b" }}
                    onClick={() => setExpandedAgent(isExp ? null : i)}
                  >
                    {isExp ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    View output
                  </button>
                )}
                {i === 0 && isExp && (
                  <div className="mt-2 p-2 rounded-lg text-[10px] font-mono leading-relaxed overflow-auto max-h-20" style={{ background: "rgba(0,0,0,0.3)", color: "#94a3b8" }}>
                    {agent.expandText}
                  </div>
                )}

                {/* Writer progress bar + live text */}
                {i === 1 && state.status === "active" && (
                  <>
                    <div className="mt-2 w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${state.progress || 0}%`,
                          background: "linear-gradient(90deg, #a78bfa, #8b5cf6)",
                        }}
                      />
                    </div>
                    <div className="mt-2 p-2 rounded-lg text-[10px] font-mono leading-relaxed overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", color: "#94a3b8", maxHeight: "60px" }}>
                      {typedText}
                      <span className="animate-pulse">▊</span>
                    </div>
                  </>
                )}
                {i === 1 && state.status === "complete" && (
                  <div className="mt-2 w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="h-full rounded-full" style={{ width: "100%", background: "linear-gradient(90deg, #a78bfa, #8b5cf6)" }} />
                  </div>
                )}

                {/* Timestamp */}
                <p className="mt-2 text-[10px]" style={{ color: "#475569" }}>{getTimestamp(i)}</p>
              </div>

              {/* Connecting line */}
              {showLine && (
                <div className="flex justify-center py-0.5">
                  <div className="relative w-px h-6" style={{ background: lineDone ? "rgba(255,255,255,0.08)" : lineActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)" }}>
                    {lineActive && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full"
                        style={{
                          background: agentDefs[i + 1].color,
                          boxShadow: `0 0 6px ${agentDefs[i + 1].color}`,
                          animation: "flowDot 3s linear infinite",
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgentPipeline;

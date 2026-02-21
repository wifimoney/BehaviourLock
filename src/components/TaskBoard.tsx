import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, ArrowUp } from "lucide-react";

type TaskStatus = "Ready" | "Needs Review" | "Blocked" | "Suggested" | "Approved" | "Revising" | "Rejected";

interface ThreadMsg {
  agent: string;
  color: string;
  emoji: string;
  text: string;
  time: string;
  isSystem?: boolean;
  isAwait?: boolean;
  isUser?: boolean;
}

interface Task {
  id: number;
  icon: string;
  title: string;
  topColor: string;
  impact: string;
  impactColor: string;
  impactPulse?: boolean;
  agentName: string;
  agentColor: string;
  status: TaskStatus;
  comments: number;
  unread?: boolean;
  description?: string;
  code?: string;
  tags?: string[];
  thread?: ThreadMsg[];
  linkedReqs?: string[];
}

const initialTasks: Task[] = [
  { id: 1, icon: "🔧", title: 'Fix print statements → print()', topColor: "#34d399", impact: "Low", impactColor: "#34d399", agentName: "Scanner", agentColor: "#22d3ee", status: "Ready", comments: 2, linkedReqs: ["R5"] },
  { id: 2, icon: "🔧", title: "Replace dict.iteritems() → .items()", topColor: "#34d399", impact: "Low", impactColor: "#34d399", agentName: "Scanner", agentColor: "#22d3ee", status: "Ready", comments: 1, linkedReqs: ["R5"] },
  { id: 3, icon: "🔧", title: "Update exception syntax", topColor: "#34d399", impact: "Low", impactColor: "#34d399", agentName: "Scanner", agentColor: "#22d3ee", status: "Ready", comments: 0 },
  {
    id: 4, icon: "⚠️", title: "Migrate payment rounding logic", topColor: "#fbbf24", impact: "CRITICAL", impactColor: "#f87171", impactPulse: true,
    agentName: "QA", agentColor: "#fbbf24", status: "Needs Review", comments: 5, unread: true,
    description: 'The round_payment() function defaults to ROUND_HALF_UP in Python 2. The Py3 migration changes this to ROUND_HALF_EVEN. This affects all payment calculations at .5 boundary values. Estimated financial impact: non-trivial in production environments with high transaction volume.',
    code: `# Legacy (Py2): ROUND_HALF_UP\nd.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)\n# Migrated (Py3): ROUND_HALF_EVEN ← behavioral change!\nd.quantize(Decimal('0.01'), rounding=ROUND_HALF_EVEN)`,
    tags: ["financial", "critical-path", "env-dependency"],
    linkedReqs: ["R6", "R1"],
    thread: [
      { agent: "Scanner Agent", color: "#22d3ee", emoji: "🔍", time: "4 min ago", text: "Detected rounding behavior change in payment/rounding.py line 34. ROUND_HALF_UP → ROUND_HALF_EVEN. This is a side-effect-bearing function called by process_order() and calc_total(). 14 downstream functions affected." },
      { agent: "QA Agent", color: "#fbbf24", emoji: "🧠", time: "3 min ago", text: "Flagging as CRITICAL. Banker's rounding (HALF_EVEN) is the IEEE 754 standard, but the legacy system explicitly uses HALF_UP. Changing this silently would alter every financial calculation at .5 boundary values. Recommend: keep HALF_UP as default, add HALF_EVEN as opt-in config parameter." },
      { agent: "Writer Agent", color: "#a78bfa", emoji: "✍️", time: "2 min ago", text: "Updated documentation draft. Added migration warning in README: 'ROUNDING env var must be explicitly set during migration to preserve legacy behavior. Default changed from HALF_UP to HALF_EVEN in Python 3 decimal module.'" },
      { agent: "Proofreader Agent", color: "#34d399", emoji: "✅", time: "1 min ago", text: "Verified documentation accuracy. Suggested adding a pre-migration checklist item for ops teams: 'Confirm ROUNDING=HALF_UP is set in all production environment configs before deploying migrated payment module.'" },
      { agent: "", color: "", emoji: "", time: "", text: "⏳ Awaiting human review. This task requires your decision before migration can proceed.", isAwait: true },
    ],
  },
  { id: 5, icon: "🔧", title: "Update unicode string literals", topColor: "#34d399", impact: "Low", impactColor: "#34d399", agentName: "Scanner", agentColor: "#22d3ee", status: "Ready", comments: 0, linkedReqs: ["R3"] },
  { id: 6, icon: "⚠️", title: "Refactor DB query error handling", topColor: "#fbbf24", impact: "Medium", impactColor: "#fbbf24", agentName: "QA", agentColor: "#fbbf24", status: "Needs Review", comments: 3, linkedReqs: ["R1", "R2"] },
  { id: 7, icon: "🔧", title: "Integer division → floor division", topColor: "#34d399", impact: "Medium", impactColor: "#fbbf24", agentName: "Scanner", agentColor: "#22d3ee", status: "Ready", comments: 1, linkedReqs: ["R1", "R2"] },
  { id: 8, icon: "🧠", title: "Add input validation for negative amounts", topColor: "#a78bfa", impact: "Medium", impactColor: "#fbbf24", agentName: "QA", agentColor: "#fbbf24", status: "Suggested", comments: 1 },
  { id: 9, icon: "🔧", title: "Remove deprecated imports", topColor: "#34d399", impact: "Low", impactColor: "#34d399", agentName: "Proofreader", agentColor: "#34d399", status: "Ready", comments: 0 },
  { id: 10, icon: "⚠️", title: "Document ENV dependency for ROUNDING config", topColor: "#fbbf24", impact: "High", impactColor: "#fb923c", agentName: "QA", agentColor: "#fbbf24", status: "Needs Review", comments: 4, linkedReqs: ["R6"] },
  { id: 11, icon: "🚫", title: "Replace Fujitsu NetCOBOL runtime dependencies", topColor: "#f87171", impact: "CRITICAL", impactColor: "#f87171", impactPulse: true, agentName: "Scanner", agentColor: "#22d3ee", status: "Blocked", comments: 6, unread: true, linkedReqs: ["R5"] },
  { id: 12, icon: "🔧", title: "Convert COBOL DISPLAY → structured logging", topColor: "#34d399", impact: "Low", impactColor: "#34d399", agentName: "Scanner", agentColor: "#22d3ee", status: "Ready", comments: 0 },
  { id: 13, icon: "🔧", title: "Convert flat file I/O to modern data access", topColor: "#34d399", impact: "High", impactColor: "#fb923c", agentName: "Scanner", agentColor: "#22d3ee", status: "Ready", comments: 2 },
  { id: 14, icon: "⚠️", title: "Verify 30-day vs 60-day claim processing logic", topColor: "#fbbf24", impact: "High", impactColor: "#fb923c", agentName: "QA", agentColor: "#fbbf24", status: "Needs Review", comments: 5, linkedReqs: ["R3"] },
];

const statusColorMap: Record<string, string> = {
  Ready: "#34d399",
  "Needs Review": "#fbbf24",
  Blocked: "#f87171",
  Suggested: "#a78bfa",
  Approved: "#34d399",
  "Revising": "#a78bfa",
  "Rejected": "#f87171",
};

const filters = [
  { label: "All", count: 14 },
  { label: "Needs Review", count: 4 },
  { label: "Ready", count: 8 },
  { label: "Blocked", count: 1 },
  { label: "Suggested", count: 1 },
];

interface TaskBoardProps {
  hoveredReq: string | null;
  onHoverTask: (reqIds: string[] | null) => void;
  highlightTaskId: number | null;
}

const TaskBoard = ({ hoveredReq, onHoverTask, highlightTaskId }: TaskBoardProps) => {
  const [tasks, setTasks] = useState(initialTasks);
  const [expandedId, setExpandedId] = useState<number>(4);
  const [activeFilter, setActiveFilter] = useState("All");
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [included, setIncluded] = useState<Record<number, boolean>>(Object.fromEntries(initialTasks.map(t => [t.id, true])));
  const threadEndRef = useRef<HTMLDivElement>(null);

  const toggleExpand = (id: number) => setExpandedId(prev => prev === id ? -1 : id);

  const filteredTasks = activeFilter === "All" ? tasks : tasks.filter(t => t.status === activeFilter);

  const addUserMessage = (taskId: number, text: string) => {
    if (!text.trim()) return;
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const newThread = [...(t.thread || [])];
      // Remove awaiting message if present
      const awaitIdx = newThread.findIndex(m => m.isAwait);
      if (awaitIdx >= 0) newThread.splice(awaitIdx, 1);
      newThread.push({ agent: "You", color: "#60a5fa", emoji: "👤", time: "just now", text, isUser: true });
      return { ...t, thread: newThread, comments: t.comments + 1 };
    }));
    setCommentInputs(prev => ({ ...prev, [taskId]: "" }));
    setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const approveTask = (taskId: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const newThread = [...(t.thread || [])];
      const awaitIdx = newThread.findIndex(m => m.isAwait);
      if (awaitIdx >= 0) newThread.splice(awaitIdx, 1);
      newThread.push({ agent: "", color: "", emoji: "", time: "", text: "✅ Approved by human reviewer", isSystem: true });
      return { ...t, status: "Approved" as TaskStatus, topColor: "#34d399", impactPulse: false, unread: false, thread: newThread };
    }));
  };

  const requestChanges = (taskId: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const newThread = [...(t.thread || [])];
      const awaitIdx = newThread.findIndex(m => m.isAwait);
      if (awaitIdx >= 0) newThread.splice(awaitIdx, 1);
      newThread.push({ agent: "", color: "", emoji: "", time: "", text: "🔄 Changes requested — agents will revise", isSystem: true });
      return { ...t, status: "Revising" as TaskStatus, topColor: "#a78bfa", thread: newThread };
    }));
  };

  const rejectTask = (taskId: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const newThread = [...(t.thread || [])];
      const awaitIdx = newThread.findIndex(m => m.isAwait);
      if (awaitIdx >= 0) newThread.splice(awaitIdx, 1);
      newThread.push({ agent: "", color: "", emoji: "", time: "", text: "❌ Rejected by human reviewer", isSystem: true });
      return { ...t, status: "Rejected" as TaskStatus, topColor: "#f87171", thread: newThread };
    }));
  };

  const isHighlighted = (task: Task) => {
    if (highlightTaskId === task.id) return true;
    return hoveredReq && task.linkedReqs?.includes(hoveredReq);
  };

  // Agent avatar colors
  const agentAvatars = (t: Task) => {
    const colors = [t.agentColor];
    if (t.comments > 1) colors.push("#a78bfa");
    if (t.comments > 3) colors.push("#34d399");
    return colors.slice(0, 3);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h3 className="font-mono text-[13px] font-bold" style={{ color: "#e2e8f0" }}>MIGRATION TASKS</h3>
        <span className="text-[11px] px-2 py-0.5 rounded-full font-mono" style={{ background: "rgba(255,255,255,0.06)", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }}>
          ({tasks.length} tasks)
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {filters.map(f => (
          <button
            key={f.label}
            onClick={() => setActiveFilter(f.label)}
            className="text-[11px] px-3 py-1 rounded-full transition-all duration-200"
            style={{
              background: activeFilter === f.label ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.03)",
              color: activeFilter === f.label ? "#a78bfa" : "#64748b",
              border: `1px solid ${activeFilter === f.label ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            {f.label} <span className="opacity-60">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0" style={{ maskImage: "linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 8px), transparent 100%)" }}>
        {filteredTasks.map(task => {
          const isExp = expandedId === task.id;
          const highlighted = isHighlighted(task);
          const sColor = statusColorMap[task.status] || "#64748b";

          return (
            <div
              key={task.id}
              id={`task-${task.id}`}
              className="transition-all duration-300"
              style={{
                borderRadius: "14px",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${highlighted ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.06)"}`,
                backdropFilter: "blur(24px) saturate(1.4)",
                boxShadow: highlighted ? "0 0 16px rgba(167,139,250,0.15), 0 8px 32px rgba(0,0,0,0.3)" : "0 8px 32px rgba(0,0,0,0.3)",
                opacity: included[task.id] !== false ? 1 : 0.4,
              }}
              onMouseEnter={() => onHoverTask(task.linkedReqs || null)}
              onMouseLeave={() => onHoverTask(null)}
            >
              {/* Top color bar */}
              <div className="h-[3px] rounded-t-[14px]" style={{ background: task.topColor }} />

              {/* Collapsed content */}
              <div className="px-4 py-3 cursor-pointer" onClick={() => toggleExpand(task.id)}>
                <div className="flex items-center gap-2">
                  {isExp ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: "#64748b" }} /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "#64748b" }} />}
                  <span className="text-sm shrink-0">{task.icon}</span>
                  <span className="text-[13px] font-semibold truncate flex-1" style={{ color: "#e2e8f0" }}>{task.title}</span>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{
                      color: task.impactColor,
                      background: `${task.impactColor}15`,
                      border: `1px solid ${task.impactColor}22`,
                      animation: task.impactPulse ? "pulse-critical 2.5s ease-in-out infinite" : "none",
                    }}
                  >
                    {task.impact}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0" style={{ color: task.agentColor, background: `${task.agentColor}15`, border: `1px solid ${task.agentColor}22` }}>
                    {task.agentName}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 pl-7">
                  <span className="text-[11px] font-medium" style={{ color: sColor }}>{task.status}</span>
                  {task.comments > 0 && (
                    <span className="text-[11px] flex items-center gap-1" style={{ color: "#64748b" }}>
                      💬 {task.comments}
                      {task.unread && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#ef4444" }} />}
                    </span>
                  )}
                  <div className="flex items-center ml-auto -space-x-2">
                    {agentAvatars(task).map((c, i) => (
                      <div key={i} className="w-5 h-5 rounded-full border" style={{ background: `${c}33`, borderColor: `${c}44` }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Expanded */}
              {isExp && (
                <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  {task.description && (
                    <p className="text-[13px] leading-relaxed mt-3" style={{ color: "#cbd5e1" }}>{task.description}</p>
                  )}
                  {task.code && (
                    <pre className="text-[11px] font-mono p-3 rounded-lg leading-relaxed overflow-x-auto" style={{ background: "rgba(0,0,0,0.4)", color: "#94a3b8", borderRadius: "10px" }}>
                      {task.code}
                    </pre>
                  )}
                  {task.tags && (
                    <div className="flex flex-wrap gap-1.5">
                      {task.tags.map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div
                        className={`toggle-track ${included[task.id] !== false ? "active" : ""}`}
                        onClick={(e) => { e.stopPropagation(); setIncluded(p => ({ ...p, [task.id]: !(p[task.id] !== false) })); }}
                      >
                        <div className="toggle-knob" />
                      </div>
                      <span className="text-[11px]" style={{ color: "#64748b" }}>Include</span>
                    </div>
                  </div>

                  {/* Thread */}
                  {task.thread && (
                    <div className="mt-3 rounded-[14px] p-4 space-y-2" style={{ background: "rgba(0,0,0,0.15)" }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[12px] font-semibold" style={{ color: "#e2e8f0" }}>Discussion</span>
                        <span className="text-[10px]" style={{ color: "#64748b" }}>{task.thread.length} messages</span>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {task.thread.map((msg, mi) => {
                          if (msg.isSystem) {
                            return (
                              <p key={mi} className="text-center text-[11px] italic py-1" style={{ color: msg.text.includes("✅") ? "#34d399" : msg.text.includes("🔄") ? "#fbbf24" : "#f87171" }}>
                                {msg.text}
                              </p>
                            );
                          }
                          if (msg.isAwait) {
                            return <p key={mi} className="text-center text-[11px] italic py-1" style={{ color: "#64748b" }}>{msg.text}</p>;
                          }
                          return (
                            <div key={mi} className="flex gap-2 p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", borderLeft: `2px solid ${msg.color}` }}>
                              <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px]" style={{ background: `${msg.color}33` }}>
                                {msg.emoji}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] font-bold" style={{ color: msg.color }}>{msg.agent}</span>
                                  <span className="text-[10px]" style={{ color: "#475569" }}>· {msg.time}</span>
                                </div>
                                <p className="text-[12px] leading-relaxed mt-0.5" style={{ color: "#cbd5e1" }}>{msg.text}</p>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={threadEndRef} />
                      </div>

                      {/* Input */}
                      <div className="relative mt-3">
                        <input
                          className="w-full text-[12px] py-2.5 px-4 pr-10 rounded-xl outline-none transition-all duration-200"
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            color: "#e2e8f0",
                          }}
                          placeholder="Add a comment or decision..."
                          value={commentInputs[task.id] || ""}
                          onChange={e => setCommentInputs(p => ({ ...p, [task.id]: e.target.value }))}
                          onKeyDown={e => e.key === "Enter" && addUserMessage(task.id, commentInputs[task.id] || "")}
                          onFocus={e => { e.target.style.borderColor = "rgba(167,139,250,0.4)"; }}
                          onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; }}
                        />
                        <button
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                          style={{ background: "#a78bfa" }}
                          onClick={() => addUserMessage(task.id, commentInputs[task.id] || "")}
                        >
                          <ArrowUp className="w-3.5 h-3.5" style={{ color: "white" }} />
                        </button>
                      </div>

                      {/* Quick actions */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <button onClick={() => approveTask(task.id)} className="text-[10px] px-3 py-1 rounded-full transition-all hover:border-green-400/40" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#34d399" }}>
                          ✅ Approve
                        </button>
                        <button onClick={() => requestChanges(task.id)} className="text-[10px] px-3 py-1 rounded-full transition-all" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#fbbf24" }}>
                          🔄 Request Changes
                        </button>
                        <button onClick={() => rejectTask(task.id)} className="text-[10px] px-3 py-1 rounded-full transition-all" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#f87171" }}>
                          ❌ Reject
                        </button>
                        <button className="text-[10px] px-3 py-1 rounded-full transition-all" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b" }}>
                          📌 Pin
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TaskBoard;

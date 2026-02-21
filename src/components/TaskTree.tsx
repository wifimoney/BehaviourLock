import { useState } from "react";
import { GripVertical, ChevronRight, ChevronDown, Check, MessageSquare, X } from "lucide-react";

interface Task {
  id: string;
  icon: string;
  title: string;
  status: "Ready" | "Needs Review" | "Suggested";
  impact: "Low" | "Medium" | "CRITICAL";
  est: string;
  detail?: string;
  actionLabel: string;
  requiresHuman?: boolean;
  relatedReqs?: string[];
}

const tasks: Task[] = [
  {
    id: "t1", icon: "🔧", title: "Fix print statements (6 occurrences)",
    status: "Ready", impact: "Low", est: "2 min",
    actionLabel: "Auto-fix available ✓", relatedReqs: ["REQ-003"],
  },
  {
    id: "t2", icon: "🔧", title: "Replace dict.iteritems() → .items() (4 occurrences)",
    status: "Ready", impact: "Low", est: "1 min",
    actionLabel: "Auto-fix available ✓",
  },
  {
    id: "t3", icon: "🔧", title: "Update exception syntax (3 occurrences)",
    status: "Ready", impact: "Low", est: "1 min",
    actionLabel: "Auto-fix available ✓",
  },
  {
    id: "t4", icon: "⚠️", title: "Migrate payment rounding logic",
    status: "Needs Review", impact: "CRITICAL", est: "15 min",
    detail: "ROUND_HALF_UP default → ROUND_HALF_EVEN changes financial calculations",
    actionLabel: "Requires human decision 👤", requiresHuman: true,
    relatedReqs: ["REQ-001", "REQ-005"],
  },
  {
    id: "t5", icon: "🔧", title: "Update unicode string literals (12 occurrences)",
    status: "Ready", impact: "Low", est: "3 min",
    actionLabel: "Auto-fix available ✓",
  },
  {
    id: "t6", icon: "⚠️", title: "Refactor database query error handling",
    status: "Suggested", impact: "Medium", est: "20 min",
    actionLabel: "Optional improvement",
    relatedReqs: ["REQ-004"],
  },
  {
    id: "t7", icon: "🔧", title: "Integer division → explicit floor division (2 occurrences)",
    status: "Ready", impact: "Medium", est: "2 min",
    actionLabel: "Auto-fix available ✓",
  },
];

const statusBorder = (s: string) => {
  if (s === "Ready") return "task-border-green";
  if (s === "Needs Review") return "task-border-amber";
  return "task-border-violet";
};

const statusPill = (s: string) => {
  if (s === "Ready") return "pill-green";
  if (s === "Needs Review") return "pill-amber";
  return "pill-violet";
};

const impactPill = (i: string) => {
  if (i === "Low") return "pill-green";
  if (i === "Medium") return "pill-amber";
  return "pill-red";
};

interface TaskTreeProps {
  hoveredReq: string | null;
  onHoverTask: (reqIds: string[] | null) => void;
}

const TaskTree = ({ hoveredReq, onHoverTask }: TaskTreeProps) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ t4: true });
  const [included, setIncluded] = useState<Record<string, boolean>>(
    Object.fromEntries(tasks.map((t) => [t.id, true]))
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");

  const toggleExpand = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const toggleInclude = (id: string) => setIncluded((p) => ({ ...p, [id]: !p[id] }));

  const selectedCount = Object.values(included).filter(Boolean).length;
  const selectedTasks = tasks.filter((t) => included[t.id]);
  const totalEst = selectedTasks.reduce((s, t) => s + parseInt(t.est), 0);
  const reviewCount = selectedTasks.filter((t) => t.requiresHuman).length;

  const selectAll = () => setIncluded(Object.fromEntries(tasks.map((t) => [t.id, true])));
  const deselectAll = () => setIncluded(Object.fromEntries(tasks.map((t) => [t.id, false])));

  const startNote = (id: string) => {
    setEditingNote(id);
    setNoteInput(notes[id] || "");
  };

  const saveNote = (id: string) => {
    if (noteInput.trim()) setNotes((p) => ({ ...p, [id]: noteInput.trim() }));
    setEditingNote(null);
    setNoteInput("");
  };

  const isHighlighted = (task: Task) => {
    return hoveredReq && task.relatedReqs?.includes(hoveredReq);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          📋 Migration Task Tree
          <span className="pill-muted text-[10px] px-2 py-0.5 rounded-full font-sans">
            {tasks.length} tasks
          </span>
        </h3>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {tasks.map((task, idx) => {
          const isExp = expanded[task.id];
          const isInc = included[task.id];
          const highlighted = isHighlighted(task);

          return (
            <div
              key={task.id}
              className={`glass ${statusBorder(task.status)} ${
                task.requiresHuman ? "task-border-amber-glow" : ""
              } ${highlighted ? "highlight-glow" : ""} ${
                task.impact === "CRITICAL" ? "animate-pulse-critical" : ""
              }`}
              style={{
                borderRadius: "16px",
                opacity: isInc ? 1 : 0.4,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={() => onHoverTask(task.relatedReqs || null)}
              onMouseLeave={() => onHoverTask(null)}
            >
              {/* Collapsed row */}
              <div
                className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
                onClick={() => toggleExpand(task.id)}
              >
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                {isExp ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                )}
                <span className="text-sm shrink-0">{task.icon}</span>
                <span className="text-sm text-foreground/90 truncate flex-1">{task.title}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusPill(task.status)}`}>
                  {task.status}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${impactPill(task.impact)}`}>
                  {task.impact}
                </span>
              </div>

              {/* Expanded content */}
              {isExp && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Est: <span className="text-foreground/70 font-mono">{task.est}</span></span>
                    <span className={`text-[11px] ${
                      task.actionLabel.includes("Auto-fix") ? "text-emerald-400" :
                      task.actionLabel.includes("human") ? "text-amber-400" : "text-violet-400"
                    }`}>
                      {task.actionLabel}
                    </span>
                  </div>

                  {task.detail && (
                    <p className="text-xs text-foreground/60 italic leading-relaxed">
                      "{task.detail}"
                    </p>
                  )}

                  {/* Controls */}
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Include toggle */}
                    <div className="flex items-center gap-2">
                      <div
                        className={`toggle-track ${isInc ? "active" : ""}`}
                        onClick={(e) => { e.stopPropagation(); toggleInclude(task.id); }}
                      >
                        <div className="toggle-knob" />
                      </div>
                      <span className="text-[11px] text-muted-foreground">Include</span>
                    </div>

                    {/* Add note */}
                    {editingNote === task.id ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <input
                          className="glass-input px-2 py-1 text-xs flex-1 min-w-0"
                          style={{ borderRadius: "8px" }}
                          placeholder="Add a note..."
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveNote(task.id)}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          className="text-emerald-400 hover:text-emerald-300 p-1"
                          onClick={(e) => { e.stopPropagation(); saveNote(task.id); }}
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          className="text-muted-foreground hover:text-foreground p-1"
                          onClick={(e) => { e.stopPropagation(); setEditingNote(null); }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground/70 transition-colors"
                        onClick={(e) => { e.stopPropagation(); startNote(task.id); }}
                      >
                        <MessageSquare className="w-3 h-3" /> {notes[task.id] ? "Edit note" : "Add note"}
                      </button>
                    )}
                  </div>

                  {notes[task.id] && editingNote !== task.id && (
                    <p className="text-[11px] text-foreground/50 pl-2 border-l border-white/10">
                      💬 {notes[task.id]}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div className="glass mt-4 px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderRadius: "14px" }}>
        <span className="text-xs text-muted-foreground">
          <span className="text-foreground/80 font-medium">{selectedCount} tasks</span> selected · Est.{" "}
          <span className="font-mono text-foreground/80">{totalEst} min</span> ·{" "}
          <span className="text-amber-400">{reviewCount} require review</span>
        </span>
        <div className="flex gap-2">
          <button onClick={selectAll} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-white/5">
            Select All
          </button>
          <button onClick={deselectAll} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-white/5">
            Deselect All
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskTree;

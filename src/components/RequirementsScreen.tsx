import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, ChevronRight, ArrowUp, MessageCircle, X, Loader2, Wrench, AlertTriangle, CheckCircle2, Ban, MessageSquare, PlusCircle, HelpCircle, RefreshCw, FileText, ScanLine, PenLine, Brain, Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Types ──────────────────────────────────────────────────────────
interface ChatMessage {
  agent: string;
  color: string;
  icon: string;
  text: string;
  time: string;
  issueType?: string;
}

interface Task {
  status: "done" | "ready" | "review" | "blocked";
  name: string;
  impact: "Low" | "Medium" | "High" | "CRITICAL";
  statusLabel: string;
  isNew?: boolean;
}

interface Requirement {
  id: string;
  title: string;
  description: string;
  source: string;
  confidence: number | "Manual";
  tags: string[];
  verified: boolean;
  tasks: Task[];
  chat: ChatMessage[];
  userAdded?: boolean;
}

// ── Data ───────────────────────────────────────────────────────────
const initialRequirements: Requirement[] = [
  {
    id: "R1",
    title: "Accurate Medicare PPS Payment Estimation",
    description: "The system shall accurately calculate and estimate Medicare PPS payments for various claim types and periods, replicating the logic of the legacy PC-Pricer system.",
    source: "HH-PPS-PRICER.cbl, ESRD-PPS-PRICER.cbl",
    confidence: 89,
    tags: ["medicare", "payment", "critical-path"],
    verified: true,
    tasks: [
      { status: "ready", name: "Replicate HH PPS payment calculation", impact: "CRITICAL", statusLabel: "Ready" },
      { status: "ready", name: "Replicate ESRD PPS payment calculation", impact: "CRITICAL", statusLabel: "Ready" },
      { status: "ready", name: "Convert COBOL COMPUTE → Python arithmetic", impact: "Medium", statusLabel: "Ready" },
    ],
    chat: [
      { agent: "Scanner", color: "#22d3ee", icon: "scan", text: "Extracted 2 core payment calculation paragraphs from HH-PPS-PRICER.cbl and ESRD-PPS-PRICER.cbl. Both follow the same pattern: read rate table → multiply claim amount → round result.", time: "3 min ago" },
      { agent: "QA", color: "#fcd34d", icon: "qa", text: "Confirmed: calculation logic is straightforward. Rate table lookup is the key dependency — see R3 for fiscal year concerns.", time: "2 min ago" },
    ],
  },
  {
    id: "R2",
    title: "Support for Multiple PPS Pricer Types",
    description: "The system shall support different PPS pricers, including Home Health (HH) PPS and End Stage Renal Disease (ESRD) PPS, ensuring calculations are specific to each program's rules and regulations.",
    source: "PPS-CALC/ module",
    confidence: 94,
    tags: ["medicare", "multi-program"],
    verified: true,
    tasks: [
      { status: "ready", name: "Create pricer interface/base class", impact: "Medium", statusLabel: "Ready" },
      { status: "ready", name: "Implement program-specific rate table loading", impact: "High", statusLabel: "Ready" },
    ],
    chat: [
      { agent: "Scanner", color: "#22d3ee", icon: "scan", text: "Both pricers share PPS-COMMON.cpy copybook for data definitions. Suggests a base class pattern in the migrated code.", time: "3 min ago" },
    ],
  },
  {
    id: "R3",
    title: "Historical Claims Processing",
    description: "The system shall be capable of processing claims for different calendar years and date ranges (e.g., 30-day and 60-day versions), maintaining historical accuracy as per the legacy PC-Pricer archive.",
    source: "CLAIM-INPUT.cbl, DATE-CALC.cbl",
    confidence: 76,
    tags: ["historical", "date-logic", "needs-verification"],
    verified: false,
    tasks: [
      { status: "ready", name: "Migrate date calculation logic", impact: "Medium", statusLabel: "Ready" },
      { status: "review", name: "Verify 30-day vs 60-day claim processing logic", impact: "High", statusLabel: "Needs Review" },
      { status: "review", name: "Validate rate table data integrity during migration", impact: "High", statusLabel: "Needs Review" },
      { status: "ready", name: "Convert flat file I/O to modern data access", impact: "High", statusLabel: "Ready" },
    ],
    chat: [
      { agent: "Scanner", color: "#22d3ee", icon: "scan", text: "CLAIM-INPUT.cbl has branching logic on claim period at line 234. Two distinct code paths for 30-day and 60-day processing.", time: "4 min ago" },
      { agent: "QA", color: "#fcd34d", icon: "qa", text: "The 30-day and 60-day paths use different rate adjustment factors. These factors are HARDCODED and differ from CMS published tables in 3 edge cases. Cannot determine if intentional or a bug.", time: "3 min ago", issueType: "missing_biz_logic" },
      { agent: "Writer", color: "#a78bfa", icon: "writer", text: "Documented both code paths. Created comparison table: legacy hardcoded factors vs current CMS published factors.", time: "2 min ago" },
      { agent: "QA", color: "#fcd34d", icon: "qa", text: "Recommend human SME review. This decision cannot be made by AI alone.", time: "1 min ago" },
    ],
  },
  {
    id: "R4",
    title: "Claim Data Input and Payment Output",
    description: "The system shall provide a mechanism for users to input claim-related data and receive estimated Medicare PPS payment outputs.",
    source: "CLAIM-INPUT.cbl, PAYMENT-OUTPUT.cbl",
    confidence: 91,
    tags: ["i/o", "user-facing"],
    verified: true,
    tasks: [
      { status: "ready", name: "Convert COBOL input file reading to API endpoint", impact: "High", statusLabel: "Ready" },
      { status: "ready", name: "Convert payment output to structured JSON response", impact: "Medium", statusLabel: "Ready" },
      { status: "ready", name: "Convert DISPLAY statements to structured logging", impact: "Low", statusLabel: "Ready" },
    ],
    chat: [
      { agent: "Scanner", color: "#22d3ee", icon: "scan", text: "Input reads from sequential flat files. Output writes to print/file. Both should become API endpoints. Data maps cleanly to JSON from COBOL copybook definitions.", time: "3 min ago" },
    ],
  },
  {
    id: "R5",
    title: "Modernized Runtime Environment",
    description: "The new system shall eliminate the dependency on legacy COBOL and Fujitsu NetCOBOL runtime files, operating within a modern and supportable software environment.",
    source: "FUJITSU-BRIDGE.cbl, ENV-CONFIG.cbl",
    confidence: 97,
    tags: ["infrastructure", "runtime", "blocking"],
    verified: false,
    tasks: [
      { status: "blocked", name: "Replace Fujitsu NetCOBOL runtime dependencies", impact: "CRITICAL", statusLabel: "Blocked" },
      { status: "review", name: "Externalize FISCAL-YEAR environment dependency", impact: "CRITICAL", statusLabel: "Needs Review" },
      { status: "ready", name: "Remove deprecated runtime utilities", impact: "Low", statusLabel: "Ready" },
    ],
    chat: [
      { agent: "Scanner", color: "#22d3ee", icon: "scan", text: "Found 23 calls to Fujitsu-specific runtime APIs in FUJITSU-BRIDGE.cbl.", time: "4 min ago" },
      { agent: "QA", color: "#fcd34d", icon: "qa", text: "CRITICAL: These APIs are proprietary. Identified replacements for 20 of 23 calls. 3 have no exact equivalent.", time: "3 min ago" },
      { agent: "Writer", color: "#a78bfa", icon: "writer", text: "Created mapping reference: FUJITSU-MIGRATION-MAP.md with all 23 API calls and suggested replacements.", time: "2 min ago" },
      { agent: "Proofreader", color: "#6ee7b7", icon: "proof", text: "Verified mapping document. 3 approximate replacements will need integration testing.", time: "1 min ago" },
      { agent: "QA", color: "#fcd34d", icon: "qa", text: "Also: ENV-CONFIG.cbl reads FISCAL-YEAR from runtime. If not set, silently defaults to 2019 rates. Undocumented. Affects all calculations.", time: "30 sec ago" },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────
const impactColor = (impact: string) => {
  if (impact === "Low") return "#71717a";
  if (impact === "Medium") return "#71717a";
  if (impact === "High") return "#fcd34d";
  return "#fca5a5";
};

const statusColor = (status: string) => {
  if (status === "Ready" || status === "done") return "#6ee7b7";
  if (status === "Blocked") return "#fca5a5";
  return "#fcd34d";
};

const confBarColor = (c: number | "Manual") => {
  if (c === "Manual") return "#818cf8";
  if (c >= 90) return "#6ee7b7";
  if (c >= 80) return "#fcd34d";
  return "#fca5a5";
};

// ── Unified chat initial messages ──────────────────────────────────
interface UnifiedMessage {
  agent: string;
  color: string;
  text: string;
  time: string;
  isSystem?: boolean;
  isRich?: boolean;
}

const initialUnifiedChat: UnifiedMessage[] = [
  { agent: "System", color: "#52525b", text: "B.LOC has analyzed your repository and extracted 5 requirements with 14 migration tasks.", time: "", isSystem: true },
  {
    agent: "B.LOC", color: "#818cf8",
    text: `I've completed the initial analysis of your CMS PC-Pricer COBOL codebase. Here's a summary:\n\n156 files scanned across 34 copybooks\n5 core behavioral requirements extracted\n3 items need your review before migration\n\n**Trust coverage estimate:** 71% — 29% of business-critical paths will need manual verification\n\nThe highest-priority item is the **30-day vs 60-day claim processing logic** (R3) — the legacy code has hardcoded rate factors that don't match current CMS tables. I need your guidance on whether to preserve the legacy values or update them.\n\nWhat would you like to explore first?`,
    time: "5 min ago", isRich: true,
  },
  { agent: "You", color: "#818cf8", text: "Can you explain the rate factor differences in R3 in more detail?", time: "4 min ago" },
  {
    agent: "B.LOC", color: "#818cf8",
    text: `The 30-day claim path uses these hardcoded factors:\n\n\`FY2023: 1.0247  |  FY2024: 1.0251\`\n\nThe current CMS published values are:\n\n\`FY2023: 1.0248  |  FY2024: 1.0253\`\n\nThe differences are small (0.0001–0.0002) but they compound. On 10,000 claims this could mean a ~$15,000 variance in total payments.\n\nTwo possible interpretations:\n\n1. **Legacy corrections** — someone manually adjusted these factors for a business reason\n\n2. **Rounding artifacts** — COBOL COMP-3 packed decimal math produces slightly different results\n\nI recommend checking with your CMS compliance team. Want me to add this as a specific review task?`,
    time: "4 min ago", isRich: true,
  },
  { agent: "You", color: "#818cf8", text: "Yes, add a task for compliance review", time: "3 min ago" },
  {
    agent: "B.LOC", color: "#818cf8",
    text: `Done. I've added a new task under R3:\n\n**'Compliance review: verify legacy rate adjustment factors'** — High Impact — Needs Review\n\nThis has been linked to R3 and will block the 30-day/60-day migration subtask until reviewed. You'll see it in the requirements list on the left.\n\nAnything else you'd like to adjust?`,
    time: "3 min ago", isRich: true,
  },
];

// ── Sub-components ──────────────────────────────────────────────────
const TaskStatusIcon = ({ status }: { status: string }) => {
  const size = 14;
  const sw = 1.5;
  if (status === "done") return <CheckCircle2 className="shrink-0" style={{ color: "#6ee7b7", width: size, height: size }} strokeWidth={sw} />;
  if (status === "ready") return <Wrench className="shrink-0" style={{ color: "#71717a", width: size, height: size }} strokeWidth={sw} />;
  if (status === "review") return <AlertTriangle className="shrink-0" style={{ color: "#fcd34d", width: size, height: size }} strokeWidth={sw} />;
  return <Ban className="shrink-0" style={{ color: "#fca5a5", width: size, height: size }} strokeWidth={sw} />;
};

const TaskRow = ({ task }: { task: Task }) => {
  const [showNew, setShowNew] = useState(!!task.isNew);

  useEffect(() => {
    if (task.isNew) {
      const t = setTimeout(() => setShowNew(false), 3000);
      return () => clearTimeout(t);
    }
  }, [task.isNew]);

  return (
    <div
      className="flex items-center justify-between gap-3 py-2 px-3 rounded-md transition-all cursor-default"
      style={{ transitionDuration: "0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div className="flex items-center gap-2 min-w-0">
        <TaskStatusIcon status={task.status} />
        <span className="text-[13px] truncate">{task.name}</span>
        {showNew && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: "rgba(129,140,248,0.12)", color: "#818cf8" }}>
            NEW
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {task.impact === "CRITICAL" && (
          <span className="text-[10px]" style={{ color: "#fca5a5" }}>Critical</span>
        )}
        {task.impact === "High" && (
          <span className="text-[10px]" style={{ color: "#fcd34d" }}>High</span>
        )}
        <span className="text-[10px]" style={{ color: statusColor(task.statusLabel) }}>{task.statusLabel}</span>
      </div>
    </div>
  );
};

const agentIconMap: Record<string, typeof ScanLine> = {
  Scanner: ScanLine,
  Writer: PenLine,
  QA: Brain,
  Proofreader: CheckCircle2,
};

const MiniChat = ({ messages, reqId, onReplyInMain }: { messages: ChatMessage[]; reqId: string; onReplyInMain: (id: string) => void }) => (
  <div className="mt-4">
    <p className="text-[12px] mb-2" style={{ color: "#52525b" }}>
      Discussion · {messages.length} messages
    </p>
    <div className="p-3 rounded-lg space-y-1.5" style={{ background: "rgba(0,0,0,0.2)" }}>
      {messages.map((m, i) => {
        const AgentIcon = agentIconMap[m.agent];
        return (
          <div key={`${reqId}-msg-${i}`} className="flex gap-2 p-2 rounded-md" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5" style={{ background: `${m.color}20` }}>
              {AgentIcon ? <AgentIcon className="w-2.5 h-2.5" style={{ color: m.color }} strokeWidth={1.5} /> : <div className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium" style={{ color: m.color }}>{m.agent}</span>
                <span className="text-[10px]" style={{ color: "#3f3f46" }}>· {m.time}</span>
              </div>
              <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: "#71717a" }}>
                {m.text}
                {m.issueType && (
                  <span className="inline-block ml-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#52525b" }}>{m.issueType}</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
      <button
        className="text-[11px] mt-1 transition-colors btn-ghost"
        style={{ color: "#818cf8" }}
        onClick={() => onReplyInMain(reqId)}
      >
        Reply in main chat →
      </button>
    </div>
  </div>
);

// ── Rich text renderer ─────────────────────────────────────────────
const RichText = ({ text }: { text: string }) => {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part === "\n") return <br key={i} />;
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i} className="font-medium" style={{ color: "#fafafa" }}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <code key={i} className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "#a1a1aa" }}>
              {part.slice(1, -1)}
            </code>
          );
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

// ── Typing indicator ───────────────────────────────────────────────
const TypingIndicator = () => (
  <div className="flex items-center gap-2 px-3 py-2">
    <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-mono font-semibold shrink-0" style={{ background: "rgba(129,140,248,0.15)", color: "#818cf8" }}>B.</div>
    <div className="flex gap-1 px-2.5 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.03)" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-1 h-1 rounded-full" style={{ background: "#52525b", animation: `typingDot 1.2s ease-in-out ${i * 150}ms infinite` }} />
      ))}
    </div>
  </div>
);

// ── Unified Chat Message ───────────────────────────────────────────
const UnifiedChatMessage = ({ msg }: { msg: UnifiedMessage }) => {
  if (msg.isSystem) {
    return (
      <div className="text-center py-2">
        <span className="text-[11px] italic" style={{ color: "#52525b" }}>{msg.text}</span>
      </div>
    );
  }

  const isBloc = msg.agent === "B.LOC";
  const isYou = msg.agent === "You";

  return (
    <div className="flex gap-2 p-2.5 rounded-md" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div
        className={`shrink-0 flex items-center justify-center ${isBloc ? "rounded-md" : "rounded-full"}`}
        style={{
          width: 24, height: 24,
          background: isBloc ? "rgba(129,140,248,0.15)" : isYou ? "rgba(129,140,248,0.1)" : `${msg.color}15`,
          color: isBloc ? "#818cf8" : isYou ? "#a1a1aa" : msg.color,
          fontSize: isBloc ? 9 : 11,
          fontFamily: isBloc ? "'JetBrains Mono', monospace" : undefined,
          fontWeight: isBloc ? 600 : undefined,
        }}
      >
        {isBloc ? "B." : isYou ? <span className="text-[10px]">You</span> : <div className="w-1.5 h-1.5 rounded-full" style={{ background: msg.color }} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium" style={{ color: isYou ? "#a1a1aa" : msg.color }}>{msg.agent}</span>
          {msg.time && <span className="text-[10px]" style={{ color: "#3f3f46" }}>· {msg.time}</span>}
        </div>
        <div className="text-[12px] leading-relaxed mt-0.5" style={{ color: "#71717a" }}>
          {msg.isRich ? <RichText text={msg.text} /> : msg.text}
        </div>
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────────
interface RequirementsScreenProps {
  onProceed: () => void;
}

const RequirementsScreen = ({ onProceed }: RequirementsScreenProps) => {
  const [reqs, setReqs] = useState<Requirement[]>(() => {
    return initialRequirements.map((r) => {
      if (r.id === "R3") {
        return {
          ...r,
          tasks: [
            ...r.tasks,
            { status: "review" as const, name: "Compliance review: verify legacy rate adjustment factors", impact: "High" as const, statusLabel: "Needs Review", isNew: true },
          ],
        };
      }
      return r;
    });
  });
  const [expandedId, setExpandedId] = useState<string>("R3");
  const [building, setBuilding] = useState(false);
  const [visible, setVisible] = useState(false);

  const [chatMessages, setChatMessages] = useState<UnifiedMessage[]>(initialUnifiedChat);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const isNarrow = useIsNarrow();
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, isTyping]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? "" : id));
  };

  const toggleVerified = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, verified: !r.verified } : r)));
  };

  const handleReplyInMain = (reqId: string) => {
    setChatInput(`Re: ${reqId} — `);
    if (isNarrow) setChatOpen(true);
    setTimeout(() => chatInputRef.current?.focus(), 100);
  };

  const totalTasks = reqs.reduce((sum, r) => sum + r.tasks.length, 0);

  const generateResponse = useCallback((userMsg: string): string => {
    const lower = userMsg.toLowerCase();
    if (lower.startsWith("search memory for")) {
      return "Found 3 relevant entries in memory:\n· Fee calculation is capped at the fiscal year rate table maximum\n· Rounding uses HALF_UP — not the Python 3 default\n· 30-day and 60-day claims use different rate adjustment factors\n\nThese were extracted from previous analysis runs and stored in the vector database.";
    }
    if (lower.includes("add") && lower.includes("requirement")) {
      return "I've added a new requirement based on your input. You can see it in the list on the left.";
    }
    if (lower.includes("explain")) {
      return "The relevant module works by reading input parameters from the claim record, applying rate table lookups based on the fiscal year, and computing the payment amount using program-specific formulas. Would you like me to go deeper on any specific aspect?";
    }
    if (lower.includes("summary")) {
      return `Here's the current status:\n\n${reqs.length} requirements (${reqs.filter((r) => r.verified).length} verified, ${reqs.filter((r) => !r.verified).length} need review)\n${totalTasks} tasks\nKey blocker: Fujitsu runtime replacement (R5)\nKey decision: 30-day vs 60-day rate factors (R3)\n\nOverall readiness: ~75%.`;
    }
    return "I understand. Let me look into that for you. Based on the codebase analysis, I'd suggest reviewing the related requirement and its agent discussion. Would you like me to add this as a specific task or requirement?";
  }, [reqs, totalTasks]);

  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages((prev) => [...prev, { agent: "You", color: "#818cf8", text, time: "just now" }]);
    setChatInput("");
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const lower = text.toLowerCase();
      if (lower.includes("add") && lower.includes("requirement")) {
        const reqText = text.replace(/add\s*(a\s*)?new\s*requirement:?\s*/i, "").trim() || "User-defined requirement";
        setReqs((prev) => [...prev, {
          id: `R${prev.length + 1}`,
          title: reqText.slice(0, 80),
          description: reqText,
          source: "User input",
          confidence: "Manual",
          tags: ["user-added"],
          verified: false,
          userAdded: true,
          tasks: [],
          chat: [{ agent: "B.LOC", color: "#818cf8", icon: "bloc", text: "Requirement added from your input. Tasks will be generated when you approve and build.", time: "just now" }],
        }]);
      }
      setChatMessages((prev) => [...prev, { agent: "B.LOC", color: "#818cf8", text: generateResponse(text), time: "just now", isRich: true }]);
      if (isNarrow && !chatOpen) setUnreadCount((p) => p + 1);
    }, 1500);
  }, [chatInput, generateResponse, isNarrow, chatOpen]);

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  };

  const quickActions = [
    { icon: PlusCircle, label: "Add requirement", fill: "Add a new requirement: " },
    { icon: HelpCircle, label: "Explain", fill: "Explain in detail: " },
    { icon: RefreshCw, label: "Re-analyze", fill: "Re-analyze the codebase focusing on " },
    { icon: FileText, label: "Summary", fill: "Give me a summary of " },
    { icon: Search, label: "Search memory", fill: "Search memory for " },
  ];

  const verifiedCount = reqs.filter((r) => r.verified).length;
  const reviewCount = reqs.length - verifiedCount;

  const [savingMemory, setSavingMemory] = useState(false);
  const [memorySaved, setMemorySaved] = useState(false);

  const handleApprove = () => {
    setBuilding(true);
    setSavingMemory(true);
    setTimeout(() => { setSavingMemory(false); setMemorySaved(true); }, 500);
    setTimeout(() => onProceed(), 2000);
  };

  const chatPanel = (
    <div className="flex flex-col h-full">
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-medium">B.LOC Assistant</h3>
            <p className="text-[11px] mt-0.5" style={{ color: "#52525b" }}>Ask questions, add requirements, discuss the migration</p>
          </div>
          {isNarrow && (
            <button onClick={() => setChatOpen(false)} className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <X className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#6ee7b7" }} />
          <span className="text-[10px]" style={{ color: "#6ee7b7" }}>Agents online</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5" style={{ background: "rgba(0,0,0,0.15)" }}>
        {chatMessages.map((msg, i) => (<UnifiedChatMessage key={i} msg={msg} />))}
        {isTyping && <TypingIndicator />}
        <div ref={chatBottomRef} />
      </div>

      <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="relative">
          <textarea
            ref={chatInputRef}
            className="w-full text-[12px] outline-none resize-none font-sans"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              padding: "10px 40px 10px 14px",
              color: "#a1a1aa",
              minHeight: "40px",
              maxHeight: "100px",
              transition: "border-color 0.15s",
            }}
            placeholder="Ask a question, add a requirement, or give instructions..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.3)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
            rows={1}
          />
          <button
            onClick={sendChatMessage}
            className="absolute right-2 bottom-2 w-7 h-7 rounded-md flex items-center justify-center transition-opacity"
            style={{ background: chatInput.trim() ? "rgba(129,140,248,0.3)" : "rgba(255,255,255,0.04)", opacity: chatInput.trim() ? 1 : 0.4, transitionDuration: "0.15s" }}
            disabled={!chatInput.trim()}
          >
            <ArrowUp className="w-3 h-3" style={{ color: chatInput.trim() ? "#c7d2fe" : "#52525b" }} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.label}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-all"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#52525b", transitionDuration: "0.15s" }}
                onClick={() => { setChatInput(qa.fill); chatInputRef.current?.focus(); }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}
              >
                <Icon className="w-3 h-3" strokeWidth={1.5} />
                {qa.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}>
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT COLUMN */}
        <div className={`${isNarrow ? "w-full" : "w-[60%]"} flex flex-col min-h-0`}>
          <div className="flex-1 overflow-y-auto" style={{ padding: "24px 20px 100px" }}>
            <h1 className="text-[20px] font-medium">Requirements & Migration Plan</h1>
            <p className="text-[13px] mt-1" style={{ color: "#71717a" }}>Review AI-extracted requirements, discuss with agents, approve to begin migration</p>
            <p className="font-mono text-[12px] mt-1.5" style={{ color: "#52525b" }}>
              <span style={{ color: "#fafafa" }}>{reqs.length}</span> requirements · <span style={{ color: "#a1a1aa" }}>{totalTasks}</span> tasks · <span style={{ color: "#fcd34d" }}>{reviewCount}</span> need review
            </p>

            <div className="mt-6 space-y-2">
              {reqs.map((req, idx) => {
                const isExpanded = expandedId === req.id;
                return (
                  <div
                    key={req.id}
                    id={`req-${req.id}`}
                    className="glass transition-all"
                    style={{
                      opacity: visible ? 1 : 0,
                      transition: `opacity 0.3s ease ${idx * 50}ms`,
                    }}
                  >
                    <div
                      className="cursor-pointer transition-all p-4"
                      style={{ transitionDuration: "0.15s" }}
                      onClick={() => toggleExpand(req.id)}
                      onMouseEnter={(e) => (e.currentTarget.parentElement!.style.background = "rgba(255,255,255,0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.parentElement!.style.background = "rgba(255,255,255,0.03)")}
                    >
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={(e) => toggleVerified(req.id, e)}
                          className="w-1.5 h-1.5 rounded-full shrink-0 transition-all"
                          style={{ background: req.verified ? "#6ee7b7" : "#fcd34d", transitionDuration: "0.15s" }}
                          title={req.verified ? "Verified" : "Needs review"}
                        />
                        <span className="font-mono text-[12px] font-medium shrink-0" style={{ color: "#818cf8" }}>{req.id}</span>
                        <span className="text-[13px] font-medium truncate">{req.title}</span>
                        <div className="ml-auto flex items-center gap-2.5 shrink-0">
                          <span className="text-[11px] font-mono" style={{ color: "#52525b" }}>{req.tasks.length} tasks</span>
                          {req.chat.length > 0 && (
                            <span className="flex items-center gap-1" style={{ color: "#52525b" }}>
                              <MessageSquare className="w-3 h-3" strokeWidth={1.5} />
                              <span className="text-[10px]">{req.chat.length}</span>
                            </span>
                          )}
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} /> : <ChevronRight className="w-3.5 h-3.5" style={{ color: "#52525b" }} strokeWidth={1.5} />}
                        </div>
                      </div>
                      {!isExpanded && (
                        <p className="text-[12px] mt-1 truncate ml-6" style={{ color: "#52525b" }}>{req.description}</p>
                      )}
                    </div>

                    {!isExpanded && (
                      <div className="mx-4 mb-3 h-px rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="h-full rounded-full" style={{ width: req.confidence === "Manual" ? "100%" : `${req.confidence}%`, background: confBarColor(req.confidence) }} />
                      </div>
                    )}

                    {isExpanded && (
                      <div className="px-4 pb-4">
                        <p className="text-[13px] leading-relaxed" style={{ color: "#a1a1aa" }}>{req.description}</p>
                        <p className="font-mono text-[11px] mt-2" style={{ color: "#52525b" }}>Source: {req.source}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[11px]" style={{ color: "#52525b" }}>Confidence:</span>
                          <div className="flex-1 h-px rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <div className="h-full rounded-full" style={{ width: req.confidence === "Manual" ? "100%" : `${req.confidence}%`, background: confBarColor(req.confidence) }} />
                          </div>
                          <span className="font-mono text-[11px]" style={{ color: "#52525b" }}>{req.confidence === "Manual" ? "Manual" : `${req.confidence}%`}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {req.tags.map((tag) => (
                            <span key={tag} className="text-[10px] px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.03)", color: "#52525b" }}>{tag}</span>
                          ))}
                        </div>
                        <p className="text-[12px] mt-5 mb-2" style={{ color: "#52525b" }}>Related tasks</p>
                        {req.tasks.length > 0 ? (
                          <div>{req.tasks.map((task, i) => (<TaskRow key={i} task={task} />))}</div>
                        ) : (
                          <p className="text-[11px] italic" style={{ color: "#3f3f46" }}>No tasks generated yet</p>
                        )}
                        {req.chat.length > 0 && (<MiniChat messages={req.chat} reqId={req.id} onReplyInMain={handleReplyInMain} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {!isNarrow && <div className="w-px self-stretch" style={{ background: "rgba(255,255,255,0.04)" }} />}

        {!isNarrow && (
          <div className="w-[40%] flex flex-col min-h-0" style={{ position: "sticky", top: 0, height: "100%" }}>
            {chatPanel}
          </div>
        )}

        {isNarrow && !chatOpen && (
          <button
            onClick={() => { setChatOpen(true); setUnreadCount(0); }}
            className="fixed z-50 flex items-center justify-center"
            style={{ bottom: 80, right: 16, width: 48, height: 48, borderRadius: 8, background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.25)" }}
          >
            <MessageCircle className="w-5 h-5" style={{ color: "#818cf8" }} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px]" style={{ background: "#fca5a5", color: "#09090b" }}>{unreadCount}</div>
            )}
          </button>
        )}

        {isNarrow && chatOpen && (
          <div className="fixed inset-y-0 right-0 z-50 flex flex-col animate-slide-in-right" style={{ width: "min(360px, 90vw)", background: "rgba(9,9,11,0.95)", backdropFilter: "blur(16px)", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
            {chatPanel}
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div
        className="sticky bottom-0 flex items-center justify-between flex-wrap gap-2 z-40"
        style={{ padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.04)", backdropFilter: "blur(16px)", background: "rgba(9,9,11,0.85)" }}
      >
        <p className="font-mono text-[11px]" style={{ color: "#52525b" }}>
          <span style={{ color: "#fafafa" }}>{reqs.length}</span> requirements · <span style={{ color: "#a1a1aa" }}>{totalTasks}</span> tasks · <span style={{ color: "#fcd34d" }}>{reviewCount}</span> need review
        </p>
        <div className="flex items-center gap-2">
          {reviewCount > 0 && !building && (
            <span className="text-[10px] hidden sm:inline" style={{ color: "#fcd34d" }}>{reviewCount} items still need review</span>
          )}
          <button
            onClick={handleApprove}
            disabled={building}
            className="btn-primary text-[13px] font-medium flex items-center gap-2 px-6 py-2.5"
          >
            {building ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> 
                <span className="flex flex-col items-center">
                  <span>Building migration plan...</span>
                  <span className="text-[11px] font-normal" style={{ color: "#52525b" }}>
                    {savingMemory ? "Saving approved requirements to memory..." : memorySaved ? "Saved ✓" : ""}
                  </span>
                </span>
              </>
            ) : (
              <>Approve Requirements & Build →</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1100px)");
    const onChange = () => setNarrow(mql.matches);
    mql.addEventListener("change", onChange);
    setNarrow(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export default RequirementsScreen;

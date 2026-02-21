import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronDown,
  CheckCircle2,
  Wrench,
  AlertTriangle,
  Ban,
  ArrowUp,
  Loader2,
  MessageSquare,
  Paperclip,
  FileText,
  X,
  Play,
  XCircle,
  Copy,
  Check,
  Plus,
} from "lucide-react";

/* ─── Data ─── */
type TaskStatus = "ready" | "done" | "review" | "blocked";
interface Task { status: TaskStatus; name: string; severity: string; severityColor: string; flash?: boolean }
interface AgentMsg { agent: string; color: string; time: string; text: string }
interface Requirement {
  id: string; title: string; dot: string; confidence: number;
  description: string; source: string; tags: string[];
  tasks: Task[]; discussion: AgentMsg[];
}

type BuildResult = "success" | "risky" | "risky-accepted" | "risky-rejected" | "blocked" | null;
type BuildPhase = "idle" | "migrating" | "done";

interface BuildResultData {
  type: "success" | "risky" | "blocked";
  text: string;
  rightText: string;
  stats: string;
  detailText?: string;
  preservation: string;
}

const buildResults: Record<string, BuildResultData> = {
  R1: { type: "success", text: "Migration complete — 92% behavior preserved", rightText: "3 tests passed", stats: "Tests: 3/3 passed · Behavior: 92% preserved · Lint: passed", preservation: "92%" },
  R2: { type: "success", text: "Migration complete — 95% behavior preserved", rightText: "2 tests passed", stats: "Tests: 2/2 passed · Behavior: 95% preserved · Lint: passed", preservation: "95%" },
  R3: { type: "risky", text: "Migration complete — 85.7% preserved, 1 drift detected", rightText: "Review drift", stats: "Tests: 3/4 passed · Behavior: 85.7% preserved · 1 drift", preservation: "85.7%" },
  R4: { type: "success", text: "Migration complete — 94% behavior preserved", rightText: "3 tests passed", stats: "Tests: 3/3 passed · Behavior: 94% preserved · Lint: passed", preservation: "94%" },
  R5: { type: "blocked", text: "Migration blocked — 1 critical dependency unresolved", rightText: "Blocked", stats: "", preservation: "0%" },
};

const chatResultMessages: Record<string, Record<string, string>> = {
  R1: { success: "R1 migration complete — 92% behavior preserved, all tests passing. Results saved to memory." },
  R2: { success: "R2 migration complete — 95% behavior preserved, all tests passing. Results saved to memory." },
  R3: { risky: "R3 migration complete with 85.7% preservation. 1 drift detected: rate precision delta (0.0001). Awaiting your review." },
  R4: { success: "R4 migration complete — 94% behavior preserved, all tests passing. Results saved to memory." },
  R5: { blocked: "R5 migration blocked — Fujitsu NetCOBOL dependency cannot be resolved automatically. 3 APIs require manual replacement." },
};

const initialRequirements: Requirement[] = [
  {
    id: "R1", title: "Accurate Medicare PPS Payment Estimation", dot: "#6ee7b7", confidence: 89,
    description: "The system shall accurately calculate Medicare PPS payments for various claim types and periods, replicating the logic of the legacy PC-Pricer system.",
    source: "HH-PPS-PRICER.cbl, ESRD-PPS-PRICER.cbl", tags: ["medicare", "payment", "critical-path"],
    tasks: [
      { status: "ready", name: "Replicate HH PPS payment calculation", severity: "Critical", severityColor: "#fca5a5" },
      { status: "ready", name: "Replicate ESRD PPS payment calculation", severity: "Critical", severityColor: "#fca5a5" },
      { status: "ready", name: "Convert COBOL COMPUTE → Python arithmetic", severity: "Medium", severityColor: "#a1a1aa" },
    ],
    discussion: [
      { agent: "Scanner", color: "#22d3ee", time: "3m ago", text: "Extracted 2 core payment paragraphs. Both follow: read rate table → multiply claim → round result." },
      { agent: "QA", color: "#fcd34d", time: "2m ago", text: "Confirmed: calculation logic is straightforward. Rate table lookup is the key dependency." },
    ],
  },
  {
    id: "R2", title: "Support for Multiple PPS Pricer Types", dot: "#6ee7b7", confidence: 94,
    description: "Support HH PPS and ESRD PPS, ensuring calculations follow each program's rules.",
    source: "PPS-CALC/", tags: ["medicare", "multi-program"],
    tasks: [
      { status: "ready", name: "Create pricer interface/base class", severity: "Medium", severityColor: "#a1a1aa" },
      { status: "ready", name: "Implement program-specific rate table loading", severity: "High", severityColor: "#fcd34d" },
    ],
    discussion: [
      { agent: "Scanner", color: "#22d3ee", time: "3m ago", text: "Both pricers share PPS-COMMON.cpy copybook. Suggests a base class pattern." },
    ],
  },
  {
    id: "R3", title: "Historical Claims Processing", dot: "#fcd34d", confidence: 76,
    description: "Process claims for different calendar years and date ranges (30-day and 60-day versions), maintaining historical accuracy.",
    source: "CLAIM-INPUT.cbl, DATE-CALC.cbl", tags: ["historical", "date-logic", "needs-verification"],
    tasks: [
      { status: "ready", name: "Migrate date calculation logic", severity: "Medium", severityColor: "#a1a1aa" },
      { status: "review", name: "Verify 30-day vs 60-day claim processing", severity: "High", severityColor: "#fcd34d" },
      { status: "review", name: "Validate rate table data integrity", severity: "High", severityColor: "#fcd34d" },
      { status: "ready", name: "Convert flat file I/O to modern data access", severity: "High", severityColor: "#fcd34d" },
    ],
    discussion: [
      { agent: "Scanner", color: "#22d3ee", time: "4m ago", text: "CLAIM-INPUT.cbl branches on claim period at line 234. Two paths: 30-day and 60-day with different rate factors." },
      { agent: "QA", color: "#fcd34d", time: "3m ago", text: "The 30/60-day paths use different hardcoded factors that differ from published CMS tables in 3 edge cases. Cannot determine if intentional or a legacy bug." },
      { agent: "Writer", color: "#818cf8", time: "2m ago", text: "Documented both paths. Created comparison table of legacy vs CMS published factors." },
      { agent: "QA", color: "#fcd34d", time: "1m ago", text: "Recommend human SME review. This decision cannot be made by AI alone." },
    ],
  },
  {
    id: "R4", title: "Claim Data Input and Payment Output", dot: "#6ee7b7", confidence: 91,
    description: "Provide mechanism for claim data input and estimated payment output.",
    source: "CLAIM-INPUT.cbl, PAYMENT-OUTPUT.cbl", tags: ["i/o", "user-facing"],
    tasks: [
      { status: "ready", name: "Convert COBOL input to API endpoint", severity: "High", severityColor: "#fcd34d" },
      { status: "ready", name: "Convert payment output to JSON response", severity: "Medium", severityColor: "#a1a1aa" },
      { status: "ready", name: "Convert DISPLAY to structured logging", severity: "Low", severityColor: "#71717a" },
    ],
    discussion: [
      { agent: "Scanner", color: "#22d3ee", time: "3m ago", text: "Input reads from flat files. Output writes to print/file. Both map cleanly to API endpoints." },
    ],
  },
  {
    id: "R5", title: "Modernized Runtime Environment", dot: "#fcd34d", confidence: 97,
    description: "Eliminate dependency on legacy COBOL and Fujitsu NetCOBOL runtime.",
    source: "FUJITSU-BRIDGE.cbl, ENV-CONFIG.cbl", tags: ["infrastructure", "runtime", "blocking"],
    tasks: [
      { status: "blocked", name: "Replace Fujitsu NetCOBOL runtime dependencies", severity: "Critical", severityColor: "#fca5a5" },
      { status: "review", name: "Externalize FISCAL-YEAR environment dependency", severity: "Critical", severityColor: "#fca5a5" },
      { status: "ready", name: "Remove deprecated runtime utilities", severity: "Low", severityColor: "#71717a" },
    ],
    discussion: [
      { agent: "Scanner", color: "#22d3ee", time: "4m ago", text: "Found 23 calls to Fujitsu-specific runtime APIs." },
      { agent: "QA", color: "#fcd34d", time: "3m ago", text: "CRITICAL: Proprietary APIs, not portable. Replacements found for 20 of 23. Three have no exact equivalent." },
      { agent: "Writer", color: "#818cf8", time: "2m ago", text: "Created mapping reference for all 23 API calls." },
      { agent: "QA", color: "#fcd34d", time: "30s ago", text: "Also flagging: FISCAL-YEAR silently defaults to 2019. Undocumented. Affects all calculations." },
    ],
  },
];

const statusIcon = (s: TaskStatus) => {
  const props = { className: "w-3.5 h-3.5 shrink-0", strokeWidth: 1.5, style: { color: "#71717a" } };
  switch (s) {
    case "done": return <CheckCircle2 {...props} style={{ color: "#6ee7b7" }} />;
    case "ready": return <Wrench {...props} />;
    case "review": return <AlertTriangle {...props} style={{ color: "#fcd34d" }} />;
    case "blocked": return <Ban {...props} style={{ color: "#fca5a5" }} />;
  }
};

const confColor = (c: number) => c > 90 ? "#6ee7b7" : c >= 80 ? "#fcd34d" : "#fca5a5";

/* ─── Chat messages ─── */
interface ChatAttachment { name: string; size: string; type: string }
interface ChatMessage { sender: "system" | "bloc" | "you"; text: string; time?: string; attachment?: ChatAttachment }

const initialMessages: ChatMessage[] = [
  { sender: "system", text: "Analysis complete. 5 requirements extracted." },
  {
    sender: "bloc", time: "5m ago",
    text: `I've analyzed the CMS PC-Pricer COBOL codebase. Here's the summary:\n\n87 functions scanned across 34 copybooks\n5 behavioral requirements extracted\n23 side effects detected (file I/O, env reads, DB)\nTrust coverage estimate: 71%\n3 items need your review before migration\n\nThe highest-priority item is the 30-day vs 60-day claim logic (R3) — the legacy code has hardcoded rate factors that don't match current CMS tables.\n\nWhat would you like to explore?`,
  },
  { sender: "you", time: "4m ago", text: "Explain the rate factor differences in R3" },
  {
    sender: "bloc", time: "4m ago",
    text: `The 30-day claim path uses hardcoded factors:\nFY2023: 1.0247 · FY2024: 1.0251\n\nCurrent CMS published values:\nFY2023: 1.0248 · FY2024: 1.0253\n\nDifferences are 0.0001-0.0002, but they compound. On 10,000 claims this could mean ~$15,000 variance.\n\nTwo interpretations:\n1. Legacy corrections — someone adjusted these intentionally\n2. Rounding artifacts — COBOL COMP-3 produces slightly different results\n\nI recommend checking with your CMS compliance team. Want me to add a review task?`,
  },
  { sender: "you", time: "3m ago", text: "Yes, add a compliance review task" },
  {
    sender: "bloc", time: "3m ago",
    text: `Added to R3:\n\n⚠ 'Compliance review: verify legacy rate factors' — High — Needs Review\n\nThis will block the 30/60-day migration subtask until reviewed.`,
  },
];

const migrationSteps = [
  "Generating characterization tests...",
  "Running baseline tests...",
  "Migrating code...",
  "Validating behavior...",
];

/* ─── Component ─── */
const Tab2Requirements = () => {
  const [expanded, setExpanded] = useState("R3");
  const [reqs, setReqs] = useState(initialRequirements);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<ChatAttachment | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build state per requirement
  const [buildPhase, setBuildPhase] = useState<Record<string, BuildPhase>>({});
  const [buildResult, setBuildResult] = useState<Record<string, BuildResult>>({});
  const [buildStep, setBuildStep] = useState<Record<string, number>>({});
  const [buildProgress, setBuildProgress] = useState<Record<string, number>>({});
  const [detailOpen, setDetailOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [showAddReq, setShowAddReq] = useState(false);
  const [newReqTitle, setNewReqTitle] = useState("");
  const [newReqDesc, setNewReqDesc] = useState("");
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState("");

  // Add compliance task to R3 on mount
  useEffect(() => {
    const t = setTimeout(() => {
      setReqs((prev) =>
        prev.map((r) =>
          r.id === "R3"
            ? { ...r, tasks: [...r.tasks, { status: "review" as TaskStatus, name: "Compliance review: verify legacy rate factors", severity: "High", severityColor: "#fcd34d", flash: true }] }
            : r
        )
      );
      setTimeout(() => {
        setReqs((prev) =>
          prev.map((r) =>
            r.id === "R3" ? { ...r, tasks: r.tasks.map((t) => ({ ...t, flash: false })) } : r
          )
        );
      }, 1200);
    }, 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const totalTasks = reqs.reduce((a, r) => a + r.tasks.length, 0);
  const reviewCount = reqs.reduce((a, r) => a + r.tasks.filter((t) => t.status === "review").length, 0);
  const builtCount = Object.values(buildResult).filter((v) => v === "success" || v === "risky-accepted").length;
  const blockedCount = Object.values(buildResult).filter((v) => v === "blocked").length;

  const headerStats = () => {
    if (builtCount === 0 && blockedCount === 0) {
      return <>{reqs.length} requirements · {totalTasks} tasks · <span style={{ color: "#fcd34d" }}>{reviewCount} need review</span></>;
    }
    const parts = [`${builtCount} of ${reqs.length} built`];
    if (blockedCount > 0) parts.push(`${blockedCount} blocked`);
    else if (reviewCount > 0) parts.push(`${reviewCount} need review`);
    return <>{parts.join(" · ")}</>;
  };

  // Build flow
  const startBuild = useCallback((reqId: string) => {
    setBuildPhase((p) => ({ ...p, [reqId]: "migrating" }));
    setBuildStep((p) => ({ ...p, [reqId]: 0 }));
    setBuildProgress((p) => ({ ...p, [reqId]: 0 }));

    // Progress animation
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const prog = Math.min((now - start) / 2000, 1);
      setBuildProgress((p) => ({ ...p, [reqId]: prog * 100 }));
      if (prog < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Step updates
    const timers = migrationSteps.map((_, i) =>
      setTimeout(() => setBuildStep((p) => ({ ...p, [reqId]: i })), i * 500)
    );

    // Complete
    timers.push(setTimeout(() => {
      cancelAnimationFrame(raf);
      const result = buildResults[reqId];
      setBuildPhase((p) => ({ ...p, [reqId]: "done" }));
      setBuildResult((p) => ({ ...p, [reqId]: result?.type || "success" }));

      // Chat message
      const msgMap = chatResultMessages[reqId];
      if (msgMap) {
        const key = result?.type || "success";
        const text = msgMap[key];
        if (text) {
          setMessages((m) => [...m, { sender: "bloc", time: "just now", text }]);
        }
      }
    }, 2200));

    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, []);

  const acceptDrift = useCallback((reqId: string) => {
    setBuildResult((p) => ({ ...p, [reqId]: "risky-accepted" }));
    setMessages((m) => [...m, { sender: "bloc", time: "just now", text: `${reqId} drift accepted — migration approved with 85.7% preservation.` }]);
  }, []);

  const rejectDrift = useCallback((reqId: string) => {
    setBuildResult((p) => ({ ...p, [reqId]: "risky-rejected" }));
    setMessages((m) => [...m, { sender: "bloc", time: "just now", text: `${reqId} migration rejected — reverting to legacy.` }]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return;
    const sizeStr = file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(0)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    setPendingFile({ name: file.name, size: sizeStr, type: "pdf" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    const file = pendingFile;
    if (!text && !file) return;
    setMessages((m) => [...m, { sender: "you", time: "now", text: text || `Uploaded ${file?.name}`, attachment: file || undefined }]);
    setInput("");
    setPendingFile(null);
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      const lower = (text || "").toLowerCase();
      let reply: string;
      if (file) {
        reply = `I've received "${file.name}" (${file.size}). I'm parsing the document now...\n\nExtracted key sections:\n• Regulatory requirements and compliance rules\n• Rate tables and calculation references\n• Historical change log\n\nI've cross-referenced this with the existing requirements. 2 requirements (R1, R3) reference data that appears in this document. Would you like me to update their source references?`;
      } else if (lower.includes("add") && lower.includes("requirement")) {
        reply = "Added as R6. You'll see it in the list.";
        setReqs((prev) => [...prev, {
          id: "R6", title: text.replace(/add\s*(a\s*)?requirement\s*/i, "").trim() || "Custom requirement", dot: "#fcd34d", confidence: 70,
          description: "User-defined requirement added via chat.", source: "User input", tags: ["custom"],
          tasks: [], discussion: [],
        }]);
      } else if (lower.includes("summary")) {
        reply = `${reqs.length} requirements (${builtCount} built, ${blockedCount} blocked) · ${totalTasks} tasks · Trust coverage: 71% · Key blocker: Fujitsu runtime (R5)`;
      } else {
        reply = "Based on the analysis, I'd suggest reviewing R3 and R5 — those are the highest-risk items. Would you like me to explain either one in detail?";
      }
      setMessages((m) => [...m, { sender: "bloc", time: "now", text: reply }]);
    }, file ? 1500 : 1000);
  }, [input, pendingFile, totalTasks, reviewCount, builtCount, blockedCount, reqs.length]);

  const focusChatReply = (reqId: string) => {
    setInput(`Re: ${reqId} — `);
    setChatOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const addRequirement = useCallback(() => {
    if (!newReqTitle.trim()) return;
    const id = `R${reqs.length + 1}`;
    setReqs((prev) => [...prev, {
      id, title: newReqTitle.trim(), dot: "#fcd34d", confidence: 70,
      description: newReqDesc.trim() || "User-defined requirement.", source: "Manual", tags: ["custom"],
      tasks: [], discussion: [],
    }]);
    setNewReqTitle(""); setNewReqDesc(""); setShowAddReq(false);
    setMessages((m) => [...m, { sender: "bloc", time: "just now", text: `${id} "${newReqTitle.trim()}" added to requirements.` }]);
  }, [newReqTitle, newReqDesc, reqs.length]);

  const addTask = useCallback((reqId: string) => {
    if (!newTaskName.trim()) return;
    setReqs((prev) => prev.map((r) => r.id === reqId ? {
      ...r, tasks: [...r.tasks, { status: "ready" as TaskStatus, name: newTaskName.trim(), severity: "Medium", severityColor: "#a1a1aa" }]
    } : r));
    setNewTaskName(""); setAddingTaskFor(null);
  }, [newTaskName]);

  const getCollapsedBuildLabel = (reqId: string): { text: string; color: string } | null => {
    const r = buildResult[reqId];
    if (!r) return null;
    if (r === "success" || r === "risky-accepted") return { text: "Built ✓", color: "#6ee7b7" };
    if (r === "blocked") return { text: "Blocked", color: "#fca5a5" };
    if (r === "risky-rejected") return { text: "Rejected", color: "#71717a" };
    return null;
  };

  const getUpdatedDot = (r: Requirement): string => {
    const br = buildResult[r.id];
    if (!br) return r.dot;
    if (br === "success" || br === "risky-accepted") return "#6ee7b7";
    if (br === "blocked") return "#fca5a5";
    return r.dot;
  };

  const getBuildBarColor = (reqId: string): string | null => {
    const br = buildResult[reqId];
    if (!br) return null;
    if (br === "success" || br === "risky-accepted") return "#6ee7b7";
    if (br === "blocked") return "#fca5a5";
    return null;
  };

  /* ─── Build section renderer ─── */
  const renderBuildSection = (r: Requirement) => {
    const phase = buildPhase[r.id] || "idle";
    const result = buildResult[r.id];
    const hasAmber = r.dot === "#fcd34d";

    if (phase === "idle") {
      return (
        <div className="mt-4">
          <button
            onClick={() => startBuild(r.id)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-[13px] font-medium transition-all relative"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#a1a1aa",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(129,140,248,0.08)";
              e.currentTarget.style.borderColor = "rgba(129,140,248,0.15)";
              e.currentTarget.style.color = "#c7d2fe";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
              e.currentTarget.style.color = "#a1a1aa";
            }}
          >
            <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
            Approve & build
            {hasAmber && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full" style={{ background: "#fcd34d" }} title="Has unreviewed items — you can still build" />
            )}
          </button>
        </div>
      );
    }

    if (phase === "migrating") {
      const step = buildStep[r.id] || 0;
      const progress = buildProgress[r.id] || 0;
      return (
        <div className="mt-4 rounded-lg p-3.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#818cf8" }} strokeWidth={1.5} />
            <span className="text-[13px]" style={{ color: "#a1a1aa" }}>Rewriting...</span>
          </div>
          <div className="w-full h-0.5 rounded-full mb-2" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "#818cf8", transition: "none" }} />
          </div>
          <div className="text-[12px]" style={{ color: "#52525b" }}>{migrationSteps[step]}</div>
        </div>
      );
    }

    // Phase === "done"
    const data = buildResults[r.id];
    if (!data) return null;

    const isExpanded = detailOpen[r.id] || false;
    const effectiveResult = result;

    const bg = effectiveResult === "success" || effectiveResult === "risky-accepted"
      ? { bg: "rgba(110,231,183,0.03)", border: "rgba(110,231,183,0.08)" }
      : effectiveResult === "blocked"
        ? { bg: "rgba(252,165,165,0.03)", border: "rgba(252,165,165,0.08)" }
        : effectiveResult === "risky-rejected"
          ? { bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.06)" }
          : { bg: "rgba(252,211,77,0.03)", border: "rgba(252,211,77,0.08)" };

    const icon = effectiveResult === "success" || effectiveResult === "risky-accepted"
      ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />
      : effectiveResult === "blocked"
        ? <XCircle className="w-4 h-4 shrink-0" style={{ color: "#fca5a5" }} strokeWidth={1.5} />
        : effectiveResult === "risky-rejected"
          ? <X className="w-4 h-4 shrink-0" style={{ color: "#71717a" }} strokeWidth={1.5} />
          : <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#fcd34d" }} strokeWidth={1.5} />;

    const mainText = effectiveResult === "risky-accepted"
      ? "Migration approved — 85.7% preserved, drift accepted"
      : effectiveResult === "risky-rejected"
        ? "Migration rejected — revert to legacy"
        : data.text;

    const rightColor = effectiveResult === "success" || effectiveResult === "risky-accepted" ? "#6ee7b7"
      : effectiveResult === "blocked" ? "#fca5a5"
        : effectiveResult === "risky-rejected" ? "#71717a"
          : "#fcd34d";

    const rightLabel = effectiveResult === "risky-accepted" ? "Accepted" : effectiveResult === "risky-rejected" ? "Rejected" : data.rightText;

    return (
      <div className="mt-4 rounded-lg overflow-hidden transition-all" style={{ background: bg.bg, border: `1px solid ${bg.border}`, transitionDuration: "0.2s" }}>
        {/* Result row */}
        <div
          className="flex items-center justify-between px-4 py-3.5 cursor-pointer"
          onClick={() => setDetailOpen((p) => ({ ...p, [r.id]: !p[r.id] }))}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <span className="text-[13px] truncate" style={{ color: "#a1a1aa" }}>{mainText}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-[12px]" style={{ color: rightColor }}>{rightLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: "#52525b", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }} strokeWidth={1.5} />
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="px-4 pb-3.5 animate-fade-in" style={{ maxHeight: 240, overflowY: "auto" }}>
            {(effectiveResult === "success" || effectiveResult === "risky-accepted") && data.type === "success" && (
              <>
                <div className="font-mono text-[12px] mb-2" style={{ color: "#71717a" }}>{data.stats}</div>
                <div className="text-[12px] mb-2" style={{ color: "#6ee7b7" }}>No behavioral drifts detected.</div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px]" style={{ color: "#71717a" }}>Rollback:</span>
                  <code className="font-mono text-[11px] px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#a1a1aa" }}>git stash pop</code>
                  <button
                    className="p-0.5 transition-colors"
                    style={{ color: "#52525b", background: "none", border: "none", cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText("git stash pop"); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  >
                    {copied ? <Check className="w-3 h-3" style={{ color: "#6ee7b7" }} strokeWidth={1.5} /> : <Copy className="w-3 h-3" strokeWidth={1.5} />}
                  </button>
                </div>
              </>
            )}

            {effectiveResult === "risky" && (
              <>
                <div className="font-mono text-[12px] mb-2" style={{ color: "#71717a" }}>{data.stats}</div>
                <div className="mb-2">
                  <div className="font-mono text-[11px]" style={{ color: "#a1a1aa" }}>test_30day_60day_edge_rates</div>
                  <div className="text-[12px]" style={{ color: "#71717a" }}>Expected: 1.0247 → Actual: 1.0248 (0.0001 delta)</div>
                  <div className="text-[12px]" style={{ color: "#52525b" }}>Floating point precision — below CMS threshold</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost text-[12px]" style={{ color: "#6ee7b7" }} onClick={(e) => { e.stopPropagation(); acceptDrift(r.id); }}>Accept drift</button>
                  <button className="btn-ghost text-[12px]" style={{ color: "#fca5a5" }} onClick={(e) => { e.stopPropagation(); rejectDrift(r.id); }}>Reject</button>
                </div>
              </>
            )}

            {effectiveResult === "risky-accepted" && data.type === "risky" && (
              <>
                <div className="font-mono text-[12px] mb-2" style={{ color: "#71717a" }}>{data.stats}</div>
                <div className="text-[12px] mb-2" style={{ color: "#6ee7b7" }}>Drift accepted — rate precision delta within tolerance.</div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px]" style={{ color: "#71717a" }}>Rollback:</span>
                  <code className="font-mono text-[11px] px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#a1a1aa" }}>git stash pop</code>
                </div>
              </>
            )}

            {effectiveResult === "blocked" && (
              <>
                <div className="text-[12px] mb-1" style={{ color: "#a1a1aa" }}>Blocker: Fujitsu NetCOBOL runtime — 3 APIs have no Python equivalent</div>
                <div className="text-[12px] mb-2" style={{ color: "#52525b" }}>Resolve the blocked task above before this requirement can be migrated.</div>
                <button
                  className="btn-ghost text-[12px]"
                  style={{ color: "#a1a1aa" }}
                  onClick={(e) => { e.stopPropagation(); setBuildPhase((p) => ({ ...p, [r.id]: "idle" })); setBuildResult((p) => { const n = { ...p }; delete n[r.id]; return n; }); }}
                >
                  Retry
                </button>
              </>
            )}

            {effectiveResult === "risky-rejected" && (
              <div className="text-[12px]" style={{ color: "#71717a" }}>Migration reverted. Legacy code preserved.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderChat = (isMobile?: boolean) => (
    <div className={`flex flex-col ${isMobile ? "h-full" : "h-full"}`}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="text-[14px] font-medium text-foreground">B.LOC Assistant</div>
        <div className="text-[11px]" style={{ color: "#52525b" }}>Ask questions, add requirements, discuss migration</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: "rgba(0,0,0,0.05)" }}>
        {messages.map((m, i) => (
          <div key={i}>
            {m.sender === "system" ? (
              <p className="text-center italic text-[11px]" style={{ color: "#52525b" }}>{m.text}</p>
            ) : m.sender === "bloc" ? (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="flex items-center justify-center font-mono text-[9px] font-semibold" style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(129,140,248,0.2)", border: "1px solid rgba(129,140,248,0.15)", color: "#c7d2fe" }}>B.</div>
                  <span className="text-[12px] font-medium" style={{ color: "#818cf8" }}>B.LOC</span>
                  <span className="text-[11px]" style={{ color: "#52525b" }}>· {m.time}</span>
                </div>
                <div className="text-[12px] leading-relaxed whitespace-pre-line ml-8" style={{ color: "#a1a1aa" }}>
                  {m.text.split(/(\b\d+\.?\d*%?\b)/g).map((part, j) =>
                    /^\d+\.?\d*%?$/.test(part) ? <span key={j} className="font-mono">{part}</span> : part
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium" style={{ background: "#60a5fa", color: "#fff" }}>Y</div>
                  <span className="text-[12px] font-medium" style={{ color: "#60a5fa" }}>You</span>
                  <span className="text-[11px]" style={{ color: "#52525b" }}>· {m.time}</span>
                </div>
                <div className="text-[12px] leading-relaxed ml-8" style={{ color: "#a1a1aa" }}>{m.text}</div>
                {m.attachment && (
                  <div className="ml-8 mt-1.5 inline-flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <FileText className="w-4 h-4 shrink-0" style={{ color: "#818cf8" }} strokeWidth={1.5} />
                    <div>
                      <div className="text-[12px] font-medium" style={{ color: "#a1a1aa" }}>{m.attachment.name}</div>
                      <div className="text-[10px]" style={{ color: "#52525b" }}>{m.attachment.size} · PDF</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div className="flex items-center gap-1 ml-8 py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: "#71717a", animation: `typingDot 1s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="flex gap-1.5 px-4 pt-2 pb-1 overflow-x-auto">
        {["+ Add requirement", "? Explain", "Summary", "Search memory"].map((pill) => (
          <button key={pill} className="glass-pill px-2.5 py-1 font-mono text-[10px] shrink-0 transition-colors" style={{ color: "#71717a" }}
            onClick={() => { setInput(pill.replace(/^[+?]\s*/, "")); inputRef.current?.focus(); }}
          >{pill}</button>
        ))}
      </div>
      <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {pendingFile && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg" style={{ background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.12)" }}>
            <FileText className="w-4 h-4 shrink-0" style={{ color: "#818cf8" }} strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium truncate" style={{ color: "#a1a1aa" }}>{pendingFile.name}</div>
              <div className="text-[10px]" style={{ color: "#52525b" }}>{pendingFile.size} · PDF</div>
            </div>
            <button onClick={() => setPendingFile(null)} className="shrink-0 p-0.5 rounded transition-colors" style={{ color: "#52525b" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        )}
        <div className="relative flex items-end gap-1.5">
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-colors mb-0.5"
            style={{ color: "#52525b" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
            title="Upload PDF document"
          >
            <Paperclip className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask a question or add a requirement..."
              className="glass-input w-full py-3 pl-3.5 pr-11 text-[13px] text-foreground placeholder:text-muted-foreground resize-none"
              style={{ minHeight: 44, maxHeight: 100, borderRadius: 10 }}
              rows={1}
            />
            {(input.trim() || pendingFile) && (
              <button
                onClick={sendMessage}
                className="absolute right-2 bottom-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "#818cf8" }}
              >
                <ArrowUp className="w-3.5 h-3.5 text-white" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Requirements */}
        <div className="w-[58%] overflow-y-auto p-6 max-lg:w-full">
          <h1 className="text-[20px] font-medium text-foreground mb-1">Requirements</h1>
          <p className="text-[13px] mb-2" style={{ color: "#a1a1aa" }}>Review AI-extracted requirements. Discuss with agents. Approve to begin migration.</p>
          <p className="font-mono text-[12px] mb-5" style={{ color: "#71717a" }}>
            {headerStats()}
          </p>

          <div className="space-y-2">
            {reqs.map((r) => {
              const isOpen = expanded === r.id;
              const buildLabel = getCollapsedBuildLabel(r.id);
              const dot = getUpdatedDot(r);
              const buildBar = getBuildBarColor(r.id);

              return (
                <div key={r.id} className="glass glass-hover" style={{ padding: isOpen ? 20 : "12px 20px", transition: "padding 0.2s ease" }}>
                  {/* Header row */}
                  <div className="cursor-pointer" onClick={() => setExpanded(isOpen ? "" : r.id)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 relative" style={{ background: dot }}>
                          {(buildResult[r.id] === "success" || buildResult[r.id] === "risky-accepted") && (
                            <Check className="absolute -top-0.5 -right-0.5 w-2 h-2" style={{ color: "#6ee7b7" }} strokeWidth={3} />
                          )}
                        </div>
                        <span className="font-mono text-[12px]" style={{ color: "#818cf8" }}>{r.id}</span>
                        <span className="text-[14px] font-medium text-foreground">{r.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px]" style={{ color: "#52525b" }}>{r.tasks.length} tasks</span>
                        {buildLabel && (
                          <span className="text-[11px]" style={{ color: buildLabel.color }}>{buildLabel.text}</span>
                        )}
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: "#52525b", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }} strokeWidth={1.5} />
                      </div>
                    </div>
                    {!isOpen && (
                      <p className="text-[13px] mt-1 truncate" style={{ color: "#71717a" }}>{r.description}</p>
                    )}
                    {/* Confidence bar */}
                    <div className="mt-2 w-full h-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${r.confidence}%`, background: confColor(r.confidence), transitionDuration: "0.6s" }} />
                    </div>
                    {/* Build progress bar */}
                    {buildBar && (
                      <div className="mt-px w-full h-px rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="h-full rounded-full" style={{ width: "100%", background: buildBar }} />
                      </div>
                    )}
                  </div>

                  {/* Expanded content */}
                  {isOpen && (
                    <div className="mt-4 space-y-4 animate-fade-in">
                      <p className="text-[13px] leading-relaxed" style={{ color: "#a1a1aa" }}>{r.description}</p>
                      <div className="text-[11px] space-y-0.5" style={{ color: "#52525b" }}>
                        <div>Source: <span className="font-mono">{r.source}</span></div>
                        <div>Confidence: <span style={{ color: confColor(r.confidence) }}>{r.confidence}%</span></div>
                        <div>Tags: {r.tags.join(" · ")}</div>
                      </div>

                      <div>
                        <div className="text-[12px] font-medium mb-2" style={{ color: "#71717a" }}>Tasks</div>
                        <div className="space-y-0.5">
                          {r.tasks.map((t, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between h-9 px-2 rounded transition-colors"
                              style={{ background: t.flash ? "rgba(129,140,248,0.06)" : "transparent" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = t.flash ? "rgba(129,140,248,0.06)" : "transparent")}
                            >
                              <div className="flex items-center gap-2">
                                {statusIcon(t.status)}
                                <span className="text-[13px]" style={{ color: "#a1a1aa" }}>{t.name}</span>
                              </div>
                              <span className="text-[12px]" style={{ color: t.severityColor }}>{t.severity}</span>
                            </div>
                          ))}
                          {/* Add Task button */}
                          {addingTaskFor === r.id ? (
                            <div className="flex items-center gap-2 mt-1.5">
                              <input
                                autoFocus
                                value={newTaskName}
                                onChange={(e) => setNewTaskName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") addTask(r.id); if (e.key === "Escape") { setAddingTaskFor(null); setNewTaskName(""); } }}
                                placeholder="Task name..."
                                className="flex-1 text-[13px] px-2 py-1.5 rounded-lg outline-none"
                                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
                              />
                              <button onClick={() => addTask(r.id)} className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors" style={{ background: "rgba(129,140,248,0.15)", color: "#c7d2fe", border: "1px solid rgba(129,140,248,0.2)" }}>Add</button>
                              <button onClick={() => { setAddingTaskFor(null); setNewTaskName(""); }} className="text-[11px] px-2 py-1.5" style={{ color: "#52525b" }}>Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAddingTaskFor(r.id); setNewTaskName(""); }}
                              className="flex items-center gap-1.5 text-[12px] mt-1.5 px-2 py-1.5 rounded-lg transition-all"
                              style={{ color: "#52525b", background: "transparent" }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.color = "#a1a1aa"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#52525b"; }}
                            >
                              <Plus className="w-3 h-3" strokeWidth={1.5} /> Add task
                            </button>
                          )}
                        </div>
                      </div>

                      {r.discussion.length > 0 && (
                        <div>
                          <div className="text-[12px] font-medium mb-2" style={{ color: "#71717a" }}>
                            Agent discussion <span style={{ color: "#52525b" }}>· {r.discussion.length}</span>
                          </div>
                          <div className="rounded-lg p-3.5 space-y-2 overflow-y-auto" style={{ background: "rgba(0,0,0,0.1)", maxHeight: 200 }}>
                            {r.discussion.map((msg, i) => (
                              <div key={i} className="pl-3" style={{ borderLeft: `2px solid ${msg.color}33` }}>
                                <div className="flex items-center gap-1">
                                  <span className="text-[12px] font-medium" style={{ color: msg.color }}>{msg.agent}</span>
                                  <span className="text-[11px]" style={{ color: "#52525b" }}>· {msg.time}</span>
                                </div>
                                <p className="text-[12px] leading-relaxed" style={{ color: "#a1a1aa" }}>{msg.text}</p>
                              </div>
                            ))}
                          </div>
                          <button
                            className="text-[11px] mt-1.5 transition-colors"
                            style={{ color: "#71717a", background: "none", border: "none", cursor: "pointer" }}
                            onClick={() => focusChatReply(r.id)}
                          >
                            Reply in chat →
                          </button>
                        </div>
                      )}

                      {/* Build section */}
                      {renderBuildSection(r)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Requirement */}
          {showAddReq ? (
            <div className="mt-3 rounded-xl p-4 space-y-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <input
                autoFocus
                value={newReqTitle}
                onChange={(e) => setNewReqTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setShowAddReq(false); setNewReqTitle(""); setNewReqDesc(""); } }}
                placeholder="Requirement title..."
                className="w-full text-[13px] px-3 py-2 rounded-lg outline-none"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
              />
              <textarea
                value={newReqDesc}
                onChange={(e) => setNewReqDesc(e.target.value)}
                placeholder="Description (optional)..."
                className="w-full text-[13px] px-3 py-2 rounded-lg outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
                rows={2}
              />
              <div className="flex gap-2">
                <button onClick={addRequirement} className="text-[12px] px-4 py-2 rounded-lg font-medium transition-colors" style={{ background: "rgba(129,140,248,0.15)", color: "#c7d2fe", border: "1px solid rgba(129,140,248,0.2)" }}>Add requirement</button>
                <button onClick={() => { setShowAddReq(false); setNewReqTitle(""); setNewReqDesc(""); }} className="text-[12px] px-3 py-2" style={{ color: "#52525b" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddReq(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] transition-all"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", color: "#52525b" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(129,140,248,0.2)"; e.currentTarget.style.color = "#a1a1aa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#52525b"; }}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Add requirement
            </button>
          )}

          {/* Footer */}
          <div className="text-center mt-8 mb-4">
            <p className="text-[12px]" style={{ color: "#52525b" }}>Build requirements individually or ask the assistant for help.</p>
          </div>
        </div>

        {/* Right: Chat (desktop) */}
        <div className="w-[42%] max-lg:hidden" style={{ borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
          {renderChat()}
        </div>
      </div>

      {/* Mobile chat FAB */}
      <div className="lg:hidden">
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="fixed bottom-6 right-4 w-12 h-12 rounded-full flex items-center justify-center z-40"
          style={{ background: "#818cf8" }}
        >
          <MessageSquare className="w-5 h-5 text-white" strokeWidth={1.5} />
        </button>
        {chatOpen && (
          <>
            <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setChatOpen(false)} />
            <div className="fixed right-0 top-12 bottom-0 w-[380px] max-w-[90vw] z-50 animate-slide-in-right" style={{ background: "rgba(9,9,11,0.95)", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
              {renderChat(true)}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Tab2Requirements;

import { useState } from "react";
import { Check, RotateCw, ChevronDown, ChevronRight, Plus, X } from "lucide-react";

interface Requirement {
  id: string;
  title: string;
  description: string;
  source: string;
  confidence: number | "Manual";
  tags: string[];
  linkedTasks?: number[];
  verified: boolean;
  agentDiscussion?: string;
  expandedDiscussion?: { agent: string; color: string; text: string }[];
  hasBlockedLink?: boolean;
}

const initialReqs: Requirement[] = [
  {
    id: "R1", title: "Accurate Medicare PPS Payment Estimation",
    description: "The system shall accurately calculate and estimate Medicare Prospective Payment System (PPS) payments for various claim types and periods, replicating the logic of the legacy PC-Pricer system.",
    source: "HH-PPS-PRICER.cbl, ESRD-PPS-PRICER.cbl", confidence: 89,
    tags: ["medicare", "payment", "critical-path"], linkedTasks: [6, 7], verified: true,
    agentDiscussion: "Scanner + QA confirmed calculation paths",
  },
  {
    id: "R2", title: "Support for Multiple PPS Pricer Types",
    description: "The system shall support different PPS pricers, including Home Health (HH) PPS and End Stage Renal Disease (ESRD) PPS, ensuring calculations are specific to each program's rules and regulations.",
    source: "PPS-CALC/ module", confidence: 94,
    tags: ["medicare", "multi-program"], linkedTasks: [6, 7], verified: true,
  },
  {
    id: "R3", title: "Historical Claims Processing",
    description: "The system shall be capable of processing claims for different calendar years and date ranges (e.g., 30-day and 60-day versions), maintaining historical accuracy as per the legacy PC-Pricer archive.",
    source: "CLAIM-INPUT.cbl, DATE-CALC.cbl", confidence: 76,
    tags: ["historical", "date-logic", "needs-verification"], linkedTasks: [5, 14], verified: false,
    agentDiscussion: "QA flagged 3 edge cases in 30-day vs 60-day logic",
    expandedDiscussion: [
      { agent: "QA Agent", color: "#fbbf24", text: "30-day and 60-day claim logic uses different date boundaries. Edge cases at year transitions may produce different results." },
      { agent: "Scanner Agent", color: "#22d3ee", text: "DATE-CALC.cbl line 87 has a hardcoded fiscal year boundary — this must be configurable." },
    ],
  },
  {
    id: "R4", title: "Claim Data Input and Payment Output",
    description: "The system shall provide a mechanism for users to input claim-related data and receive estimated Medicare PPS payment outputs.",
    source: "CLAIM-INPUT.cbl, PAYMENT-OUTPUT.cbl", confidence: 91,
    tags: ["i/o", "user-facing"], verified: true,
  },
  {
    id: "R5", title: "Modernized Runtime Environment",
    description: "The new system shall eliminate the dependency on legacy COBOL and Fujitsu NetCOBOL runtime files, operating within a modern and supportable software environment.",
    source: "FUJITSU-BRIDGE.cbl, ENV-CONFIG.cbl", confidence: 97,
    tags: ["infrastructure", "runtime", "blocking"], linkedTasks: [1, 2, 11], verified: false,
    hasBlockedLink: true,
    agentDiscussion: "3 Fujitsu APIs have no direct modern equivalent — architect decision needed",
    expandedDiscussion: [
      { agent: "Scanner Agent", color: "#22d3ee", text: "FUJITSU-BRIDGE.cbl uses 3 proprietary APIs (JMPCINT3, COBDPINF, COBRTNCD) with no public documentation." },
      { agent: "QA Agent", color: "#fbbf24", text: "Architect must decide: wrapper pattern, full rewrite, or vendor consultation." },
      { agent: "Writer Agent", color: "#a78bfa", text: "Documented all 23 Fujitsu API calls with their inferred purpose based on context." },
    ],
  },
  {
    id: "R6", title: "Preserve Rounding Behavior for Financial Accuracy",
    description: "All payment calculations must continue to use ROUND_HALF_UP rounding mode as implemented in the legacy system. Any change to rounding behavior must be explicitly approved.",
    source: "payment/rounding.py:34", confidence: 92,
    tags: ["financial", "critical-path", "rounding"], linkedTasks: [4, 10], verified: false,
    agentDiscussion: "4 agents discussed — see Task #4 thread for full context",
  },
];

const confBarColor = (c: number | "Manual") => {
  if (c === "Manual") return "#a78bfa";
  if (c >= 90) return "#34d399";
  if (c >= 80) return "#fbbf24";
  return "#fb923c";
};

const confAccent = (c: number | "Manual") => {
  if (c === "Manual") return "#a78bfa";
  if (typeof c === "number" && c >= 90) return "#34d399";
  if (typeof c === "number" && c >= 80) return "#fbbf24";
  return "#fb923c";
};

interface RequirementsPanelV2Props {
  hoveredTaskReqs: string[] | null;
  onHoverReq: (reqId: string | null) => void;
  onClickLinkedTask: (taskId: number) => void;
}

const RequirementsPanelV2 = ({ hoveredTaskReqs, onHoverReq, onClickLinkedTask }: RequirementsPanelV2Props) => {
  const [reqs, setReqs] = useState(initialReqs);
  const [expandedDisc, setExpandedDisc] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTags, setNewTags] = useState("");

  const toggleVerified = (id: string) => setReqs(prev => prev.map(r => r.id === id ? { ...r, verified: !r.verified } : r));

  const verifiedCount = reqs.filter(r => r.verified).length;
  const reviewCount = reqs.length - verifiedCount;

  const addRequirement = () => {
    if (!newTitle.trim()) return;
    const newReq: Requirement = {
      id: `R${reqs.length + 1}`,
      title: newTitle.trim(),
      description: newDesc.trim(),
      source: "Added by you",
      confidence: "Manual",
      tags: newTags.split(",").map(t => t.trim()).filter(Boolean),
      verified: true,
    };
    setReqs(prev => [...prev, newReq]);
    setNewTitle(""); setNewDesc(""); setNewTags("");
    setShowAddForm(false);
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="font-mono text-[11px] uppercase tracking-[2px] mb-1" style={{ color: "#64748b" }}>
        Behavioral Requirements
      </h3>
      <p className="text-[11px] mb-3" style={{ color: "#475569" }}>AI-extracted requirements that migration must preserve</p>
      <p className="text-[11px] mb-3" style={{ color: "#64748b" }}>
        {reqs.length} requirements · <span style={{ color: "#34d399" }}>{verifiedCount} verified</span> · <span style={{ color: "#fbbf24" }}>{reviewCount} under review</span>
      </p>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0" style={{ maskImage: "linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 8px), transparent 100%)" }}>
        {reqs.map(req => {
          const highlighted = hoveredTaskReqs?.includes(req.id);
          const accent = confAccent(req.confidence);
          const isDiscExpanded = expandedDisc === req.id;

          return (
            <div
              key={req.id}
              className="transition-all duration-300"
              style={{
                borderRadius: "14px",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${highlighted ? "rgba(167,139,250,0.3)" : req.hasBlockedLink ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.06)"}`,
                backdropFilter: "blur(24px) saturate(1.4)",
                boxShadow: highlighted ? "0 0 16px rgba(167,139,250,0.15), 0 8px 32px rgba(0,0,0,0.3)" : req.hasBlockedLink ? "0 0 12px rgba(251,191,36,0.08), 0 8px 32px rgba(0,0,0,0.3)" : "0 8px 32px rgba(0,0,0,0.3)",
                padding: "18px",
              }}
              onMouseEnter={() => onHoverReq(req.id)}
              onMouseLeave={() => onHoverReq(null)}
            >
              {/* Top accent */}
              <div className="h-[3px] rounded-full mb-3 -mt-1" style={{ background: accent, opacity: 0.6 }} />

              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[12px] font-bold shrink-0" style={{ color: "#a78bfa" }}>{req.id}</span>
                <button
                  onClick={() => toggleVerified(req.id)}
                  className="text-[10px] px-2 py-0.5 rounded-full transition-all shrink-0 flex items-center gap-1"
                  style={{
                    background: req.verified ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.15)",
                    color: req.verified ? "#4ade80" : "#fbbf24",
                    border: `1px solid ${req.verified ? "rgba(34,197,94,0.2)" : "rgba(251,191,36,0.2)"}`,
                  }}
                >
                  {req.verified ? <><Check className="w-3 h-3" /> Verified</> : <><RotateCw className="w-3 h-3" /> Under Review</>}
                </button>
              </div>

              <p className="text-[13px] font-semibold mt-1" style={{ color: "#e2e8f0" }}>{req.title}</p>
              <p className="text-[12px] leading-relaxed mt-1.5" style={{ color: "#cbd5e1" }}>{req.description}</p>

              <p className="font-mono text-[10px] mt-2" style={{ color: "#64748b", textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.1)" }}>
                Source: {req.source}
              </p>

              {/* Confidence */}
              {req.confidence !== "Manual" ? (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="h-full rounded-full" style={{ width: `${req.confidence}%`, background: confBarColor(req.confidence) }} />
                  </div>
                  <span className="font-mono text-[10px]" style={{ color: "#64748b" }}>{req.confidence}%</span>
                </div>
              ) : (
                <p className="text-[10px] mt-2 font-mono" style={{ color: "#a78bfa" }}>Manual</p>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mt-2">
                {req.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Linked tasks */}
              {req.linkedTasks && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px]" style={{ color: "#475569" }}>Linked:</span>
                  {req.linkedTasks.map(tid => (
                    <button
                      key={tid}
                      onClick={() => onClickLinkedTask(tid)}
                      className="text-[10px] px-2 py-0.5 rounded-full transition-all hover:border-violet-400/40"
                      style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.2)" }}
                    >
                      Task #{tid}
                    </button>
                  ))}
                </div>
              )}

              {/* Agent discussion */}
              {req.agentDiscussion && (
                <button
                  className="text-[10px] mt-2 flex items-center gap-1 transition-colors"
                  style={{ color: "#64748b" }}
                  onClick={() => setExpandedDisc(isDiscExpanded ? null : req.id)}
                >
                  💬 {req.agentDiscussion}
                  {req.expandedDiscussion && (isDiscExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
                </button>
              )}
              {isDiscExpanded && req.expandedDiscussion && (
                <div className="mt-2 space-y-1.5 pl-2 border-l" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {req.expandedDiscussion.map((d, i) => (
                    <div key={i} className="text-[10px] leading-relaxed">
                      <span className="font-bold" style={{ color: d.color }}>{d.agent}:</span>{" "}
                      <span style={{ color: "#94a3b8" }}>{d.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Add requirement */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full text-[12px] py-3 rounded-[14px] flex items-center justify-center gap-2 transition-all"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", color: "#64748b" }}
          >
            <Plus className="w-3.5 h-3.5" /> Add Requirement
          </button>
        ) : (
          <div className="rounded-[14px] p-4 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              className="w-full text-[12px] p-2 rounded-lg outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
              placeholder="Requirement title..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
            />
            <textarea
              className="w-full text-[12px] p-2 rounded-lg outline-none resize-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
              placeholder="Describe the behavioral requirement..."
              rows={3}
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
            <input
              className="w-full text-[12px] p-2 rounded-lg outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
              placeholder="Add tags separated by commas..."
              value={newTags}
              onChange={e => setNewTags(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={addRequirement} className="text-[11px] px-4 py-1.5 rounded-lg font-medium" style={{ background: "#a78bfa", color: "white" }}>Save</button>
              <button onClick={() => setShowAddForm(false)} className="text-[11px] px-3 py-1.5" style={{ color: "#64748b" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RequirementsPanelV2;

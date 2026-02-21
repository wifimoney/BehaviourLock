import { useState } from "react";
import { Check, RotateCw } from "lucide-react";

interface Requirement {
  id: string;
  text: string;
  source: string;
  confidence: number;
  tags: string[];
  relatedTasks?: string[];
}

const requirements: Requirement[] = [
  {
    id: "REQ-001",
    text: "Order total calculation must use banker's rounding (HALF_UP) for all payment amounts",
    source: "payment/rounding.py line 34",
    confidence: 92,
    tags: ["financial", "critical-path"],
    relatedTasks: ["t4"],
  },
  {
    id: "REQ-002",
    text: "Email notifications must be sent after every successful order insertion",
    source: "notifications/email.py line 12",
    confidence: 88,
    tags: ["side-effect", "business-rule"],
  },
  {
    id: "REQ-003",
    text: "Input validation rejects orders with missing 'id' field",
    source: "order_processing/validators.py line 8",
    confidence: 95,
    tags: ["validation", "api-contract"],
    relatedTasks: ["t1"],
  },
  {
    id: "REQ-004",
    text: "Database insertions log to file before committing",
    source: "database/queries.py line 45",
    confidence: 78,
    tags: ["audit", "side-effect"],
    relatedTasks: ["t6"],
  },
  {
    id: "REQ-005",
    text: "Discount calculations cap at 50% maximum",
    source: "order_processing/calculator.py line 22",
    confidence: 85,
    tags: ["business-rule", "constraint"],
    relatedTasks: ["t4"],
  },
  {
    id: "REQ-006",
    text: "Auth tokens expire after 24 hours",
    source: "auth/tokens.py line 15",
    confidence: 91,
    tags: ["security", "business-rule"],
  },
];

const confClass = (c: number) => {
  if (c >= 90) return "conf-high";
  if (c >= 80) return "conf-mid";
  return "conf-low";
};

const confBarColor = (c: number) => {
  if (c >= 90) return "rgba(52, 211, 153, 0.7)";
  if (c >= 80) return "rgba(251, 191, 36, 0.7)";
  return "rgba(251, 146, 60, 0.7)";
};

interface RequirementsPanelProps {
  hoveredTaskReqs: string[] | null;
  onHoverReq: (reqId: string | null) => void;
}

const RequirementsPanel = ({ hoveredTaskReqs, onHoverReq }: RequirementsPanelProps) => {
  const [verified, setVerified] = useState<Record<string, boolean>>({});

  const toggleVerified = (id: string) => setVerified((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="flex flex-col h-full">
      <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
        📝 Behavioral Requirements
      </h3>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {requirements.map((req) => {
          const isVerified = verified[req.id];
          const highlighted = hoveredTaskReqs?.includes(req.id);

          return (
            <div
              key={req.id}
              className={`glass ${confClass(req.confidence)} ${highlighted ? "highlight-glow" : ""}`}
              style={{
                borderRadius: "16px",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={() => onHoverReq(req.id)}
              onMouseLeave={() => onHoverReq(null)}
            >
              <div className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-violet-400 shrink-0">{req.id}</span>
                  <button
                    onClick={() => toggleVerified(req.id)}
                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-all duration-200 shrink-0 ${
                      isVerified
                        ? "pill-green"
                        : "pill-amber"
                    }`}
                  >
                    {isVerified ? (
                      <><Check className="w-3 h-3" /> Verified</>
                    ) : (
                      <><RotateCw className="w-3 h-3" /> Needs Review</>
                    )}
                  </button>
                </div>

                {/* Text */}
                <p className="text-sm text-foreground/85 leading-relaxed">{req.text}</p>

                {/* Source */}
                <p className="font-mono text-[11px] text-muted-foreground/70">
                  📍 {req.source}
                </p>

                {/* Confidence bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Confidence</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${req.confidence}%`,
                        background: confBarColor(req.confidence),
                      }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-foreground/60">{req.confidence}%</span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {req.tags.map((tag) => (
                    <span key={tag} className="pill-muted text-[10px] px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RequirementsPanel;

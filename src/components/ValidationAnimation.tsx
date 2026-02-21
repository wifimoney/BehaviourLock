import { useState, useEffect } from "react";
import { Check, X, AlertTriangle, FlaskConical, Loader2 } from "lucide-react";

interface TestLine {
  name: string;
  time: string;
  status: "pass" | "fail" | "warn";
}

const tests: TestLine[] = [
  { name: "test_process_order_basic_0", time: "45ms", status: "pass" },
  { name: "test_process_order_edge_cases_1", time: "38ms", status: "pass" },
  { name: "test_calc_total_standard_2", time: "52ms", status: "pass" },
  { name: "test_calc_total_discount_3", time: "41ms", status: "pass" },
  { name: "test_validate_claim_30day_4", time: "12ms", status: "pass" },
  { name: "test_validate_claim_60day_5", time: "14ms", status: "pass" },
  { name: "test_rate_lookup_fy2023_6", time: "8ms", status: "pass" },
  { name: "test_rate_lookup_fy2024_7", time: "7ms", status: "pass" },
  { name: "test_env_config_fallback_8", time: "5ms", status: "fail" },
  { name: "test_payment_output_format_9", time: "22ms", status: "pass" },
  { name: "test_round_payment_halfup_10", time: "3ms", status: "pass" },
  { name: "test_error_handling_11", time: "15ms", status: "pass" },
  { name: "test_claim_edge_rates_12", time: "28ms", status: "warn" },
  { name: "test_rate_table_boundary_13", time: "18ms", status: "pass" },
];

interface Props {
  onComplete: () => void;
}

const ValidationAnimation = ({ onComplete }: Props) => {
  const [visibleCount, setVisibleCount] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [collapsing, setCollapsing] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    tests.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), 300 + i * 300));
    });

    const allDone = 300 + tests.length * 300;
    timers.push(setTimeout(() => setShowSummary(true), allDone + 500));
    timers.push(setTimeout(() => setCollapsing(true), allDone + 1500));
    timers.push(setTimeout(() => onComplete(), allDone + 1800));

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const StatusIcon = ({ status }: { status: TestLine["status"] }) => {
    if (status === "pass") return <Check className="w-4 h-4" style={{ color: "#6ee7b7" }} strokeWidth={1.5} />;
    if (status === "fail") return <X className="w-4 h-4" style={{ color: "#fca5a5" }} strokeWidth={1.5} />;
    return <AlertTriangle className="w-4 h-4" style={{ color: "#fcd34d" }} strokeWidth={1.5} />;
  };

  const passed = tests.filter(t => t.status === "pass").length;
  const failed = tests.filter(t => t.status === "fail").length;
  const warned = tests.filter(t => t.status === "warn").length;

  return (
    <div
      className="flex-1 flex items-center justify-center px-6"
      style={{ opacity: collapsing ? 0 : 1, transition: "opacity 0.3s ease", paddingTop: 64, paddingBottom: 24 }}
    >
      <div className="w-full max-w-[560px]">
        <div className="flex items-center gap-2 mb-6">
          <FlaskConical className="w-4 h-4" style={{ color: "#52525b" }} strokeWidth={1.5} />
          <span className="text-[13px]" style={{ color: "#71717a" }}>
            Running characterization tests against migrated code
          </span>
        </div>

        <div className="space-y-0">
          {tests.map((test, i) => {
            if (i >= visibleCount) return null;
            const rowBg =
              test.status === "fail"
                ? "rgba(252,165,165,0.04)"
                : test.status === "warn"
                ? "rgba(252,211,77,0.04)"
                : "transparent";

            return (
              <div
                key={test.name}
                className="flex items-center gap-3 px-3 py-1.5 rounded-md"
                style={{
                  background: rowBg,
                  opacity: 0,
                  animation: "fade-in 0.2s ease forwards",
                }}
              >
                <StatusIcon status={test.status} />
                <span
                  className="font-mono text-[12px] flex-1"
                  style={{ color: test.status !== "pass" ? "#d4d4d8" : "#a1a1aa" }}
                >
                  {test.name}
                </span>
                <span className="font-mono text-[11px]" style={{ color: "#52525b" }}>
                  {test.time}
                </span>
              </div>
            );
          })}
        </div>

        {visibleCount < tests.length && (
          <div className="flex items-center gap-2 mt-4 px-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#71717a" }} strokeWidth={1.5} />
            <span className="text-[12px]" style={{ color: "#52525b" }}>Running...</span>
          </div>
        )}

        {showSummary && (
          <div
            className="mt-5 px-3 font-mono text-[13px]"
            style={{ opacity: 0, animation: "fade-in 0.3s ease forwards" }}
          >
            <span style={{ color: "#71717a" }}>{passed} passed</span>
            <span style={{ color: "#3f3f46" }}> · </span>
            <span style={{ color: "#fca5a5" }}>{failed} failed</span>
            <span style={{ color: "#3f3f46" }}> · </span>
            <span style={{ color: "#fcd34d" }}>{warned} warning</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ValidationAnimation;

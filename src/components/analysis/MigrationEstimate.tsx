import { Target } from "lucide-react";

const MigrationEstimate = () => (
  <div className="glass p-5">
    <div className="flex items-center gap-2 mb-4">
      <Target className="w-4 h-4" style={{ color: "#52525b" }} strokeWidth={1.5} />
      <h3 className="text-[13px] font-medium" style={{ color: "#a1a1aa" }}>Migration estimate</h3>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {[
        {
          value: "4-6",
          label: "weeks estimated",
          sub: "with B.LOC assistance",
          subColor: "#6ee7b7",
          note: "vs 4-6 months manual",
          noteColor: "#fca5a5",
        },
        {
          value: "5",
          label: "requirements extracted",
          sub: "ready for review",
          subColor: "#6ee7b7",
        },
        {
          value: "14",
          label: "migration tasks",
          sub: "3 need human decision",
          subColor: "#fcd34d",
        },
        {
          value: "3",
          label: "past runs",
          sub: "from memory",
          subColor: "#52525b",
        },
      ].map((item) => (
        <div
          key={item.label}
          className="p-3.5 rounded-lg text-center"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <div className="font-mono text-2xl font-medium mb-1">{item.value}</div>
          <div className="text-[11px]" style={{ color: "#52525b" }}>{item.label}</div>
          <div className="text-[10px] mt-0.5" style={{ color: item.subColor }}>{item.sub}</div>
          {item.note && (
            <div className="text-[10px] mt-0.5 line-through" style={{ color: item.noteColor }}>{item.note}</div>
          )}
        </div>
      ))}
    </div>
  </div>
);

export default MigrationEstimate;

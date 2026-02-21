interface HeaderProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
}

const tabs = ["Upload", "Requirements"];

const Header = ({ activeTab, onTabChange }: HeaderProps) => (
  <header
    className="sticky top-0 z-50 flex items-center justify-between"
    style={{
      height: 48,
      padding: "0 20px",
      background: "rgba(9,9,11,0.8)",
      backdropFilter: "blur(16px)",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}
  >
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center font-mono text-xs font-semibold"
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: "rgba(129,140,248,0.2)",
          border: "1px solid rgba(129,140,248,0.15)",
          color: "#c7d2fe",
        }}
      >
        B.
      </div>
      <span className="text-[15px] font-medium text-foreground" style={{ letterSpacing: "0.5px" }}>
        B.LOC
      </span>
    </div>

    <div className="flex items-center gap-1">
      {tabs.map((label, i) => {
        const tabNum = i + 1;
        const isActive = tabNum === activeTab;
        return (
          <button
            key={label}
            onClick={() => onTabChange(tabNum)}
            className="relative px-3 py-1.5 text-[13px] font-medium transition-colors"
            style={{
              color: isActive ? "#fafafa" : "#71717a",
              transitionDuration: "0.15s",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            {label}
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "60%",
                  height: 2,
                  background: "#818cf8",
                  borderRadius: 1,
                }}
              />
            )}
          </button>
        );
      })}
    </div>

    <span className="text-[11px]" style={{ color: "#52525b" }}>
      AI Modernization Copilot
    </span>
  </header>
);

export default Header;

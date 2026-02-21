import { useState, useCallback } from "react";
import ValidationAnimation from "./ValidationAnimation";
import ValidationReport from "./ValidationReport";

const ValidationScreen = () => {
  const [phase, setPhase] = useState<"animating" | "report">("animating");

  const handleAnimationComplete = useCallback(() => {
    setPhase("report");
  }, []);

  if (phase === "animating") {
    return <ValidationAnimation onComplete={handleAnimationComplete} />;
  }

  return <ValidationReport />;
};

export default ValidationScreen;

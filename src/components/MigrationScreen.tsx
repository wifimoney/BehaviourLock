import { useState, useCallback } from "react";
import MigrationAnimation from "./MigrationAnimation";
import MigrationResults from "./MigrationResults";

interface Props {
  onProceed: () => void;
}

const MigrationScreen = ({ onProceed }: Props) => {
  const [phase, setPhase] = useState<"animating" | "results">("animating");

  const handleAnimationComplete = useCallback(() => {
    setPhase("results");
  }, []);

  if (phase === "animating") {
    return <MigrationAnimation onComplete={handleAnimationComplete} />;
  }

  return <MigrationResults onProceed={onProceed} />;
};

export default MigrationScreen;

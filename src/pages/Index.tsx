import { useState, useCallback } from "react";
import MeshBackground from "@/components/MeshBackground";
import Header from "@/components/Header";
import Tab1Upload from "@/components/Tab1Upload";
import Tab2Requirements from "@/components/Tab2Requirements";

const Index = () => {
  const [activeTab, setActiveTab] = useState(1);

  const handleTabChange = useCallback((tab: number) => {
    setActiveTab(tab);
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative">
      <MeshBackground />
      <Header activeTab={activeTab} onTabChange={handleTabChange} />
      {activeTab === 1 && <Tab1Upload onContinue={() => setActiveTab(2)} />}
      {activeTab === 2 && <Tab2Requirements />}
    </div>
  );
};

export default Index;

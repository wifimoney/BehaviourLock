import { useState, useCallback } from "react";
import { Upload, Code2, ArrowRight, Play } from "lucide-react";
import { useSession } from "@/contexts/SessionContext";

interface UploadScreenProps {
  onAnalyze: (repoName: string) => void;
  isAnalyzing: boolean;
}

const UploadScreen = ({ onAnalyze, isAnalyzing }: UploadScreenProps) => {
  const [repoUrl, setRepoUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const { ingestAndRun, seedDemo } = useSession();

  const extractRepoName = (url: string) => {
    const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
    return match ? match[1] : url.split("/").pop() || "unknown-repo";
  };

  const handleAnalyze = async () => {
    if (!repoUrl.trim()) return;
    const repoName = extractRepoName(repoUrl);
    // Fire API calls (falls back gracefully if backend is offline)
    await ingestAndRun(repoUrl.trim());
    onAnalyze(repoName);
  };

  const handleTryDemo = async () => {
    await seedDemo();
    onAnalyze("cms/pc-pricer-legacy");
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        const name = file.name.replace(/\.(zip|tar\.gz|tgz)$/, "");
        await ingestAndRun(name);
        onAnalyze(name);
      }
    },
    [onAnalyze, ingestAndRun]
  );

  const handleFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,.tar.gz,.tgz";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const name = file.name.replace(/\.(zip|tar\.gz|tgz)$/, "");
        await ingestAndRun(name);
        onAnalyze(name);
      }
    };
    input.click();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-4xl mx-auto w-full">
      <h1 className="text-xl font-medium text-center mb-2 text-foreground leading-tight">
        Lock your behavior. Modernize with proof.
      </h1>
      <p className="text-[13px] text-center mb-10" style={{ color: "#71717a" }}>
        Upload your legacy codebase to begin behavioral analysis
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full mb-10">
        {/* GitHub URL */}
        <div className="glass glass-hover p-5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-5">
            <Code2 className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
            <h3 className="text-[13px] font-medium text-foreground">Connect Repository</h3>
          </div>
          <div className="flex-1 flex flex-col gap-3">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              className="glass-input w-full px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            />
            <button
              onClick={handleAnalyze}
              disabled={!repoUrl.trim() || isAnalyzing}
              className="btn-primary px-5 py-2.5 text-[13px] font-medium flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <span className="animate-pulse-glow">Analyzing...</span>
              ) : (
                <>
                  Analyze <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                </>
              )}
            </button>
            <p className="text-[12px]" style={{ color: "#52525b" }}>
              Supports public and private repositories
            </p>
          </div>
        </div>

        {/* Drag & Drop */}
        <div className="glass glass-hover p-5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-5">
            <Upload className="w-4 h-4" style={{ color: "#71717a" }} strokeWidth={1.5} />
            <h3 className="text-[13px] font-medium text-foreground">Upload Files</h3>
          </div>
          <div
            className={`flex-1 dashed-drop-zone flex flex-col items-center justify-center gap-2 p-6 cursor-pointer min-h-[140px] ${
              dragOver ? "drag-over" : ""
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={handleFileSelect}
          >
            <Upload className="w-5 h-5" style={{ color: "#52525b" }} strokeWidth={1.5} />
            <div className="text-center">
              <p className="text-[13px]" style={{ color: "#a1a1aa" }}>Drag & drop your project</p>
              <p className="text-[12px] mt-0.5" style={{ color: "#52525b" }}>or click to browse</p>
            </div>
            <p className="text-[11px] mt-1" style={{ color: "#3f3f46" }}>.zip, .tar.gz, or folder</p>
          </div>
        </div>
      </div>

      {/* Try Demo */}
      <div className="w-full mb-6">
        <button
          onClick={handleTryDemo}
          disabled={isAnalyzing}
          className="glass glass-hover px-4 py-2.5 text-[13px] font-medium flex items-center gap-2 w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          style={{ color: "#a1a1aa", transitionDuration: "0.15s" }}
        >
          <Play className="w-3.5 h-3.5" style={{ color: "#818cf8" }} strokeWidth={1.5} />
          Try Demo
          <span className="text-[11px] font-mono" style={{ color: "#52525b" }}>cms/pc-pricer-legacy</span>
        </button>
      </div>

      {/* Recently analyzed */}
      <div className="w-full">
        <p className="text-[12px] mb-2" style={{ color: "#52525b" }}>Recently analyzed</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { name: "cms/pc-pricer-legacy", lang: "COBOL", runs: 3 },
            { name: "internal/auth-legacy", lang: "Java" },
            { name: "fintech/calc-engine", lang: "COBOL" },
          ].map((repo) => (
            <button
              key={repo.name}
              className="glass-pill px-3 py-1.5 flex items-center gap-2 text-[12px] transition-all shrink-0"
              style={{ color: "#71717a", transitionDuration: "0.15s" }}
              onClick={() => setRepoUrl(repo.name)}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#71717a")}
            >
              <span className="font-mono text-[11px]">{repo.name}</span>
              <span className="text-[10px]" style={{ color: "#52525b" }}>{repo.lang}</span>
              {"runs" in repo && (
                <span className="text-[10px] font-mono" style={{ color: "#3f3f46" }}>{repo.runs} runs</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UploadScreen;

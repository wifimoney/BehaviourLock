import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

interface SessionState {
  sessionId: string | null;
  repoPath: string | null;
  isDemo: boolean;
}

interface SessionContextValue extends SessionState {
  /** POST /ingest/path then POST /run/{session_id} */
  ingestAndRun: (repoPath: string) => Promise<string>;
  /** POST /demo/seed */
  seedDemo: () => Promise<string>;
  setSessionId: (id: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be inside SessionProvider");
  return ctx;
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<SessionState>({
    sessionId: null,
    repoPath: null,
    isDemo: false,
  });

  const ingestAndRun = useCallback(async (repoPath: string): Promise<string> => {
    try {
      // Step 1: POST /ingest/path
      const ingestRes = await fetch(`${API_BASE}/ingest/path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_path: repoPath }),
      });
      const { session_id } = await ingestRes.json();

      // Step 2: POST /run/{session_id} — fire and forget
      fetch(`${API_BASE}/run/${session_id}`, { method: "POST" }).catch(() => {});

      setState({ sessionId: session_id, repoPath, isDemo: false });
      return session_id;
    } catch {
      // Fallback for demo/offline: generate a mock session id
      const mockId = `mock-${Date.now().toString(36)}`;
      setState({ sessionId: mockId, repoPath, isDemo: false });
      return mockId;
    }
  }, []);

  const seedDemo = useCallback(async (): Promise<string> => {
    try {
      const res = await fetch(`${API_BASE}/demo/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "repo_path=./sample_legacy",
      });
      const data = await res.json();
      setState({ sessionId: data.session_id, repoPath: "./sample_legacy", isDemo: true });
      return data.session_id;
    } catch {
      setState({ sessionId: "demo", repoPath: "./sample_legacy", isDemo: true });
      return "demo";
    }
  }, []);

  const setSessionId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, sessionId: id }));
  }, []);

  return (
    <SessionContext.Provider value={{ ...state, ingestAndRun, seedDemo, setSessionId }}>
      {children}
    </SessionContext.Provider>
  );
};

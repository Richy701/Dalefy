import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_DOCS, type ComplianceDoc } from "@/shared/compliance-docs";

const STORAGE_KEY = "daf-compliance";

interface ComplianceContextType {
  docs: ComplianceDoc[];
  ready: boolean;
  pendingCount: number;
  signDoc: (docName: string) => void;
}

const ComplianceContext = createContext<ComplianceContextType>({
  docs: DEFAULT_DOCS,
  ready: false,
  pendingCount: 5,
  signDoc: () => {},
});

export function ComplianceProvider({ children }: { children: ReactNode }) {
  const [docs, setDocs] = useState<ComplianceDoc[]>(DEFAULT_DOCS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as ComplianceDoc[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              // Merge with defaults in case new docs were added
              const merged = DEFAULT_DOCS.map((d) => {
                const saved = parsed.find((p) => p.name === d.name);
                return saved ?? d;
              });
              setDocs(merged);
            }
          } catch {
            /* ignore corrupt data */
          }
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: ComplianceDoc[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const signDoc = useCallback(
    (docName: string) => {
      setDocs((prev) => {
        const next = prev.map((d) =>
          d.name === docName
            ? { ...d, status: "Signed" as const, date: new Date().toISOString() }
            : d,
        );
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const pendingCount = useMemo(() => docs.filter((d) => d.status !== "Signed").length, [docs]);

  const value = useMemo(
    () => ({ docs, ready, pendingCount, signDoc }),
    [docs, ready, pendingCount, signDoc],
  );

  return <ComplianceContext.Provider value={value}>{children}</ComplianceContext.Provider>;
}

export function useCompliance() {
  return useContext(ComplianceContext);
}

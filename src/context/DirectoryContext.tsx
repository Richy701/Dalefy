import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { isFirebaseConfigured } from "@/services/firebase";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE } from "@/config/storageKeys";
import { logger } from "@/lib/logger";
import {
  subscribeDirectoryTravelers, subscribeCompliance, saveDirectoryTraveler, deleteDirectoryTraveler,
  saveCompliance, deleteCompliance, type DirectoryScope,
} from "@/services/firebaseDirectory";
import { DirectoryContext, type Compliance, type DirectoryValue } from "@/context/directory";
import type { User } from "@/types";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The traveller directory and HR compliance. Signed in, they live in Firestore for the whole organisation, so
 * teammates and other computers see the same list; this browser's old copy is imported once. The demo keeps
 * using this browser's storage. Setters work like useState: the change shows at once and is saved behind it.
 */
export function DirectoryProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { currentOrg, isLoading: orgLoading } = useOrg();
  const isDemoUser = authLoading ? false : (!user || user.id === "demo" || (user.id?.length ?? 0) <= 20);
  const cloud = isFirebaseConfigured() && !isDemoUser && !authLoading && !orgLoading && !!user?.id;
  const orgId = currentOrg?.id ?? null;
  const uid = user?.id ?? null;
  const scope = useMemo<DirectoryScope | null>(() => (cloud && uid ? { orgId, uid } : null), [cloud, orgId, uid]);
  const scopeKey = scope ? scope.orgId ?? `u-${scope.uid}` : null;

  // This browser's copy: the whole store in the demo, and the source of the one-time import when signed in
  const [localTravelers, setLocalTravelers] = useLocalStorage<User[]>(STORAGE.CUSTOM_TRAVELERS, []);
  const [localCompliance, setLocalCompliance] = useLocalStorage<Compliance>(STORAGE.COMPLIANCE, {});

  const [cloudTravelers, setCloudTravelers] = useState<User[]>([]);
  const [cloudCompliance, setCloudCompliance] = useState<Compliance>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const travelersRef = useRef<User[]>([]);
  const complianceRef = useRef<Compliance>({});

  useEffect(() => {
    if (!scope) return;
    let gotTravelers = false;
    let gotCompliance = false;
    const ready = () => { if (gotTravelers && gotCompliance) setLoadedFor(scopeKey); };
    const fail = (what: string) => (err: Error) => logger.error("Directory", `${what} listener failed:`, err);
    const offTravelers = subscribeDirectoryTravelers(scope, list => {
      travelersRef.current = list;
      setCloudTravelers(list);
      gotTravelers = true; ready();
    }, fail("travellers"));
    const offCompliance = subscribeCompliance(scope, map => {
      complianceRef.current = map;
      setCloudCompliance(map);
      gotCompliance = true; ready();
    }, fail("compliance"));
    return () => { offTravelers(); offCompliance(); };
  }, [scope, scopeKey]);

  const saveFailed = useCallback((err: unknown) => {
    logger.error("Directory", "save failed:", err);
    toast.error("Couldn't save the traveller directory. Only owners, admins and agents can change it.");
  }, []);

  // One-time import of this browser's directory into the organisation's, keeping anything already there
  useEffect(() => {
    if (!scope || loadedFor !== scopeKey) return;
    const flag = `${STORAGE.CUSTOM_TRAVELERS}:imported:${scopeKey}`;
    if (localStorage.getItem(flag)) return;
    const have = new Set(travelersRef.current.map(t => t.id));
    const travelers = localTravelers.filter(t => t?.id && !have.has(t.id));
    const compliance = Object.entries(localCompliance).filter(([id, docs]) => !complianceRef.current[id] && Array.isArray(docs));
    Promise.all([
      ...travelers.map(t => saveDirectoryTraveler(scope, t)),
      ...compliance.map(([id, docs]) => saveCompliance(scope, id, docs)),
    ]).then(() => {
      localStorage.setItem(flag, new Date().toISOString());
      if (travelers.length || compliance.length) logger.log("Directory", `imported ${travelers.length} traveller(s), ${compliance.length} compliance record(s)`);
    }).catch(err => logger.error("Directory", "import failed, will retry next load:", err));
  }, [scope, scopeKey, loadedFor, localTravelers, localCompliance]);

  const setCloudTravelersAndSave = useCallback<Dispatch<SetStateAction<User[]>>>(action => {
    if (!scope) return;
    const prev = travelersRef.current;
    const next = typeof action === "function" ? action(prev) : action;
    travelersRef.current = next;
    setCloudTravelers(next);
    const before = new Map(prev.map(t => [t.id, t]));
    const after = new Set(next.map(t => t.id));
    const writes = [
      ...next.filter(t => !same(before.get(t.id), t)).map(t => saveDirectoryTraveler(scope, t)),
      ...prev.filter(t => !after.has(t.id)).map(t => deleteDirectoryTraveler(scope, t.id)),
    ];
    Promise.all(writes).catch(saveFailed);
  }, [scope, saveFailed]);

  const setCloudComplianceAndSave = useCallback<Dispatch<SetStateAction<Compliance>>>(action => {
    if (!scope) return;
    const prev = complianceRef.current;
    const next = typeof action === "function" ? action(prev) : action;
    complianceRef.current = next;
    setCloudCompliance(next);
    const writes = [
      ...Object.entries(next).filter(([id, docs]) => !same(prev[id], docs)).map(([id, docs]) => saveCompliance(scope, id, docs)),
      ...Object.keys(prev).filter(id => !(id in next)).map(id => deleteCompliance(scope, id)),
    ];
    Promise.all(writes).catch(saveFailed);
  }, [scope, saveFailed]);

  const value = useMemo<DirectoryValue>(() => (scope
    ? { travelers: cloudTravelers, setTravelers: setCloudTravelersAndSave, compliance: cloudCompliance, setCompliance: setCloudComplianceAndSave }
    : { travelers: localTravelers, setTravelers: setLocalTravelers, compliance: localCompliance, setCompliance: setLocalCompliance }),
  [scope, cloudTravelers, setCloudTravelersAndSave, cloudCompliance, setCloudComplianceAndSave, localTravelers, setLocalTravelers, localCompliance, setLocalCompliance]);

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

import { useCallback, useEffect, useState } from "react";
import { useOrg } from "@/context/OrgContext";
import { fetchSavedInfo, type SavedInfoItem } from "@/services/savedInfo";

/** The current team's saved info. Empty for anyone without a team. */
export function useSavedInfo() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id ?? null;
  const [items, setItems] = useState<SavedInfoItem[]>([]);
  const [loading, setLoading] = useState(!!orgId);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) { setItems([]); setLoading(false); return; }
    try {
      setItems(await fetchSavedInfo(orgId));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server when the team changes
    void reload();
  }, [reload]);

  return { items, loading, failed, reload };
}

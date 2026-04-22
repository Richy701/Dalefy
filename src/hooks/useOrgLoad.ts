import { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { firebaseDb, isFirebaseConfigured } from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import type { Organization, OrgMember, OrgRole } from "@/types";
import { logger } from "@/lib/logger";
import { ORG_LOAD_TIMEOUT_MS } from "@/config/constants";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "org";
}

export function useOrgLoad() {
  const { user, isAuthenticated } = useAuth();
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tablesReady, setTablesReady] = useState(false);
  const useFirebase = isFirebaseConfigured();
  const isRealUser = useFirebase && isAuthenticated && user?.id !== "demo" && (user?.id?.length ?? 0) > 20;

  useEffect(() => {
    if (!isRealUser || !user) {
      setCurrentOrg(null);
      setOrgRole(null);
      setOrgMembers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let mounted = true;

    const clear = () => {
      if (!mounted) return;
      setCurrentOrg(null);
      setOrgRole(null);
      setOrgMembers([]);
      setIsLoading(false);
    };

    async function load() {
      try {
        logger.log("OrgLoad", "loading org for user:", user!.id);
        const db = firebaseDb();

        // Get user's org memberships
        const membershipsSnap = await getDocs(
          query(collection(db, "org_members"), where("user_id", "==", user!.id)),
        );

        if (mounted) setTablesReady(true);

        if (membershipsSnap.empty) { clear(); return; }

        const memberships = membershipsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Get preferred org from profile
        const profileSnap = await getDoc(doc(db, "profiles", user!.id));
        const preferredOrgId = profileSnap.data()?.current_org_id ?? null;

        const membership = memberships.find(m => m.organization_id === preferredOrgId) ?? memberships[0];

        // Get org data
        const orgSnap = await getDoc(doc(db, "organizations", membership.organization_id));
        if (!orgSnap.exists()) { clear(); return; }

        if (!mounted) return;

        const orgData = orgSnap.data();
        setCurrentOrg({
          id: orgSnap.id,
          name: orgData.name as string,
          slug: orgData.slug as string,
          agencyCode: (orgData.agency_code as string) ?? "",
          createdBy: orgData.created_by as string,
        });
        setOrgRole(membership.role as OrgRole);

        // Get all members for this org
        const membersSnap = await getDocs(
          query(collection(db, "org_members"), where("organization_id", "==", membership.organization_id)),
        );

        if (mounted) {
          setOrgMembers(membersSnap.docs.map(d => {
            const m = d.data();
            return {
              id: d.id,
              organizationId: m.organization_id,
              userId: m.user_id,
              role: m.role as OrgRole,
              joinedAt: m.joined_at,
            };
          }));
          setIsLoading(false);
        }
      } catch (err) {
        logger.warn("OrgLoad", "load failed:", err);
        clear();
      }
    }

    load();

    const timeout = setTimeout(() => {
      if (mounted) {
        logger.log("OrgLoad", "still loading — unblocking UI");
        setIsLoading(false);
      }
    }, ORG_LOAD_TIMEOUT_MS);

    return () => { mounted = false; clearTimeout(timeout); };
  }, [isRealUser, user?.id]);

  const createOrg = useCallback(async (name: string, agencyCode?: string): Promise<{ org: Organization | null; error: string | null }> => {
    if (!isRealUser || !user) return { org: null, error: "Not authenticated" };

    try {
      const db = firebaseDb();
      const slug = slugify(name) + "-" + Math.random().toString(36).slice(2, 6);
      const code = (agencyCode || slugify(name)).toLowerCase();
      const orgId = crypto.randomUUID();

      // Check agency code uniqueness
      const existing = await getDocs(
        query(collection(db, "organizations"), where("agency_code", "==", code)),
      );
      if (!existing.empty) {
        return { org: null, error: "That agency code is already taken" };
      }

      // Create org document
      await setDoc(doc(db, "organizations", orgId), {
        name,
        slug,
        agency_code: code,
        created_by: user.id,
        created_at: new Date().toISOString(),
      });

      // Create membership — ID must be ${uid}_${orgId} to match isOrgAdmin rule
      const memberId = `${user.id}_${orgId}`;
      await setDoc(doc(db, "org_members", memberId), {
        organization_id: orgId,
        user_id: user.id,
        role: "owner",
        joined_at: new Date().toISOString(),
      });

      // Set current org on profile
      await updateDoc(doc(db, "profiles", user.id), {
        current_org_id: orgId,
      });

      const org: Organization = { id: orgId, name, slug, agencyCode: code, createdBy: user.id };

      setCurrentOrg(org);
      setOrgRole("owner");
      setOrgMembers([{
        id: memberId,
        organizationId: orgId,
        userId: user.id,
        role: "owner",
        joinedAt: new Date().toISOString(),
      }]);

      return { org, error: null };
    } catch (err: unknown) {
      return { org: null, error: err instanceof Error ? err.message : "Failed to create organization" };
    }
  }, [isRealUser, user]);

  return { currentOrg, orgRole, orgMembers, isLoading, tablesReady, createOrg };
}

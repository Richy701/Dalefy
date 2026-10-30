import { useCallback, useEffect, useState } from "react";
import { SpinnerGap, UserSwitch } from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import type { OrgRole } from "@/types";

const ROLE_LABEL: Record<OrgRole, string> = { owner: "Owner", admin: "Admin", agent: "Agent", viewer: "Viewer" };

/** On every page while an owner or admin is signed in as a teammate, with the way back */
export function ImpersonationBanner() {
  const { user, impersonation, returnToOwnAccount } = useAuth();
  const { currentOrg, orgRole } = useOrg();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = useCallback(async () => {
    setBusy(true);
    setError(null);
    // On success the app starts over on your own account, so only a failure comes back
    const err = await returnToOwnAccount();
    if (err) {
      setError(err);
      setBusy(false);
    }
  }, [returnToOwnAccount]);

  // The hour is up: switch back without being asked
  const until = impersonation?.until ?? 0;
  useEffect(() => {
    if (!until) return;
    const t = setTimeout(back, Math.max(0, until - Date.now()));
    return () => clearTimeout(t);
  }, [until, back]);

  if (!impersonation || !user) return null;

  const by = impersonation.byName.trim().split(/\s+/)[0] || "your account";
  const ends = new Date(impersonation.until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const where = [orgRole ? ROLE_LABEL[orgRole] : "", currentOrg ? `on ${currentOrg.name}` : ""].filter(Boolean).join(" ");

  return (
    <div role="status" aria-live="polite" className="bg-brand/8 border-b border-brand/25 px-4 py-2 flex items-center gap-3">
      <Avatar className="h-7 w-7 shrink-0">
        {user.avatar && <AvatarImage src={user.avatar} alt="" />}
        <AvatarFallback className="text-[10px] font-semibold">{user.initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground truncate">Signed in as {user.name}</p>
        <p className={`text-[11px] sm:truncate ${error ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}>
          {error ?? `${where ? `${where}. ` : ""}Ends at ${ends}. Their private trips stay hidden.`}
        </p>
      </div>
      <Button size="sm" onClick={back} disabled={busy} className="shrink-0 gap-1.5 text-xs font-semibold">
        {busy ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : <UserSwitch className="h-3.5 w-3.5" />}
        Back to {by}
      </Button>
    </div>
  );
}

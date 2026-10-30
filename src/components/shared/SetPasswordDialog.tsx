import { useEffect, useState } from "react";
import { Eye, EyeSlash, SpinnerGap } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { accountPasswordStatus, changePassword } from "@/services/firebaseAuth";

const SNOOZE_KEY = "daf-set-password-emailed";

/**
 * Accounts that only ever signed in with emailed links have no password, so a
 * shared department account can't sign in on another device. Make them set one.
 */
export function SetPasswordDialog() {
  const { user, impersonation } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);

  // Signed in as a teammate, their password is theirs to set
  const realUser = !!user && user.id !== "demo" && (user.id?.length ?? 0) >= 20 && !impersonation;

  useEffect(() => {
    if (!realUser) return;
    try { if (sessionStorage.getItem(SNOOZE_KEY)) return; } catch { /* storage unavailable */ }
    let cancelled = false;
    accountPasswordStatus().then(status => { if (!cancelled && status === "needs-password") setOpen(true); });
    return () => { cancelled = true; };
  }, [realUser, user?.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    setSaving(true);
    setError(null);
    const result = await changePassword(password);
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    if (result.emailed) {
      try { sessionStorage.setItem(SNOOZE_KEY, "1"); } catch { /* storage unavailable */ }
      setEmailed(true);
      return;
    }
    setPassword("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* required: closes only once a password is set */ }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{emailed ? "Check your inbox" : "Set a password"}</DialogTitle>
          <DialogDescription>
            {emailed
              ? <>For security we've emailed <span className="font-medium text-foreground">{user?.email}</span> a link to set your password. Open it, choose a password, and you're done.</>
              : <>This account signs in with emailed links. Set a password so anyone on your team can sign in to <span className="font-medium text-foreground">{user?.email}</span> on other devices.</>}
          </DialogDescription>
        </DialogHeader>

        {emailed ? (
          <Button onClick={() => setOpen(false)} className="w-full h-11 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium">
            OK
          </Button>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="set-password" className="text-xs font-medium text-muted-foreground">New password</Label>
              <div className="relative">
                <Input
                  id="set-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null); }}
                  placeholder="At least 8 characters"
                  className="h-11 rounded-xl bg-card border-border text-sm pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow(v => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  {show ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <Button
              type="submit"
              disabled={saving || password.length < 8}
              className="w-full h-11 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium disabled:opacity-40"
            >
              {saving ? <SpinnerGap className="h-4 w-4 animate-spin" /> : "Save password"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

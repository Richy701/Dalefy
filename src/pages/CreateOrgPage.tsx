import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Loader2, ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/Logo";
import { useOrg } from "@/context/OrgContext";
import { BRAND } from "@/config/brand";

export function CreateOrgPage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createOrg, tablesReady } = useOrg();
  const navigate = useNavigate();

  // If org tables aren't migrated yet, skip this page entirely
  if (!tablesReady) return <Navigate to="/" replace />;

  const canSubmit = name.trim().length >= 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);
    const { error: err } = await createOrg(name.trim());
    setLoading(false);

    if (err) {
      setError(err);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-brand/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div aria-hidden="true" className="h-16 w-16 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl animate-scale-in logo-shimmer">
            <Logo className="text-black h-9 w-9" />
          </div>
          <h1 className="text-4xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white mb-2">{BRAND.nameUpper}</h1>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">One last step</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#111111] border border-black/[0.06] dark:border-transparent rounded-[2rem] p-8 shadow-2xl animate-fade-up stagger-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Create Your Agency</h2>
              <p className="text-[11px] text-slate-500 dark:text-[#888888]">Set up your travel agency workspace</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Agency / Company Name</Label>
              <Input
                type="text"
                required
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Luxury Escapes Travel"
                className="h-12 bg-slate-50 dark:bg-[#050505] border-black/[0.08] dark:border-[#1f1f1f] rounded-xl text-slate-900 dark:text-white font-medium focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand"
              />
              <p className="text-[10px] text-slate-400 dark:text-[#555]">
                You can change this later in settings. Your team members will see this name.
              </p>
            </div>
            <Button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full h-12 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider shadow-xl shadow-brand/20 disabled:opacity-40 disabled:cursor-not-allowed gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create Agency <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </form>
        </div>

        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#444] mt-8">
          Your trips and data will belong to this agency
        </p>
      </div>
    </div>
  );
}

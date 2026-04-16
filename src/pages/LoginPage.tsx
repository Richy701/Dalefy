import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/Logo";
import { useAuth } from "@/context/AuthContext";

const ROLES = ["Trip Manager", "Agent", "Traveller", "Admin"] as const;

export function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("Trip Manager");
  const [loading, setLoading] = useState(false);
  const { completeOnboarding, demoLogin } = useAuth();
  const navigate = useNavigate();

  const canAdvance = name.trim().length >= 2;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (canAdvance) setStep(2);
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await completeOnboarding({ name, email, role });
    setLoading(false);
    navigate("/");
  };

  const handleDemo = async () => {
    setLoading(true);
    await demoLogin();
    setLoading(false);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-brand/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-up">
        <div className="text-center mb-10">
          <div aria-hidden="true" className="h-16 w-16 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl animate-scale-in logo-shimmer">
            <Logo className="text-black h-9 w-9" />
          </div>
          <h1 className="text-4xl font-extrabold uppercase tracking-tight text-white mb-2">DAF ADVENTURES</h1>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#888888]">Plan & manage trips together</p>
        </div>

        <div className="bg-[#111111] border border-[#1f1f1f] rounded-[2rem] p-8 shadow-2xl animate-fade-up stagger-2">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-brand" : "bg-[#1f1f1f]"}`} />
            <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-brand" : "bg-[#1f1f1f]"}`} />
          </div>

          {step === 1 && (
            <>
              <h2 className="text-xl font-extrabold uppercase tracking-tight text-white mb-1">Welcome</h2>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#888888] mb-8">What should we call you?</p>

              <form onSubmit={handleNext} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#888888]">Your Name</Label>
                  <Input
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="h-12 bg-[#050505] border-[#1f1f1f] rounded-xl text-white font-medium focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!canAdvance}
                  className="w-full h-12 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider shadow-xl shadow-brand/20 disabled:opacity-40 disabled:cursor-not-allowed gap-2"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-extrabold uppercase tracking-tight text-white mb-1">Nice to meet you, {name.trim().split(/\s+/)[0]}</h2>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#888888] mb-8">A few more details</p>

              <form onSubmit={handleFinish} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#888888]">Email <span className="text-[#444]">(optional)</span></Label>
                  <Input
                    type="email"
                    value={email}
                    autoFocus
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-12 bg-[#050505] border-[#1f1f1f] rounded-xl text-white font-medium focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#888888]">Your Role</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`h-11 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border ${
                          role === r
                            ? "bg-brand text-black border-brand"
                            : "bg-[#050505] border-[#1f1f1f] text-[#888] hover:text-white hover:border-[#333]"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => setStep(1)}
                    variant="outline"
                    className="h-12 rounded-xl border-[#1f1f1f] bg-[#050505] text-white hover:bg-[#1f1f1f] px-4"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-12 rounded-xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider shadow-xl shadow-brand/20 gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Get Started <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </div>
              </form>
            </>
          )}

          <div className="flex items-center gap-4 my-6">
            <div className="h-px flex-1 bg-[#1f1f1f]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#555]">OR</span>
            <div className="h-px flex-1 bg-[#1f1f1f]" />
          </div>

          <Button
            onClick={handleDemo}
            disabled={loading}
            variant="outline"
            className="w-full h-12 rounded-xl border-[#1f1f1f] bg-[#050505] text-white hover:bg-[#1f1f1f] hover:text-brand font-bold uppercase tracking-wider transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try a Demo"}
          </Button>
        </div>

        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-[#444] mt-8">
          Your profile is stored on this device only
        </p>
      </div>
    </div>
  );
}

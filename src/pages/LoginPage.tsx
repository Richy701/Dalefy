import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, demoLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await login(email, password);
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
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-[#0bd2b5]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-[#0bd2b5]/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-up">
        <div className="text-center mb-10">
          <div aria-hidden="true" className="h-16 w-16 bg-[#0bd2b5] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl animate-scale-in logo-shimmer">
            <Globe className="text-black h-8 w-8" />
          </div>
          <h1 className="text-4xl font-extrabold uppercase tracking-tight text-white mb-2">DAF ADVENTURES</h1>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#888888]">Plan & manage trips together</p>
        </div>

        <div className="bg-[#111111] border border-[#1f1f1f] rounded-[2rem] p-8 shadow-2xl animate-fade-up stagger-2">
          <h2 className="text-xl font-extrabold uppercase tracking-tight text-white mb-1">Sign In</h2>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#888888] mb-8">Welcome back</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#888888]">Email Address</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ash.murray@dafadventures.com"
                className="h-12 bg-[#050505] border-[#1f1f1f] rounded-xl text-white font-medium focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#888888]">Password</Label>
              <Input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="h-12 bg-[#050505] border-[#1f1f1f] rounded-xl text-white font-medium focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[#0bd2b5] hover:opacity-90 text-black font-bold uppercase tracking-wider shadow-xl shadow-[#0bd2b5]/20"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
            </Button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <div className="h-px flex-1 bg-[#1f1f1f]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#555]">OR</span>
            <div className="h-px flex-1 bg-[#1f1f1f]" />
          </div>

          <Button
            onClick={handleDemo}
            disabled={loading}
            variant="outline"
            className="w-full h-12 rounded-xl border-[#1f1f1f] bg-[#050505] text-white hover:bg-[#1f1f1f] hover:text-[#0bd2b5] font-bold uppercase tracking-wider transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try a Demo"}
          </Button>
        </div>

        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-[#444] mt-8">
          Use any email and password to sign in
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { acceptInvite } from "@/services/invites";
import { Logo } from "@/components/shared/Logo";

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "needs-auth">("loading");
  const [message, setMessage] = useState("");
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setStatus("needs-auth");
      setMessage("Sign in to accept this invitation");
      return;
    }

    if (!token) {
      setStatus("error");
      setMessage("Invalid invite link");
      return;
    }

    acceptInvite(token).then(result => {
      sessionStorage.removeItem("daf-pending-invite");
      if ("error" in result) {
        setStatus("error");
        setMessage(result.error);
      } else {
        setStatus("success");
        setOrgName(result.orgName);
        setMessage(`You've joined ${result.orgName}`);
      }
    });
  }, [token, isAuthenticated, authLoading]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <Logo className="h-8 mx-auto" />

        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-brand mx-auto" />
            <p className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-[#888]">Accepting invite...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="h-12 w-12 text-brand mx-auto" />
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Welcome!</h1>
            <p className="text-sm text-slate-600 dark:text-[#aaa]">{message}</p>
            <Button
              onClick={() => navigate("/dashboard")}
              className="w-full h-12 rounded-2xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider"
            >
              Go to Dashboard
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Oops</h1>
            <p className="text-sm text-slate-600 dark:text-[#aaa]">{message}</p>
            <Button
              onClick={() => navigate("/")}
              variant="ghost"
              className="w-full h-12 rounded-2xl font-bold uppercase tracking-wider"
            >
              Go Home
            </Button>
          </div>
        )}

        {status === "needs-auth" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Sign In Required</h1>
            <p className="text-sm text-slate-600 dark:text-[#aaa]">{message}</p>
            <Button
              onClick={() => {
                sessionStorage.setItem("daf-pending-invite", token || "");
                navigate("/login");
              }}
              className="w-full h-12 rounded-2xl bg-brand hover:opacity-90 text-black font-bold uppercase tracking-wider"
            >
              Sign In
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

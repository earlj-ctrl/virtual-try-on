import { useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
    setBusy(false);
  };

  return (
    <main data-testid="forgot-password-page" className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-8">
        <p className="overline-label text-muted-foreground">Recover access</p>
        <h1 className="font-serif text-3xl mt-2">Forgot password?</h1>

        {sent ? (
          <div className="mt-6 text-center py-8" data-testid="forgot-sent">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
            <p className="text-sm text-muted-foreground">
              If that email is registered, we've sent a reset link. Check your inbox — the link is valid for one hour.
            </p>
            <Link to="/login" data-testid="forgot-back-login" className="mt-6 inline-block text-sm underline underline-offset-4">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mt-2">
              We'll email you a secure link to set a new password. It expires in 60 minutes.
            </p>
            <form onSubmit={submit} className="mt-8 space-y-4">
              <div>
                <Label htmlFor="fp-email">Email</Label>
                <Input data-testid="forgot-email" id="fp-email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <Button data-testid="forgot-submit" type="submit" className="w-full rounded-full h-11" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            <p className="mt-6 text-sm text-center text-muted-foreground">
              Remembered it?{" "}
              <Link to="/login" className="text-foreground underline underline-offset-4">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

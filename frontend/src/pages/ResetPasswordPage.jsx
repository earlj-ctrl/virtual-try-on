import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) toast.error("Missing reset token");
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    if (password.length < 6) { toast.error("Minimum 6 characters"); return; }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password reset — please sign in");
      navigate("/login");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
    setBusy(false);
  };

  return (
    <main data-testid="reset-password-page" className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-8">
        <p className="overline-label text-muted-foreground">Set a new password</p>
        <h1 className="font-serif text-3xl mt-2">Reset password</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Choose a new password. Minimum 6 characters.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="new-pw">New password</Label>
            <Input data-testid="reset-password" id="new-pw" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="confirm-pw">Confirm password</Label>
            <Input data-testid="reset-confirm" id="confirm-pw" type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
          <Button data-testid="reset-submit" type="submit" className="w-full rounded-full h-11" disabled={busy || !token}>
            {busy ? "Resetting…" : "Reset password"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-center text-muted-foreground">
          <Link to="/login" className="underline underline-offset-4">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

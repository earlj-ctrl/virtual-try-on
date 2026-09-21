import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await login(email, password);
    setBusy(false);
    if (r.ok) {
      toast.success("Welcome back");
      const from = loc.state?.from || (r.user.role === "admin" ? "/admin" : "/catalog");
      nav(from);
    } else {
      toast.error(r.error);
    }
  };

  return (
    <main data-testid="login-page" className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-8">
        <p className="overline-label text-muted-foreground">Sign in</p>
        <h1 className="font-serif text-3xl mt-2">Welcome back</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Access your wardrobe, saved outfits, and try-on history.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input data-testid="login-email" id="email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input data-testid="login-password" id="password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <Button data-testid="login-submit" type="submit" className="w-full rounded-full h-11" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-center text-muted-foreground">
          New here?{" "}
          <Link data-testid="link-signup" to="/signup" className="text-foreground underline underline-offset-4">Create an account</Link>
        </p>
      </div>
    </main>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function SignupPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await register(email, password, name);
    setBusy(false);
    if (r.ok) {
      toast.success("Account created");
      nav("/profile");
    } else {
      toast.error(r.error);
    }
  };

  return (
    <main data-testid="signup-page" className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-8">
        <p className="overline-label text-muted-foreground">Create Account</p>
        <h1 className="font-serif text-3xl mt-2">Begin your Atelier</h1>
        <p className="text-sm text-muted-foreground mt-2">Free forever. Your photos remain private.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input data-testid="signup-name" id="name" value={name} onChange={(e)=>setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input data-testid="signup-email" id="email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password">Password (min 6)</Label>
            <Input data-testid="signup-password" id="password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
          <Button data-testid="signup-submit" type="submit" className="w-full rounded-full h-11" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-center text-muted-foreground">
          Already have one?{" "}
          <Link data-testid="link-login" to="/login" className="text-foreground underline underline-offset-4">Sign in</Link>
        </p>
      </div>
    </main>
  );
}

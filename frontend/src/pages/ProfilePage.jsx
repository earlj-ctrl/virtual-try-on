import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && user !== false) {
      const p = user.profile || {};
      setForm({
        name: user.name || "",
        height_cm: p.height_cm || "",
        weight_kg: p.weight_kg || "",
        chest_cm: p.chest_cm || "",
        waist_cm: p.waist_cm || "",
        hips_cm: p.hips_cm || "",
        preferred_fit: p.preferred_fit || "",
      });
    }
  }, [user]);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      ["height_cm","weight_kg","chest_cm","waist_cm","hips_cm"].forEach((k) => {
        if (payload[k] === "" || payload[k] == null) delete payload[k];
        else payload[k] = Number(payload[k]);
      });
      Object.keys(payload).forEach((k) => (payload[k] === "" || payload[k] == null) && delete payload[k]);
      const { data } = await api.put("/auth/profile", payload);
      setUser(data);
      toast.success("Profile updated");
    } catch { toast.error("Failed"); }
    setSaving(false);
  };

  if (!user || user === false) return null;

  return (
    <main data-testid="profile-page" className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <p className="overline-label text-muted-foreground">Profile & Body Info</p>
      <h1 className="font-serif text-3xl sm:text-4xl mt-2 mb-8">Your details</h1>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-serif">
            {(form.name || user.email).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{user.email}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{user.role}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name"><Input data-testid="profile-name" value={form.name} onChange={(e)=>upd("name", e.target.value)} /></Field>
          <Field label="Preferred fit">
            <select
              data-testid="profile-fit"
              value={form.preferred_fit}
              onChange={(e) => upd("preferred_fit", e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose…</option>
              <option value="tailored">Tailored</option>
              <option value="loose">Loose</option>
              <option value="oversized">Oversized</option>
            </select>
          </Field>
          <Field label="Height (cm)"><Input data-testid="profile-height" type="number" value={form.height_cm} onChange={(e)=>upd("height_cm", e.target.value)} /></Field>
          <Field label="Weight (kg)"><Input data-testid="profile-weight" type="number" value={form.weight_kg} onChange={(e)=>upd("weight_kg", e.target.value)} /></Field>
          <Field label="Chest (cm)"><Input type="number" value={form.chest_cm} onChange={(e)=>upd("chest_cm", e.target.value)} /></Field>
          <Field label="Waist (cm)"><Input type="number" value={form.waist_cm} onChange={(e)=>upd("waist_cm", e.target.value)} /></Field>
          <Field label="Hips (cm)"><Input type="number" value={form.hips_cm} onChange={(e)=>upd("hips_cm", e.target.value)} /></Field>
        </div>

        <div className="pt-4 border-t border-border flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            Body info is private. Admins cannot view your measurements or photos.
          </p>
          <Button data-testid="profile-save" onClick={save} disabled={saving} className="rounded-full">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

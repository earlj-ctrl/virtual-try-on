import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function WardrobePage() {
  const [items, setItems] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [sessions, setSessions] = useState([]);

  const load = async () => {
    const [i, o, s] = await Promise.all([
      api.get("/wardrobe/items"),
      api.get("/wardrobe/outfits"),
      api.get("/tryon/sessions"),
    ]);
    setItems(i.data); setOutfits(o.data); setSessions(s.data);
  };

  useEffect(() => { load(); }, []);

  const removeItem = async (id) => {
    await api.delete(`/wardrobe/items/${id}`);
    setItems((it) => it.filter((x) => x.id !== id));
    toast.success("Removed");
  };
  const removeOutfit = async (id) => {
    await api.delete(`/wardrobe/outfits/${id}`);
    setOutfits((it) => it.filter((x) => x.id !== id));
    toast.success("Deleted");
  };
  const removeSession = async (id) => {
    await api.delete(`/tryon/sessions/${id}`);
    setSessions((it) => it.filter((x) => x.id !== id));
    toast.success("Deleted");
  };

  return (
    <main data-testid="wardrobe-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <p className="overline-label text-muted-foreground">Your private space</p>
      <h1 className="font-serif text-3xl sm:text-4xl mt-2 mb-8">Wardrobe</h1>

      <Tabs defaultValue="items">
        <TabsList className="mb-6 rounded-full bg-muted p-1 h-auto">
          <TabsTrigger data-testid="tab-items" value="items" className="rounded-full px-5">Saved Items</TabsTrigger>
          <TabsTrigger data-testid="tab-outfits" value="outfits" className="rounded-full px-5">Outfits</TabsTrigger>
          <TabsTrigger data-testid="tab-sessions" value="sessions" className="rounded-full px-5">Try-On History</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          {items.length === 0 ? (
            <EmptyState label="No saved items yet." link={{ to: "/catalog", text: "Browse catalog" }} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {items.map((it) => (
                <div key={it.id} className="bg-card border border-border rounded-xl overflow-hidden relative group" data-testid={`wardrobe-item-${it.id}`}>
                  <Link to={`/product/${it.product?.id}`} className="block aspect-[4/5] bg-muted">
                    {it.product?.image_url && <img src={it.product.image_url} alt="" className="w-full h-full object-cover" />}
                  </Link>
                  <div className="p-3">
                    <p className="text-sm font-medium truncate">{it.product?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{it.product?.brand}</p>
                  </div>
                  <button data-testid={`wardrobe-remove-${it.id}`} onClick={() => removeItem(it.id)} className="absolute top-2 right-2 w-8 h-8 bg-background/85 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="outfits">
          {outfits.length === 0 ? (
            <EmptyState label="No saved outfits." link={{ to: "/outfit-builder", text: "Build one" }} />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {outfits.map((o) => (
                <div key={o.id} className="bg-card border border-border rounded-xl p-5 relative" data-testid={`outfit-${o.id}`}>
                  <p className="font-serif text-lg">{o.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Object.keys(o.items || {}).length} pieces · {new Date(o.created_at).toLocaleDateString()}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {Object.keys(o.items || {}).map((k) => (
                      <span key={k} className="text-[10px] uppercase tracking-wider px-2 py-1 bg-secondary rounded-full">{k}</span>
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeOutfit(o.id)} className="absolute top-3 right-3" data-testid={`outfit-remove-${o.id}`}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sessions">
          {sessions.length === 0 ? (
            <EmptyState label="No try-on sessions yet." link={{ to: "/try-on", text: "Try one now" }} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {sessions.map((s) => (
                <div key={s.id} className="bg-card border border-border rounded-xl overflow-hidden relative" data-testid={`session-${s.id}`}>
                  <div className="aspect-[3/4] bg-muted">
                    {s.user_photo && <img src={s.user_photo} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground font-mono">{s.adapter}</p>
                    <p className="text-xs">{new Date(s.started_at).toLocaleString()}</p>
                  </div>
                  <button data-testid={`session-remove-${s.id}`} onClick={() => removeSession(s.id)} className="absolute top-2 right-2 w-8 h-8 bg-background/85 backdrop-blur rounded-full flex items-center justify-center">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}

function EmptyState({ label, link }) {
  return (
    <div className="text-center py-20 border border-dashed border-border rounded-2xl">
      <p className="text-muted-foreground">{label}</p>
      {link && (
        <Link to={link.to} className="mt-4 inline-block text-sm underline underline-offset-4">
          {link.text}
        </Link>
      )}
    </div>
  );
}

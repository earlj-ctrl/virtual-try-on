import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";

const SLOTS = ["top", "bottom", "dress", "jacket", "shoes", "jewelry", "accessory"];

export default function OutfitBuilderPage() {
  const [products, setProducts] = useState([]);
  const [outfit, setOutfit] = useState({}); // slot -> product
  const [name, setName] = useState("My Outfit");
  const [activeSlot, setActiveSlot] = useState("top");

  useEffect(() => {
    api.get("/products").then(({ data }) => setProducts(data));
  }, []);

  const total = Object.values(outfit).reduce((s, p) => s + (Number(p?.price) || 0), 0);
  const filtered = products.filter((p) => p.category === activeSlot);

  const pick = (p) => setOutfit((o) => ({ ...o, [activeSlot]: p }));
  const clear = (slot) => setOutfit((o) => { const c = { ...o }; delete c[slot]; return c; });

  const save = async () => {
    const items = {};
    Object.entries(outfit).forEach(([slot, p]) => { items[slot] = p.id; });
    if (Object.keys(items).length === 0) { toast.error("Add at least one item"); return; }
    try {
      await api.post("/wardrobe/outfits", { name, items });
      toast.success("Outfit saved to wardrobe");
    } catch { toast.error("Failed to save outfit"); }
  };

  return (
    <main data-testid="outfit-builder-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="overline-label text-muted-foreground">Outfit Canvas</p>
          <h1 className="font-serif text-3xl sm:text-4xl mt-2">Build a look</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input
            data-testid="outfit-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64"
          />
          <Button data-testid="save-outfit-button" onClick={save} className="rounded-full gap-2">
            <Sparkles size={14} /> Save Outfit
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Slots */}
        <section className="lg:col-span-5 bg-card border border-border rounded-2xl p-6">
          <p className="overline-label text-muted-foreground">Slots</p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="outfit-slots">
            {SLOTS.map((s) => {
              const p = outfit[s];
              const active = activeSlot === s;
              return (
                <button
                  key={s}
                  data-testid={`slot-${s}`}
                  onClick={() => setActiveSlot(s)}
                  className={`relative aspect-[4/5] rounded-xl border-2 overflow-hidden transition ${
                    active ? "border-foreground" : "border-border hover:border-foreground/40"
                  }`}
                >
                  {p ? (
                    <>
                      <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                      <span
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/85 backdrop-blur flex items-center justify-center"
                        onClick={(e) => { e.stopPropagation(); clear(s); }}
                        data-testid={`clear-slot-${s}`}
                      >
                        <X size={12} />
                      </span>
                      <span className="absolute bottom-1 left-1 right-1 text-[9px] bg-background/85 backdrop-blur px-1.5 py-0.5 rounded truncate">
                        {p.name}
                      </span>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground text-xs uppercase tracking-wider">
                      <span className="font-mono">{s}</span>
                      <span className="mt-1 text-[10px]">Empty</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estimated total</span>
            <span data-testid="outfit-total" className="font-mono text-lg">₱{total.toLocaleString()}</span>
          </div>
        </section>

        {/* Picker */}
        <section className="lg:col-span-7 bg-card border border-border rounded-2xl p-6">
          <p className="overline-label text-muted-foreground">
            Choose a {activeSlot}
          </p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground py-10 text-center">
                No items in this category yet.
              </p>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                data-testid={`pick-outfit-${p.id}`}
                onClick={() => pick(p)}
                className={`aspect-[4/5] rounded-lg overflow-hidden border-2 transition ${
                  outfit[activeSlot]?.id === p.id ? "border-foreground" : "border-transparent hover:border-border"
                }`}
              >
                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const CATEGORIES = ["all", "top", "bottom", "dress", "jacket", "shoes", "jewelry", "accessory"];
const STYLES = ["all", "Minimalist", "Formal", "Casual", "Streetwear", "Modern", "Smart Casual", "Filipiniana"];

export default function CatalogPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("all");
  const [style, setStyle] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState({}); // product_id -> wardrobe_item_id

  const load = async () => {
    setLoading(true);
    const params = {};
    if (category !== "all") params.category = category;
    if (style !== "all") params.style = style;
    if (search) params.search = search;
    const { data } = await api.get("/products", { params });
    setProducts(data);
    setLoading(false);
  };

  const loadWardrobe = async () => {
    if (!user || user === false) return;
    try {
      const { data } = await api.get("/wardrobe/items");
      const map = {};
      data.forEach((it) => { if (it.product_id) map[it.product_id] = it.id; });
      setSaved(map);
    } catch {}
  };

  useEffect(() => { load(); }, [category, style]);
  useEffect(() => { loadWardrobe(); }, [user]);

  const onSave = async (product) => {
    if (!user || user === false) {
      toast.error("Please sign in to save items");
      return;
    }
    if (saved[product.id]) {
      try {
        await api.delete(`/wardrobe/items/${saved[product.id]}`);
        setSaved((s) => { const c = { ...s }; delete c[product.id]; return c; });
        toast.success("Removed from wardrobe");
      } catch { toast.error("Failed"); }
    } else {
      try {
        const { data } = await api.post("/wardrobe/items", { product_id: product.id });
        setSaved((s) => ({ ...s, [product.id]: data.id }));
        toast.success("Saved to wardrobe");
      } catch { toast.error("Failed"); }
    }
  };

  return (
    <main data-testid="catalog-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="overline-label text-muted-foreground">Catalog</p>
          <h1 className="font-serif text-3xl sm:text-4xl mt-2">Curated fashion</h1>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          className="flex items-center gap-2 w-full sm:w-auto"
        >
          <div className="relative flex-1 sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="catalog-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brand, name, tags…"
              className="pl-9"
            />
          </div>
          <Button data-testid="catalog-search-button" type="submit" variant="outline" className="rounded-full">Search</Button>
        </form>
      </div>

      <div className="mb-6 flex flex-wrap gap-2" data-testid="catalog-category-filters">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            data-testid={`cat-${c}`}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${
              category === c ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary border-border"
            }`}
          >
            {c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
      <div className="mb-8 flex flex-wrap gap-2" data-testid="catalog-style-filters">
        {STYLES.map((s) => (
          <button
            key={s}
            data-testid={`style-${s}`}
            onClick={() => setStyle(s)}
            className={`px-3 py-1 rounded-full text-xs uppercase tracking-wider border transition ${
              style === s ? "bg-secondary text-secondary-foreground border-foreground/40" : "text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div data-testid="catalog-empty" className="text-center py-24 border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">No products match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onSave={onSave} saved={!!saved[p.id]} />
          ))}
        </div>
      )}
    </main>
  );
}

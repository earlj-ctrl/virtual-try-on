import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Heart, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const PARTNERS = [
  { key: "Lazada", url: "https://www.lazada.com.ph/" },
  { key: "Shopee", url: "https://shopee.ph/" },
  { key: "Zalora PH", url: "https://www.zalora.com.ph/" },
];

export default function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    api.get(`/products/${id}`).then(({ data }) => setProduct(data)).catch(() => setProduct(false));
  }, [id]);

  useEffect(() => {
    if (!user || user === false) return;
    api.get("/wardrobe/items").then(({ data }) => {
      const found = data.find((it) => it.product_id === id);
      if (found) { setSaved(true); setSavedId(found.id); }
    }).catch(()=>{});
  }, [user, id]);

  const trackClick = async (platform) => {
    try { await api.post("/shopping/click", { product_id: id, platform }); } catch {}
  };

  const toggleSave = async () => {
    if (!user || user === false) { toast.error("Sign in to save items"); return; }
    if (saved) {
      await api.delete(`/wardrobe/items/${savedId}`); setSaved(false); setSavedId(null);
      toast.success("Removed from wardrobe");
    } else {
      const { data } = await api.post("/wardrobe/items", { product_id: id });
      setSaved(true); setSavedId(data.id);
      toast.success("Saved to wardrobe");
    }
  };

  if (product === null) return <div className="p-10 text-center">Loading…</div>;
  if (product === false) return <div className="p-10 text-center">Product not found.</div>;

  return (
    <main data-testid="product-detail-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid lg:grid-cols-2 gap-10">
        <div className="bg-muted rounded-2xl overflow-hidden aspect-[4/5]">
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        </div>

        <div>
          <p className="overline-label text-muted-foreground">{product.brand || "Atelier"} · {product.category}</p>
          <h1 className="font-serif text-3xl sm:text-4xl mt-3">{product.name}</h1>
          <p className="mt-4 text-2xl font-mono">₱{Number(product.price || 0).toLocaleString()}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {(product.style || []).map((s) => (
              <Badge key={s} className="uppercase tracking-wider text-[10px]">{s}</Badge>
            ))}
          </div>

          {product.description && (
            <p className="mt-6 text-muted-foreground leading-relaxed">{product.description}</p>
          )}

          <div className="mt-8 flex gap-3 flex-wrap">
            <Button asChild size="lg" className="rounded-full gap-2" data-testid="product-tryon">
              <Link to={`/try-on?product=${product.id}`}><Sparkles size={16} /> Try this on</Link>
            </Button>
            <Button
              data-testid="product-save"
              variant={saved ? "default" : "outline"}
              size="lg"
              className="rounded-full gap-2"
              onClick={toggleSave}
            >
              <Heart size={16} className={saved ? "fill-current" : ""} />
              {saved ? "Saved" : "Save to Wardrobe"}
            </Button>
          </div>

          <div className="mt-10 border-t border-border pt-6">
            <p className="overline-label text-muted-foreground mb-3">Find this item</p>
            <div className="flex flex-wrap gap-2">
              {PARTNERS.map((p) => (
                <a
                  key={p.key}
                  data-testid={`shop-${p.key.toLowerCase().replace(/\s/g,'-')}`}
                  href={product.source_url || p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackClick(p.key)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border text-sm hover:bg-secondary transition"
                >
                  {p.key} <ExternalLink size={12} />
                </a>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              External links only. No internal checkout. Aggregate clicks are tracked for analytics.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

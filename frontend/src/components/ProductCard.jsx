import { Link } from "react-router-dom";
import { Heart, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ProductCard({ product, onSave, saved, onQuickTryOn }) {
  return (
    <div
      data-testid={`product-card-${product.id}`}
      className="group relative bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300"
    >
      <Link to={`/product/${product.id}`} className="block relative aspect-[4/5] overflow-hidden bg-muted">
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
        />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {(product.style || []).slice(0, 2).map((s) => (
            <Badge key={s} className="bg-background/85 backdrop-blur text-foreground border border-border/50 text-[10px] uppercase tracking-wider">
              {s}
            </Badge>
          ))}
        </div>
      </Link>

      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <button
          data-testid={`save-${product.id}`}
          onClick={(e) => { e.preventDefault(); onSave?.(product); }}
          className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur transition ${
            saved ? "bg-brand-gold text-black" : "bg-background/85 text-foreground hover:bg-background"
          }`}
          aria-label="Save to wardrobe"
        >
          <Heart size={16} className={saved ? "fill-current" : ""} />
        </button>
        {onQuickTryOn && (
          <button
            data-testid={`quick-tryon-${product.id}`}
            onClick={(e) => { e.preventDefault(); onQuickTryOn(product); }}
            className="w-9 h-9 rounded-full bg-background/85 backdrop-blur text-foreground hover:bg-background flex items-center justify-center"
            aria-label="Quick try-on"
          >
            <Sparkles size={16} />
          </button>
        )}
      </div>

      <div className="p-4">
        <p className="overline-label text-muted-foreground">{product.brand || "Atelier"}</p>
        <h3 className="mt-1 text-base font-medium leading-tight line-clamp-2">{product.name}</h3>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-mono text-foreground">
            ₱{Number(product.price || 0).toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground capitalize">{product.category}</span>
        </div>
      </div>
    </div>
  );
}

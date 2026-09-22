import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trash2, Sparkles, Download, Grid3x3, Heart } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import PrivateImage from "@/components/PrivateImage";

export default function WardrobePage() {
  const [items, setItems] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [avatars, setAvatars] = useState([]);
  const [pixelBusy, setPixelBusy] = useState(null);

  const load = async () => {
    const [i, o, s, f, a] = await Promise.all([
      api.get("/wardrobe/items"),
      api.get("/wardrobe/outfits"),
      api.get("/tryon/sessions"),
      api.get("/tryon/favorites"),
      api.get("/pixel-avatars"),
    ]);
    setItems(i.data); setOutfits(o.data); setSessions(s.data); setFavorites(f.data); setAvatars(a.data);
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
    setFavorites((it) => it.filter((x) => x.id !== id));
    toast.success("Deleted");
  };
  const removeAvatar = async (id) => {
    await api.delete(`/pixel-avatars/${id}`);
    setAvatars((it) => it.filter((x) => x.id !== id));
    toast.success("Removed");
  };

  const toggleFavorite = async (session) => {
    try {
      if (session.is_favorite) {
        await api.post(`/tryon/sessions/${session.id}/unfavorite`);
        setFavorites((f) => f.filter((x) => x.id !== session.id));
        setSessions((s) => s.map((x) => x.id === session.id ? { ...x, is_favorite: false } : x));
        toast.success("Removed from favorites");
      } else {
        const { data } = await api.post(`/tryon/sessions/${session.id}/favorite`);
        setFavorites((f) => [{ ...session, ...data }, ...f.filter((x) => x.id !== session.id)]);
        setSessions((s) => s.map((x) => x.id === session.id ? { ...x, ...data } : x));
        if (data.auto_pixel_created) {
          toast.success("Favorited · pixel avatar created");
          // refresh avatars list
          api.get("/pixel-avatars").then(({ data }) => setAvatars(data)).catch(()=>{});
        } else {
          toast.success("Added to favorites");
        }
      }
    } catch { toast.error("Failed"); }
  };

  const makePixel = async (sessionId) => {
    setPixelBusy(sessionId);
    try {
      const { data } = await api.post("/pixel-avatars", {
        session_id: sessionId, pixel_size: 40, posterize_bits: 3,
      });
      setAvatars((a) => [data, ...a]);
      toast.success("Pixel avatar created");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
    setPixelBusy(null);
  };

  const downloadAvatar = async (fileId) => {
    try {
      const r = await api.get(`/files/${fileId}`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = `atelier-pixel-avatar.png`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Download failed"); }
  };

  const shareAvatar = async (fileId) => {
    try {
      const r = await api.get(`/files/${fileId}`, { responseType: "blob" });
      const file = new File([r.data], "atelier-pixel-avatar.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My AtelierAI pixel avatar" });
      } else {
        downloadAvatar(fileId);
      }
    } catch {}
  };

  return (
    <main data-testid="wardrobe-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <p className="overline-label text-muted-foreground">Your private space</p>
      <h1 className="font-serif text-3xl sm:text-4xl mt-2 mb-8">Wardrobe</h1>

      <Tabs defaultValue="favorites">
        <TabsList className="mb-6 rounded-full bg-muted p-1 h-auto flex-wrap">
          <TabsTrigger data-testid="tab-favorites" value="favorites" className="rounded-full px-5 gap-2">
            <Heart size={13} /> Favorites {favorites.length > 0 && <span className="text-[10px] bg-brand-gold text-black rounded-full px-1.5">{favorites.length}</span>}
          </TabsTrigger>
          <TabsTrigger data-testid="tab-items" value="items" className="rounded-full px-5">Saved Items</TabsTrigger>
          <TabsTrigger data-testid="tab-outfits" value="outfits" className="rounded-full px-5">Outfits</TabsTrigger>
          <TabsTrigger data-testid="tab-sessions" value="sessions" className="rounded-full px-5">Try-On History</TabsTrigger>
          <TabsTrigger data-testid="tab-avatars" value="avatars" className="rounded-full px-5 gap-2"><Grid3x3 size={14}/> Pixel Avatars</TabsTrigger>
        </TabsList>

        <TabsContent value="favorites">
          {favorites.length === 0 ? (
            <EmptyState label="No favorites yet — heart a try-on render to save it here." link={{ to: "/try-on", text: "Run a try-on" }} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {favorites.map((s) => (
                <div key={s.id} className="bg-card border border-border rounded-2xl overflow-hidden relative group" data-testid={`favorite-${s.id}`}>
                  <div className="aspect-[3/4] bg-muted">
                    <PrivateImage fileId={s.result_file_id || s.photo_file_id} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-muted-foreground font-mono truncate">{s.adapter}</p>
                    <p className="text-xs">{new Date(s.started_at).toLocaleString()}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(s.products_snapshot || []).slice(0, 3).map((p) => (
                        <span key={p.id} className="text-[10px] px-2 py-1 bg-secondary rounded-full truncate max-w-[110px]">{p.name}</span>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        data-testid={`favorite-unfav-${s.id}`}
                        size="sm"
                        variant="outline"
                        className="flex-1 rounded-full gap-1.5"
                        onClick={() => toggleFavorite(s)}
                      >
                        <Heart size={12} className="fill-current" /> Unfavorite
                      </Button>
                      {s.pixel_avatar_id && (
                        <Link
                          to="/wardrobe"
                          data-testid={`favorite-avatar-${s.id}`}
                          className="text-xs px-3 py-1.5 rounded-full bg-brand-gold text-black inline-flex items-center gap-1"
                        >
                          <Sparkles size={12} /> Pixel
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

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
                <div key={s.id} className="bg-card border border-border rounded-xl overflow-hidden relative group" data-testid={`session-${s.id}`}>
                  <div className="aspect-[3/4] bg-muted">
                    <PrivateImage fileId={s.result_file_id || s.photo_file_id} className="w-full h-full object-cover" />
                  </div>
                  <button
                    data-testid={`session-fav-${s.id}`}
                    onClick={() => toggleFavorite(s)}
                    className={`absolute top-2 left-2 w-9 h-9 rounded-full backdrop-blur flex items-center justify-center transition ${
                      s.is_favorite ? "bg-brand-gold text-black" : "bg-background/85 text-foreground hover:bg-background"
                    }`}
                  >
                    <Heart size={14} className={s.is_favorite ? "fill-current" : ""} />
                  </button>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground font-mono truncate">{s.adapter}</p>
                    <p className="text-xs">{new Date(s.started_at).toLocaleString()}</p>
                    {!s.pixel_avatar_id && (
                      <Button
                        data-testid={`make-pixel-${s.id}`}
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 rounded-full gap-1.5 text-xs"
                        disabled={pixelBusy === s.id}
                        onClick={() => makePixel(s.id)}
                      >
                        <Sparkles size={12} /> {pixelBusy === s.id ? "Pixelating…" : "Make pixel"}
                      </Button>
                    )}
                  </div>
                  <button data-testid={`session-remove-${s.id}`} onClick={() => removeSession(s.id)} className="absolute top-2 right-2 w-8 h-8 bg-background/85 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="avatars">
          {avatars.length === 0 ? (
            <EmptyState label="No pixel avatars yet." link={{ to: "/try-on", text: "Favorite a try-on to auto-create one" }} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {avatars.map((av) => (
                <div key={av.id} className="bg-card border border-border rounded-xl overflow-hidden relative group" data-testid={`avatar-${av.id}`}>
                  <div className="aspect-square bg-muted">
                    <PrivateImage fileId={av.file_id} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground font-mono">
                      {av.pixel_size}px · posterize {av.posterize_bits}
                    </p>
                    <p className="text-xs">
                      {new Date(av.created_at).toLocaleDateString()}
                      {av.auto_generated && <span className="ml-1 text-brand-gold">· auto</span>}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button data-testid={`avatar-download-${av.id}`} size="sm" variant="outline" className="flex-1 rounded-full gap-1.5 text-xs" onClick={() => downloadAvatar(av.file_id)}>
                        <Download size={12} /> Save
                      </Button>
                      <Button data-testid={`avatar-share-${av.id}`} size="sm" className="flex-1 rounded-full text-xs" onClick={() => shareAvatar(av.file_id)}>
                        Share
                      </Button>
                    </div>
                  </div>
                  <button data-testid={`avatar-remove-${av.id}`} onClick={() => removeAvatar(av.id)} className="absolute top-2 right-2 w-8 h-8 bg-background/85 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
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

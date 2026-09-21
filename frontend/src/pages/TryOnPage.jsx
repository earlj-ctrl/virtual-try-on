import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, Upload, Sparkles, AlertTriangle, Zap, X, ChevronRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import PrivateImage from "@/components/PrivateImage";

const SLOTS = [
  { key: "top", label: "Top" },
  { key: "bottom", label: "Bottom" },
  { key: "dress", label: "Dress" },
  { key: "jacket", label: "Jacket" },
  { key: "shoes", label: "Shoes" },
  { key: "jewelry", label: "Jewelry" },
  { key: "accessory", label: "Accessory" },
];

const ADAPTERS = [
  { id: "mock", label: "Mock (Development Placeholder)", desc: "Instant. No real inference." },
  { id: "hf", label: "HF IDM-VTON (Real, Free)", desc: "Free HuggingFace Space. Slow/queue possible." },
];

async function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function TryOnPage() {
  const [params] = useSearchParams();
  const [step, setStep] = useState(1); // 1=photo, 2=garments, 3=render
  const [photo, setPhoto] = useState(null);
  const [products, setProducts] = useState([]);
  const [outfit, setOutfit] = useState({}); // {slot_key: product}
  const [activeSlot, setActiveSlot] = useState("top");
  const [adapter, setAdapter] = useState("mock");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const [camActive, setCamActive] = useState(false);

  useEffect(() => {
    api.get("/products").then(({ data }) => setProducts(data));
    const preset = params.get("product");
    if (preset) {
      api.get(`/products/${preset}`).then(({ data }) => {
        setOutfit((o) => ({ ...o, [data.category]: data }));
        setActiveSlot(data.category);
      }).catch(()=>{});
    }
  }, [params]);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    const b64 = await fileToBase64(f);
    setPhoto(b64);
    stopCam();
  };

  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCamActive(true);
      }
    } catch { toast.error("Camera unavailable"); }
  };

  const stopCam = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCamActive(false);
  };

  const capture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg", 0.85));
    stopCam();
  };

  const removePhoto = () => {
    setPhoto(null);
    stopCam();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Enforce one pick per category
  const pickForSlot = (slotKey, product) => {
    setOutfit((o) => {
      if (o[slotKey]?.id === product.id) {
        // toggle off
        const c = { ...o }; delete c[slotKey]; return c;
      }
      return { ...o, [slotKey]: product };
    });
  };

  const clearSlot = (slotKey) => setOutfit((o) => { const c = { ...o }; delete c[slotKey]; return c; });

  const selectedProducts = Object.values(outfit);
  const selectedCount = selectedProducts.length;

  const generate = async () => {
    if (!photo) { toast.error("Add a photo first"); setStep(1); return; }
    if (selectedCount === 0) { toast.error("Pick at least one garment"); setStep(2); return; }
    setBusy(true); setResult(null); setStep(3);
    try {
      const ids = selectedProducts.map((p) => p.id);
      const { data } = await api.post("/tryon/generate", {
        photo_base64: photo, product_ids: ids, adapter,
      });
      setResult(data);
      if (data.used_fallback) {
        toast.warning("Real engine failed — showed mock fallback (see notes)");
      } else if (adapter === "hf") {
        toast.success("Real IDM-VTON render complete");
      } else {
        toast.success("Preview ready");
      }
    } catch (e) {
      toast.error("Try-on failed");
    } finally {
      setBusy(false);
    }
  };

  const filtered = products.filter((p) => p.category === activeSlot);

  return (
    <main data-testid="tryon-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Stepper */}
      <ol className="mb-8 flex items-center gap-2 flex-wrap text-sm" data-testid="tryon-stepper">
        {[
          { n: 1, label: "Upload photo" },
          { n: 2, label: "Choose outfit" },
          { n: 3, label: "Render & view" },
        ].map((s, i, arr) => (
          <li key={s.n} className="flex items-center gap-2">
            <button
              data-testid={`step-${s.n}`}
              onClick={() => setStep(s.n)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition ${
                step === s.n ? "bg-primary text-primary-foreground border-primary" :
                step > s.n ? "border-border text-foreground" : "border-border text-muted-foreground"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono ${
                step >= s.n ? "bg-brand-gold text-black" : "bg-muted"
              }`}>{s.n}</span>
              {s.label}
            </button>
            {i < arr.length - 1 && <ChevronRight size={14} className="text-muted-foreground" />}
          </li>
        ))}
      </ol>

      <div className="grid lg:grid-cols-12 gap-8">
        <section className="lg:col-span-5 space-y-6">
          {/* STEP 1 · PHOTO */}
          {step === 1 && (
            <div className="bg-card border border-border rounded-2xl p-6" data-testid="step-photo">
              <p className="overline-label text-muted-foreground">Step 1 · Photo</p>
              <h2 className="font-serif text-2xl mt-1">Upload a full-body photo</h2>
              <p className="text-xs text-muted-foreground mt-2">
                Face the camera, arms slightly away from body, plain background works best.
              </p>

              <div className="mt-4 aspect-[3/4] rounded-xl overflow-hidden bg-muted flex items-center justify-center relative">
                {photo && !camActive && (
                  <img src={photo} alt="your upload" className="w-full h-full object-cover" data-testid="user-photo-preview" />
                )}
                <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-cover ${camActive ? "" : "hidden"}`} />
                {!photo && !camActive && (
                  <p className="text-sm text-muted-foreground">No photo yet.</p>
                )}
                {photo && !camActive && (
                  <button
                    data-testid="remove-photo-button"
                    onClick={removePhoto}
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-background/90 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition"
                    aria-label="Remove photo"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!photo && !camActive && (
                  <>
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border cursor-pointer hover:bg-secondary text-sm" data-testid="upload-photo-label">
                      <Upload size={14} /> Upload
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="upload-photo-input" />
                    </label>
                    <Button data-testid="camera-start" variant="outline" className="rounded-full gap-2" onClick={startCam}>
                      <Camera size={14} /> Camera
                    </Button>
                  </>
                )}
                {camActive && (
                  <>
                    <Button data-testid="camera-capture" onClick={capture} className="rounded-full">Capture</Button>
                    <Button data-testid="camera-stop" variant="ghost" className="rounded-full" onClick={stopCam}>Cancel</Button>
                  </>
                )}
                {photo && !camActive && (
                  <>
                    <Button data-testid="retake-photo" variant="outline" className="rounded-full gap-2" onClick={removePhoto}>
                      <RotateCcw size={14} /> Retake / Replace
                    </Button>
                    <Button data-testid="next-to-garments" className="rounded-full ml-auto" onClick={() => setStep(2)}>
                      Continue to outfit <ChevronRight size={14} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* STEP 2 · SLOTS */}
          {step === 2 && (
            <>
              <div className="bg-card border border-border rounded-2xl p-6" data-testid="step-garments">
                <p className="overline-label text-muted-foreground">Step 2 · Outfit</p>
                <h2 className="font-serif text-2xl mt-1">Pick one item per category</h2>
                <p className="text-xs text-muted-foreground mt-2">
                  You can mix and match one top, one bottom (or a dress), plus jacket, shoes, jewelry and accessory.
                </p>
                <div className="mt-4 grid grid-cols-4 gap-2" data-testid="outfit-slots">
                  {SLOTS.map((s) => {
                    const p = outfit[s.key];
                    const active = activeSlot === s.key;
                    return (
                      <button
                        key={s.key}
                        data-testid={`slot-${s.key}`}
                        onClick={() => setActiveSlot(s.key)}
                        className={`relative aspect-square rounded-xl border-2 overflow-hidden transition ${
                          active ? "border-foreground" : p ? "border-brand-gold/60" : "border-border hover:border-foreground/40"
                        }`}
                      >
                        {p ? (
                          <>
                            <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                            <span
                              role="button"
                              tabIndex={-1}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/85 backdrop-blur flex items-center justify-center cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); clearSlot(s.key); }}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); clearSlot(s.key); } }}
                              data-testid={`clear-slot-${s.key}`}
                            >
                              <X size={10} />
                            </span>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                            <span className="text-[10px] font-mono uppercase tracking-wider">{s.label}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6">
                <p className="overline-label text-muted-foreground">Choose a {activeSlot}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
                  {filtered.length === 0 && (
                    <p className="col-span-full text-sm text-muted-foreground py-10 text-center">
                      No items in this category.
                    </p>
                  )}
                  {filtered.map((p) => (
                    <button
                      key={p.id}
                      data-testid={`pick-${p.id}`}
                      onClick={() => pickForSlot(activeSlot, p)}
                      className={`relative aspect-[4/5] rounded-lg overflow-hidden border-2 transition ${
                        outfit[activeSlot]?.id === p.id ? "border-foreground" : "border-transparent hover:border-border"
                      }`}
                    >
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 left-1 right-1 text-[9px] bg-background/85 backdrop-blur px-1.5 py-0.5 rounded truncate">
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6">
                <p className="overline-label text-muted-foreground">Rendering adapter</p>
                <div className="mt-3 space-y-2">
                  {ADAPTERS.map((a) => (
                    <button
                      key={a.id}
                      data-testid={`adapter-${a.id}`}
                      onClick={() => setAdapter(a.id)}
                      className={`w-full text-left rounded-lg border p-3 transition ${
                        adapter === a.id ? "border-foreground bg-secondary" : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{a.label}</p>
                        {a.id === "hf" && <Zap size={14} className="brand-gold" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{a.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button data-testid="back-to-photo" variant="outline" className="rounded-full" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  data-testid="tryon-generate-button"
                  className="flex-1 rounded-full h-12 gap-2"
                  onClick={generate}
                  disabled={busy || !photo || selectedCount === 0}
                >
                  <Sparkles size={16} />
                  {busy ? (adapter === "hf" ? "Contacting HF (may queue 30-60s)…" : "Rendering…") : `Render (${selectedCount} item${selectedCount === 1 ? "" : "s"})`}
                </Button>
              </div>
            </>
          )}

          {/* STEP 3 · summary sidebar */}
          {step === 3 && (
            <div className="bg-card border border-border rounded-2xl p-6" data-testid="step-summary">
              <p className="overline-label text-muted-foreground">Your selections</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {selectedProducts.map((p) => (
                  <div key={p.id} className="rounded-lg overflow-hidden bg-muted">
                    <img src={p.image_url} alt={p.name} className="w-full aspect-square object-cover" />
                    <p className="text-[10px] p-2 truncate">{p.name}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 space-y-2">
                <Button data-testid="try-again" variant="outline" className="w-full rounded-full" onClick={() => setStep(2)}>
                  Adjust outfit
                </Button>
                <Button data-testid="new-tryon" className="w-full rounded-full" onClick={() => { setResult(null); setStep(1); }}>
                  New try-on
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* RESULT */}
        <section className="lg:col-span-7">
          <Alert data-testid="virtual-tryon-placeholder-badge" className="mb-4 border-brand-gold/50 bg-brand-gold/5">
            <AlertTriangle className="h-4 w-4 brand-gold" />
            <AlertTitle className="font-medium">2D single-view rendering</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              Current adapters produce a <strong>2D front-view render</strong>. Multi-view (side/rear) and 3D/360°
              rotation described in the objectives require additional pose-conditioning inputs and are on the
              research roadmap.
            </AlertDescription>
          </Alert>

          <div className="bg-card border border-border rounded-2xl p-6 min-h-[600px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="overline-label text-muted-foreground">Result canvas</p>
                <h2 className="font-serif text-2xl mt-1">Virtual Try-On</h2>
              </div>
              {result && (
                <Badge data-testid="tryon-adapter-badge" className={`uppercase tracking-wider text-[10px] ${result.used_fallback || result.adapter === "MockDevelopmentAdapter" ? "bg-amber-500/15 border-amber-500/40 text-amber-600" : "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"}`}>
                  {result.adapter}
                </Badge>
              )}
            </div>

            {busy && (
              <div data-testid="tryon-loading" className="mt-6 h-96 rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">
                  {adapter === "hf" ? "Waiting for HuggingFace Space (free tier can queue up to a minute)…" : "Running mock preprocessing pipeline…"}
                </p>
              </div>
            )}

            {!busy && !result && (
              <div className="mt-6 h-96 rounded-xl border border-dashed border-border flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {step === 3 ? "Preparing your render…" : "Complete steps 1 & 2, then generate."}
                </p>
              </div>
            )}

            {result && !busy && (
              <div className="mt-6" data-testid="tryon-result">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl overflow-hidden bg-muted aspect-[3/4] flex flex-col">
                    <PrivateImage fileId={result.photo_file_id} className="flex-1 w-full object-cover" alt="you" />
                    <p className="text-xs text-center py-2 text-muted-foreground">Your photo (private)</p>
                  </div>
                  <div className="rounded-xl overflow-hidden bg-muted aspect-[3/4] flex flex-col">
                    <PrivateImage fileId={result.result_file_id} className="flex-1 w-full object-cover" alt="rendered" />
                    <p className="text-xs text-center py-2 text-muted-foreground">Front view</p>
                  </div>
                </div>

                {result.used_fallback && (
                  <Alert className="mt-4 border-amber-500/50 bg-amber-500/5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle>Fallback used</AlertTitle>
                    <AlertDescription className="text-xs text-muted-foreground">
                      The real HF Space failed ({result.error?.slice(0,120) || "unknown"}) — we showed a mock so your session is not lost.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Link to="/wardrobe" data-testid="link-wardrobe" className="text-center text-xs rounded-lg bg-secondary py-3 hover:bg-muted transition">
                    View in Wardrobe
                  </Link>
                  <Link to={`/product/${selectedProducts[0]?.id || ""}`} data-testid="link-shop" className="text-center text-xs rounded-lg bg-secondary py-3 hover:bg-muted transition">
                    Find in stores
                  </Link>
                  <button
                    data-testid="tryon-adjust"
                    onClick={() => setStep(2)}
                    className="text-center text-xs rounded-lg bg-secondary py-3 hover:bg-muted transition"
                  >
                    Adjust items
                  </button>
                  <button
                    data-testid="tryon-restart"
                    onClick={() => { setResult(null); setStep(1); setOutfit({}); setPhoto(null); }}
                    className="text-center text-xs rounded-lg bg-primary text-primary-foreground py-3 hover:opacity-90 transition"
                  >
                    New try-on
                  </button>
                </div>

                <div className="mt-4 p-4 bg-muted/40 rounded-xl text-xs text-muted-foreground space-y-1 font-mono">
                  <p><span>status:</span> {result.status}</p>
                  <p><span>duration_ms:</span> {result.duration_ms}</p>
                  <p><span>confidence:</span> {result.confidence}</p>
                  <p><span>notes:</span> {result.notes}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

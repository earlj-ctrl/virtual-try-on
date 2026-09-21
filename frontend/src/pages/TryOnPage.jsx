import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, Upload, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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
  const [photo, setPhoto] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);
  const [camActive, setCamActive] = useState(false);

  useEffect(() => {
    api.get("/products").then(({ data }) => setProducts(data));
    const preset = params.get("product");
    if (preset) setSelectedIds([preset]);
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

  const toggle = (pid) => setSelectedIds((prev) => prev.includes(pid) ? prev.filter(p=>p!==pid) : [...prev, pid]);

  const generate = async () => {
    if (!photo) { toast.error("Add a photo first"); return; }
    if (selectedIds.length === 0) { toast.error("Pick at least one garment"); return; }
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post("/tryon/generate", { photo_base64: photo, product_ids: selectedIds });
      setResult(data);
      toast.success("Try-on preview ready (Development Placeholder)");
    } catch (e) {
      toast.error("Try-on failed");
    } finally {
      setBusy(false);
    }
  };

  const selectedProducts = products.filter((p) => selectedIds.includes(p.id));

  return (
    <main data-testid="tryon-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Alert data-testid="virtual-tryon-placeholder-badge" className="mb-8 border-brand-gold/50 bg-brand-gold/5">
        <AlertTriangle className="h-4 w-4 brand-gold" />
        <AlertTitle className="font-medium">Development / Integration Placeholder</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          This viewer runs the <span className="font-mono">MockDevelopmentAdapter</span>. Output is a composed
          preview of your photo + garment images — it is <strong>not</strong> a real VITON-HD render. The
          architecture is ready for a compatible model server.
        </AlertDescription>
      </Alert>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* LEFT: photo + products */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6">
            <p className="overline-label text-muted-foreground">Step 1</p>
            <h2 className="font-serif text-2xl mt-1">Your photo</h2>

            <div className="mt-4 aspect-[3/4] rounded-xl overflow-hidden bg-muted flex items-center justify-center relative">
              {photo && !camActive && (
                <img src={photo} alt="your upload" className="w-full h-full object-cover" data-testid="user-photo-preview" />
              )}
              <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-cover ${camActive ? "" : "hidden"}`} />
              {!photo && !camActive && (
                <p className="text-sm text-muted-foreground">No photo yet.</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border cursor-pointer hover:bg-secondary text-sm" data-testid="upload-photo-label">
                <Upload size={14} /> Upload
                <input type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="upload-photo-input" />
              </label>
              {!camActive ? (
                <Button data-testid="camera-start" variant="outline" className="rounded-full gap-2" onClick={startCam}>
                  <Camera size={14} /> Camera
                </Button>
              ) : (
                <>
                  <Button data-testid="camera-capture" onClick={capture} className="rounded-full">Capture</Button>
                  <Button data-testid="camera-stop" variant="ghost" className="rounded-full" onClick={stopCam}>Cancel</Button>
                </>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <p className="overline-label text-muted-foreground">Step 2</p>
            <h2 className="font-serif text-2xl mt-1">Pick garment(s)</h2>
            <div className="mt-4 grid grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
              {products.map((p) => (
                <button
                  key={p.id}
                  data-testid={`pick-${p.id}`}
                  onClick={() => toggle(p.id)}
                  className={`relative aspect-[4/5] rounded-lg overflow-hidden border-2 transition ${
                    selectedIds.includes(p.id) ? "border-foreground" : "border-transparent hover:border-border"
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

          <Button
            data-testid="tryon-generate-button"
            size="lg"
            className="w-full rounded-full h-12 gap-2"
            onClick={generate}
            disabled={busy || !photo || selectedIds.length === 0}
          >
            <Sparkles size={16} />
            {busy ? "Rendering (mock adapter)…" : "Generate Try-On Preview"}
          </Button>
        </section>

        {/* RIGHT: result */}
        <section className="lg:col-span-7">
          <div className="bg-card border border-border rounded-2xl p-6 min-h-[600px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="overline-label text-muted-foreground">Result canvas</p>
                <h2 className="font-serif text-2xl mt-1">AI Preview</h2>
              </div>
              {result && (
                <Badge data-testid="tryon-adapter-badge" className="uppercase tracking-wider text-[10px] bg-brand-gold/15 border-brand-gold/40 brand-gold">
                  {result.adapter}
                </Badge>
              )}
            </div>

            {busy && (
              <div data-testid="tryon-loading" className="mt-6 h-96 rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Running mock preprocessing pipeline…</p>
              </div>
            )}

            {!busy && !result && (
              <div className="mt-6 h-96 rounded-xl border border-dashed border-border flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Your generated preview will appear here.</p>
              </div>
            )}

            {result && !busy && (
              <div className="mt-6" data-testid="tryon-result">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl overflow-hidden bg-muted aspect-[3/4]">
                    <img src={result.user_photo} alt="you" className="w-full h-full object-cover" />
                    <p className="text-xs text-center py-2 text-muted-foreground">Your photo</p>
                  </div>
                  <div className="rounded-xl overflow-hidden bg-muted aspect-[3/4] grid grid-cols-1">
                    {(result.products_snapshot || []).slice(0, 3).map((p) => (
                      <img key={p.id} src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    ))}
                    <p className="text-xs text-center py-2 text-muted-foreground">Selected garments</p>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-muted/40 rounded-xl text-xs text-muted-foreground space-y-1">
                  <p><span className="font-mono">status:</span> {result.status}</p>
                  <p><span className="font-mono">duration_ms:</span> {result.duration_ms}</p>
                  <p><span className="font-mono">confidence:</span> {result.confidence} <span className="italic">(mock — not real inference)</span></p>
                  <p><span className="font-mono">notes:</span> {result.notes}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

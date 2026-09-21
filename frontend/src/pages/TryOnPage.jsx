import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, Upload, Sparkles, AlertTriangle, Zap } from "lucide-react";
import { toast } from "sonner";
import PrivateImage from "@/components/PrivateImage";

async function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

const ADAPTERS = [
  { id: "mock", label: "Mock (Development Placeholder)", desc: "Instant. No real inference." },
  { id: "hf", label: "HF IDM-VTON (Real, Free)", desc: "Free HuggingFace Space. Slow/queue possible." },
];

export default function TryOnPage() {
  const [params] = useSearchParams();
  const [photo, setPhoto] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [adapter, setAdapter] = useState("mock");
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
      const { data } = await api.post("/tryon/generate", {
        photo_base64: photo, product_ids: selectedIds, adapter,
      });
      setResult(data);
      if (data.used_fallback) {
        toast.warning("Real engine failed — showed mock fallback (see notes)");
      } else if (adapter === "hf") {
        toast.success("Real IDM-VTON render complete");
      } else {
        toast.success("Mock preview ready");
      }
    } catch (e) {
      toast.error("Try-on failed");
    } finally {
      setBusy(false);
    }
  };

  const showRealBadge = adapter === "hf";

  return (
    <main data-testid="tryon-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Alert data-testid="virtual-tryon-placeholder-badge" className="mb-6 border-brand-gold/50 bg-brand-gold/5">
        <AlertTriangle className="h-4 w-4 brand-gold" />
        <AlertTitle className="font-medium">Two adapters available</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          <strong>Mock</strong> is the honest Development Placeholder — no real inference.
          <strong> HF IDM-VTON</strong> runs against a free HuggingFace Space and returns a real garment render
          (slow/queued at times). If it fails, we fall back to Mock and label it clearly.
        </AlertDescription>
      </Alert>

      <div className="grid lg:grid-cols-12 gap-8">
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

          <div className="bg-card border border-border rounded-2xl p-6">
            <p className="overline-label text-muted-foreground">Step 3 · Adapter</p>
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

          <Button
            data-testid="tryon-generate-button"
            size="lg"
            className="w-full rounded-full h-12 gap-2"
            onClick={generate}
            disabled={busy || !photo || selectedIds.length === 0}
          >
            <Sparkles size={16} />
            {busy ? (adapter === "hf" ? "Contacting HF Space (may queue 30-60s)…" : "Rendering mock…") : "Generate Try-On"}
          </Button>
        </section>

        <section className="lg:col-span-7">
          <div className="bg-card border border-border rounded-2xl p-6 min-h-[600px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="overline-label text-muted-foreground">Result canvas</p>
                <h2 className="font-serif text-2xl mt-1">AI Preview</h2>
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
                  {adapter === "hf" ? "Waiting for HuggingFace Space (free tier can queue for up to a minute)…" : "Running mock preprocessing pipeline…"}
                </p>
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
                  <div className="rounded-xl overflow-hidden bg-muted aspect-[3/4] flex flex-col">
                    <PrivateImage fileId={result.photo_file_id} className="flex-1 w-full object-cover" alt="you" />
                    <p className="text-xs text-center py-2 text-muted-foreground">Your photo (private)</p>
                  </div>
                  <div className="rounded-xl overflow-hidden bg-muted aspect-[3/4] flex flex-col">
                    <PrivateImage fileId={result.result_file_id} className="flex-1 w-full object-cover" alt="rendered" />
                    <p className="text-xs text-center py-2 text-muted-foreground">Rendered result</p>
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

import { useState } from "react";
import { api, BACKEND_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export default function AdminExport() {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadPreview = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/admin/export", { params: { format: "json" } });
      setPreview(data);
    } catch { toast.error("Load failed"); }
    setBusy(false);
  };

  const downloadCSV = async () => {
    try {
      const r = await api.get("/admin/export", { params: { format: "csv" }, responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = "atelier_export.csv"; a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch { toast.error("Download failed"); }
  };

  const downloadJSON = async () => {
    try {
      const { data } = await api.get("/admin/export", { params: { format: "json" } });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "atelier_export.json"; a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON downloaded");
    } catch { toast.error("Download failed"); }
  };

  return (
    <div data-testid="admin-export">
      <p className="overline-label text-muted-foreground">Research</p>
      <h1 className="font-serif text-3xl mt-2 mb-6">Anonymised data export</h1>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Aggregate analytics for research purposes only. User identifiers are hashed with the app
          secret (deterministic pseudonyms — cannot be reversed to email/name).
          <br />
          <strong>Never exported:</strong> user photos, body measurements, product image binaries.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button data-testid="export-csv" onClick={downloadCSV} className="rounded-full gap-2">
            <FileSpreadsheet size={16} /> Download CSV
          </Button>
          <Button data-testid="export-json" onClick={downloadJSON} variant="outline" className="rounded-full gap-2">
            <FileJson size={16} /> Download JSON
          </Button>
        </div>
        <Button variant="ghost" onClick={loadPreview} disabled={busy} data-testid="export-preview">
          {busy ? "Loading…" : "Preview data"}
        </Button>

        {preview && (
          <div className="mt-4">
            <p className="text-xs font-mono text-muted-foreground mb-2">{preview.count} rows</p>
            <div className="max-h-96 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    {["type","anon_user_id","adapter","status","product_categories","platform","timestamp"].map(c => (
                      <th key={c} className="text-left px-3 py-2 font-mono">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 40).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-1.5">{r.type}</td>
                      <td className="px-3 py-1.5 font-mono">{r.anon_user_id}</td>
                      <td className="px-3 py-1.5">{r.adapter || "—"}</td>
                      <td className="px-3 py-1.5">{r.status || "—"}</td>
                      <td className="px-3 py-1.5">{r.product_categories || "—"}</td>
                      <td className="px-3 py-1.5">{r.platform || "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

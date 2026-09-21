import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

const EMPTY = {
  name: "", description: "", brand: "", category: "top", subcategory: "",
  style: [], color: "", price: 0, currency: "PHP", image_url: "",
  source_platform: "manual", source_url: "", tags: [], active: true,
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    const { data } = await api.get("/admin/products");
    setProducts(data);
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (p) => {
    setEditing(p.id);
    setForm({ ...EMPTY, ...p, style: p.style || [], tags: p.tags || [] });
    setOpen(true);
  };

  const submit = async () => {
    const payload = {
      ...form,
      price: Number(form.price) || 0,
      style: Array.isArray(form.style) ? form.style : String(form.style).split(",").map(s=>s.trim()).filter(Boolean),
      tags: Array.isArray(form.tags) ? form.tags : String(form.tags).split(",").map(s=>s.trim()).filter(Boolean),
    };
    try {
      if (editing) await api.put(`/admin/products/${editing}`, payload);
      else await api.post("/admin/products", payload);
      setOpen(false);
      toast.success(editing ? "Product updated" : "Product created");
      load();
    } catch (e) { toast.error("Save failed"); }
  };

  const del = async (id) => {
    if (!confirm("Delete this product?")) return;
    await api.delete(`/admin/products/${id}`);
    toast.success("Deleted");
    load();
  };

  return (
    <div data-testid="admin-products">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="overline-label text-muted-foreground">Catalog</p>
          <h1 className="font-serif text-3xl mt-2">Product management</h1>
        </div>
        <Button onClick={startCreate} className="rounded-full gap-2" data-testid="admin-add-product">
          <Plus size={14} /> Add product
        </Button>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm" data-testid="admin-products-table">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Image</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Brand</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2"><img src={p.image_url} alt="" className="w-12 h-14 rounded object-cover" /></td>
                <td className="px-4 py-2">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{(p.style || []).join(" · ")}</p>
                </td>
                <td className="px-4 py-2 capitalize">{p.category}</td>
                <td className="px-4 py-2">{p.brand}</td>
                <td className="px-4 py-2 text-right font-mono">₱{Number(p.price || 0).toLocaleString()}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(p)} data-testid={`admin-edit-${p.id}`}><Pencil size={14} /></Button>
                  <Button size="icon" variant="ghost" onClick={() => del(p.id)} data-testid={`admin-delete-${p.id}`}><Trash2 size={14} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="admin-product-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Name"><Input data-testid="admin-form-name" value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})} /></Field>
            <Field label="Brand"><Input value={form.brand} onChange={(e)=>setForm({...form, brand: e.target.value})} /></Field>
            <Field label="Category">
              <select
                data-testid="admin-form-category"
                value={form.category}
                onChange={(e)=>setForm({...form, category: e.target.value})}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {["top","bottom","dress","jacket","shoes","jewelry","accessory"].map((c)=><option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Subcategory"><Input value={form.subcategory || ""} onChange={(e)=>setForm({...form, subcategory: e.target.value})} /></Field>
            <Field label="Price (PHP)"><Input data-testid="admin-form-price" type="number" value={form.price} onChange={(e)=>setForm({...form, price: e.target.value})} /></Field>
            <Field label="Color"><Input value={form.color || ""} onChange={(e)=>setForm({...form, color: e.target.value})} /></Field>
            <Field label="Styles (comma sep)"><Input value={Array.isArray(form.style) ? form.style.join(", ") : form.style} onChange={(e)=>setForm({...form, style: e.target.value})} /></Field>
            <Field label="Tags (comma sep)"><Input value={Array.isArray(form.tags) ? form.tags.join(", ") : form.tags} onChange={(e)=>setForm({...form, tags: e.target.value})} /></Field>
            <Field label="Image URL" className="sm:col-span-2"><Input data-testid="admin-form-image" value={form.image_url} onChange={(e)=>setForm({...form, image_url: e.target.value})} /></Field>
            <Field label="Source URL" className="sm:col-span-2"><Input value={form.source_url || ""} onChange={(e)=>setForm({...form, source_url: e.target.value})} /></Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={submit} data-testid="admin-form-submit">{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

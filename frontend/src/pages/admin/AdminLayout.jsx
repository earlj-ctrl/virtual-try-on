import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, ShoppingBag, Users, ScrollText, Download, Upload } from "lucide-react";
import { api } from "@/lib/api";

const items = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/products", label: "Products", icon: ShoppingBag },
  { to: "/admin/import", label: "Import", icon: Upload },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/audit", label: "Audit Logs", icon: ScrollText },
  { to: "/admin/export", label: "Research Export", icon: Download },
];

export default function AdminLayout() {
  return (
    <div data-testid="admin-layout" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-3">
          <div className="bg-card border border-border rounded-2xl p-4 sticky top-24">
            <p className="overline-label text-muted-foreground px-2 pb-3">Admin Console</p>
            <nav className="space-y-1">
              {items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  data-testid={`admin-nav-${it.label.toLowerCase().replace(/\s/g, '-')}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                      isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`
                  }
                >
                  <it.icon size={16} /> {it.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>
        <main className="lg:col-span-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AdminOverview() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/admin/stats").then(({ data }) => setStats(data)).catch(() => {}); }, []);

  return (
    <div data-testid="admin-overview">
      <p className="overline-label text-muted-foreground">Overview</p>
      <h1 className="font-serif text-3xl mt-2 mb-6">System health & KPIs</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Users", stats?.total_users],
          ["Products", stats?.total_products],
          ["Try-Ons", stats?.total_tryons],
          ["Shop Clicks", stats?.total_shopping_clicks],
        ].map(([label, val]) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-5" data-testid={`kpi-${label.toLowerCase().replace(/\s/g,'-')}`}>
            <p className="overline-label text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-serif">{val ?? "—"}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-card border border-border rounded-2xl p-6">
        <p className="overline-label text-muted-foreground">Service Health</p>
        <div className="mt-4 space-y-3">
          <HealthRow label="Database" status="Operational" tone="ok" />
          <HealthRow label="AI Adapter" status="Mock + HF IDM-VTON (free)" tone="ok" />
          <HealthRow label="Object Storage" status="Emergent Object Storage" tone="ok" />
          <HealthRow label="Authentication" status="Operational" tone="ok" />
        </div>
      </div>

      <div className="mt-6 bg-card border border-border rounded-2xl p-6">
        <p className="overline-label text-muted-foreground">Catalog by category</p>
        <div className="mt-4 space-y-2">
          {(stats?.categories || []).map((c) => (
            <div key={c.category} className="flex items-center gap-3">
              <span className="w-24 text-sm capitalize">{c.category}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, c.count * 15)}%` }} />
              </div>
              <span className="text-xs font-mono w-8 text-right">{c.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HealthRow({ label, status, tone }) {
  const dot = tone === "ok" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className={`w-2 h-2 rounded-full ${dot}`} /> {status}
      </span>
    </div>
  );
}

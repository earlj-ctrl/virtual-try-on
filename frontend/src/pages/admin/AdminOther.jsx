import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function AdminUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => { api.get("/admin/users").then(({ data }) => setUsers(data)); }, []);
  return (
    <div data-testid="admin-users">
      <p className="overline-label text-muted-foreground">Users</p>
      <h1 className="font-serif text-3xl mt-2 mb-6">User accounts</h1>
      <p className="text-xs text-muted-foreground mb-4">Admins do not view private body measurements or photos here.</p>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Email</th><th className="text-left px-4 py-3">Role</th><th className="text-left px-4 py-3">Joined</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2 uppercase tracking-wider text-xs">{u.role}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminAudit() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/admin/audit-logs").then(({ data }) => setLogs(data)); }, []);
  return (
    <div data-testid="admin-audit">
      <p className="overline-label text-muted-foreground">Audit Logs</p>
      <h1 className="font-serif text-3xl mt-2 mb-6">Recent admin actions</h1>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left px-4 py-3">Timestamp</th><th className="text-left px-4 py-3">Action</th><th className="text-left px-4 py-3">Resource</th><th className="text-left px-4 py-3">Status</th></tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No audit entries yet.</td></tr>
            )}
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{l.timestamp}</td>
                <td className="px-4 py-2">{l.action}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.resource_id}</td>
                <td className="px-4 py-2">{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

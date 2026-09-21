import { Link, NavLink, useNavigate } from "react-router-dom";
import { Sun, Moon, User, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const links = [
  { to: "/catalog", label: "Catalog" },
  { to: "/try-on", label: "Virtual Try-On" },
  { to: "/outfit-builder", label: "Outfit Builder" },
  { to: "/wardrobe", label: "Wardrobe" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  return (
    <header
      data-testid="site-navbar"
      className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" data-testid="nav-logo" className="flex items-center gap-2 group">
          <span className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Sparkles size={16} className="text-primary-foreground" />
          </span>
          <span className="font-serif text-xl tracking-tight">Atelier<span className="brand-gold">AI</span></span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              data-testid={`nav-${l.to.replace("/", "")}`}
              className={({ isActive }) =>
                `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            data-testid="theme-toggle-button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </Button>

          {user && user !== false ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="user-menu-button" variant="outline" className="rounded-full pl-2 pr-3 gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-sm max-w-[110px] truncate">{user.name || user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="menu-profile" onClick={() => navigate("/profile")}>
                  <User size={14} className="mr-2" /> Profile
                </DropdownMenuItem>
                {user.role === "admin" && (
                  <DropdownMenuItem data-testid="menu-admin" onClick={() => navigate("/admin")}>
                    <Sparkles size={14} className="mr-2" /> Admin Console
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="menu-logout"
                  onClick={async () => { await logout(); navigate("/"); }}
                >
                  <LogOut size={14} className="mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button data-testid="nav-login" variant="ghost" onClick={() => navigate("/login")}>
                Sign in
              </Button>
              <Button data-testid="nav-signup" onClick={() => navigate("/signup")} className="rounded-full">
                Get started
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

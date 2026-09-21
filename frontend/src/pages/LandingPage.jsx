import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Camera, Layers, Store, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

const HERO = "https://images.unsplash.com/photo-1611042553484-d61f84d22784?crop=entropy&cs=srgb&fm=jpg&w=1600&q=80";
const IMG_A = "https://images.unsplash.com/photo-1613915617430-8ab0fd7c6baf?crop=entropy&cs=srgb&fm=jpg&w=800&q=80";
const IMG_B = "https://images.pexels.com/photos/5745783/pexels-photo-5745783.jpeg?auto=compress&cs=tinysrgb&w=800";
const IMG_C = "https://images.unsplash.com/photo-1721103418218-416182aca079?crop=entropy&cs=srgb&fm=jpg&w=800&q=80";

const partners = ["Zalora PH", "Shopee", "Lazada", "Bench", "Kultura", "Penshoppe"];

export default function LandingPage() {
  return (
    <main data-testid="landing-page" className="grain-overlay">
      {/* HERO */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6">
            <p className="overline-label text-muted-foreground mb-4">
              Research Prototype · Web-based AI Virtual Try-On
            </p>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
              The Atelier of{" "}
              <span className="italic text-brand-gold">Intelligent Style</span>.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              Discover Filipino & global fashion, build outfits on our canvas,
              and preview them on you — powered by an AI virtual try-on adapter
              designed for VITON-HD integration.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full h-12 px-6 gap-2" data-testid="hero-cta-tryon">
                <Link to="/try-on">
                  Experience AI Try-On <ArrowRight size={16} />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full h-12 px-6" data-testid="hero-cta-catalog">
                <Link to="/catalog">Explore Catalog</Link>
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
              {partners.slice(0, 4).map((p) => (
                <span key={p} className="font-mono uppercase tracking-wider">{p}</span>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 grid grid-cols-6 grid-rows-6 gap-3 h-[560px]">
            <div className="col-span-4 row-span-4 rounded-2xl overflow-hidden bg-muted relative">
              <img src={HERO} alt="editorial fashion" className="w-full h-full object-cover" />
              <div className="absolute bottom-4 left-4 right-4 bg-background/85 backdrop-blur-xl rounded-xl p-4 border border-border/50">
                <p className="overline-label text-muted-foreground">Development Placeholder</p>
                <p className="text-sm mt-1">AI adapter simulates try-on. Ready for VITON-HD integration.</p>
              </div>
            </div>
            <div className="col-span-2 row-span-2 rounded-2xl overflow-hidden bg-muted">
              <img src={IMG_A} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="col-span-2 row-span-2 rounded-2xl overflow-hidden bg-muted">
              <img src={IMG_C} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="col-span-6 row-span-2 rounded-2xl overflow-hidden bg-muted">
              <img src={IMG_B} alt="" className="w-full h-full object-cover object-top" />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-border">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <p className="overline-label text-muted-foreground">Core Modules</p>
            <h2 className="font-serif text-3xl sm:text-4xl mt-2">Everything you need to explore fashion, intelligently.</h2>
          </div>
          <p className="max-w-sm text-muted-foreground text-sm">
            A modular architecture for research, ready to slot in VITON-HD or
            any compatible model server.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Camera, title: "AI Body Estimation", desc: "Upload a full-body photo or use your camera. Preprocessed via the mock adapter pipeline." },
            { icon: Layers, title: "Outfit Canvas", desc: "Compose looks slot by slot — top, bottom, dress, jacket, jewelry, accessories, shoes." },
            { icon: Store, title: "PH Shopping Links", desc: "Redirect to Lazada, Shopee, Bench, Kultura, and Zalora PH. Never a checkout inside." },
            { icon: Heart, title: "Private Wardrobe", desc: "Save items, outfits, and try-on renders. Owner-only visibility, enforced server-side." },
          ].map((f, idx) => (
            <div
              key={f.title}
              data-testid={`feature-card-${idx}`}
              className="bg-card border border-border rounded-2xl p-6 hover:border-foreground/30 transition"
            >
              <span className="inline-flex w-10 h-10 rounded-full bg-secondary items-center justify-center mb-4">
                <f.icon size={18} />
              </span>
              <h3 className="text-lg font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PARTNERS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-border">
        <p className="overline-label text-muted-foreground text-center">Philippine Shopping Partners</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {partners.map((p) => (
            <span key={p} className="font-serif text-2xl text-muted-foreground/70 hover:text-foreground transition">
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="bg-primary text-primary-foreground rounded-3xl p-10 sm:p-16 relative overflow-hidden">
          <div className="max-w-2xl">
            <Sparkles size={20} className="brand-gold" />
            <h2 className="font-serif text-3xl sm:text-4xl mt-4">
              Ready to see it on you?
            </h2>
            <p className="mt-4 text-primary-foreground/70 text-base leading-relaxed">
              Start your Atelier account, build a wardrobe, and preview outfits.
              All virtual try-on results remain private to you.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg" variant="secondary" className="rounded-full h-12 px-6" data-testid="cta-signup">
                <Link to="/signup">Create free account</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="rounded-full h-12 px-6 text-primary-foreground hover:bg-primary-foreground/10" data-testid="cta-catalog">
                <Link to="/catalog">Browse catalog</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} AtelierAI · Research Prototype · No internal checkout.</p>
      </footer>
    </main>
  );
}

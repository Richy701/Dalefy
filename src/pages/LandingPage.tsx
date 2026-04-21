import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Map, Sparkles, Palette, Users, Link2, FileDown, ChevronDown, Menu, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/shared/Logo";
import { BRAND } from "@/config/brand";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

const fadeUp = "animate-[fade-up_0.6s_cubic-bezier(0.16,1,0.3,1)_both]";

/* ── iPhone Mockup ─────────────────────────────────────────────────────────
   Pure SVG frame (430×880 viewBox matching iPhone 15 Pro proportions).
   The screenshot fills the screen cutout via absolute positioning.
   No images for the device chrome — everything is vector.                  */

function PhoneMockup({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const frame = dark ? "#1a1a1a" : "#e2e2e2";
  const edgeOuter = dark ? "#444" : "#ccc";
  const edgeInner = dark ? "#222" : "#d9d9d9";
  const bezel = dark ? "#0d0d0d" : "#bbb";
  const buttons = dark ? "#2a2a2a" : "#c5c5c5";

  return (
    <div className={cn("relative", className)} style={style}>
      {/* Screenshot — fills the screen area */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: "1.48%",
          left: "3.02%",
          width: "93.95%",
          height: "97.05%",
          borderRadius: "8.4% / 4%",
        }}
      >
        <img src={src} alt={alt} className="w-full h-full object-cover object-top" loading="lazy" />
      </div>

      {/* SVG device frame */}
      <svg
        viewBox="0 0 430 880"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full h-auto block"
        overflow="visible"
      >
        {/* Outer metallic edge highlight */}
        <rect x="0.5" y="0.5" width="429" height="879" rx="57.5" stroke={edgeOuter} strokeWidth="1" />
        <rect x="1.5" y="1.5" width="427" height="877" rx="56.5" stroke={edgeInner} strokeWidth="1" />

        {/* Frame body with screen cutout (evenodd) */}
        <path
          fillRule="evenodd"
          d="M58 0H372C405.1 0 430 24.9 430 58V822C430 855.1 405.1 880 372 880H58C24.9 880 0 855.1 0 822V58C0 24.9 24.9 0 58 0ZM47 13C28.2 13 13 28.2 13 47V833C13 851.8 28.2 867 47 867H383C401.8 867 417 851.8 417 833V47C417 28.2 401.8 13 383 13H47Z"
          fill={frame}
        />

        {/* Inner screen bezel — subtle inset ring */}
        <rect x="12.5" y="12.5" width="405" height="855" rx="34.5" stroke={bezel} strokeWidth="1" />

        {/* Side buttons — left: action, vol up, vol down | right: power */}
        <rect x="-3.5" y="190" width="4" height="34" rx="2" fill={buttons} />
        <rect x="-3.5" y="250" width="4" height="64" rx="2" fill={buttons} />
        <rect x="-3.5" y="326" width="4" height="64" rx="2" fill={buttons} />
        <rect x="429.5" y="270" width="4" height="96" rx="2" fill={buttons} />
      </svg>
    </div>
  );
}

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
] as const;

const CAPABILITIES = [
  { icon: Map, title: "Route Maps", desc: "Live Mapbox maps with animated arcs between every stop." },
  { icon: Sparkles, title: "AI Import", desc: "Drop a PDF — flights, hotels, activities extracted instantly." },
  { icon: Palette, title: "White-Label", desc: "Your logo and colors on every shared page and PDF." },
  { icon: Users, title: "Collaboration", desc: "Roles, permissions, live edits on one itinerary." },
  { icon: Link2, title: "Shareable Links", desc: "Public trip pages — no account needed for clients." },
  { icon: FileDown, title: "PDF Export", desc: "One-click branded PDFs ready to send." },
] as const;

const FAQ = [
  {
    q: "Is there a free plan?",
    a: "Yes — you can explore the full demo without creating an account. Sign up when you're ready.",
  },
  {
    q: "Can I import existing itineraries?",
    a: "Drop a PDF or paste text and the AI parser will extract flights, hotels, and activities automatically.",
  },
  {
    q: "Can my clients see the trip without logging in?",
    a: "Every trip has a shareable public link. Your clients just open it — no sign-up, no app download.",
  },
  {
    q: "Can I brand it with my agency?",
    a: "Upload your logo, pick your colors, and set your company name. Every shared trip page and exported PDF carries your branding.",
  },
] as const;

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
] as const;

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 dark:border-white/[0.04]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left cursor-pointer group"
      >
        <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-brand transition-colors">{q}</span>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 dark:text-[#555] shrink-0 ml-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <p className="text-sm text-slate-500 dark:text-[#888] leading-relaxed pb-5 -mt-1">{a}</p>
      )}
    </div>
  );
}

function scrollTo(href: string) {
  const id = href.replace("#", "");
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-white dark:bg-[#050505] text-slate-900 dark:text-white selection:bg-brand/30">
      {/* ── Nav ────────���───────────────────���────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 dark:bg-[#050505]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/[0.04]">
        <div className="mx-auto max-w-6xl flex items-center justify-between h-14 px-5">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-brand rounded-lg flex items-center justify-center logo-shimmer">
              <Logo className="text-black h-4 w-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-tight">
              {BRAND.nameUpper}
            </span>
          </div>

          {/* Desktop links */}
          <div className="hidden sm:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => scrollTo(link.href)}
                className="text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-900 dark:text-[#666] dark:hover:text-white transition-colors cursor-pointer"
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Desktop actions */}
          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 text-slate-400 hover:text-slate-900 dark:text-[#666] dark:hover:text-white transition-colors cursor-pointer"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigate("/login")}
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-900 dark:text-[#666] dark:hover:text-white transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <Button
              className="h-8 px-4 rounded-lg bg-brand hover:brightness-110 text-black text-[10px] font-bold uppercase tracking-wider"
              onClick={() => navigate("/login")}
            >
              Get Started
            </Button>
          </div>

          {/* Mobile menu */}
          <div className="sm:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button className="p-2 text-slate-400 hover:text-slate-900 dark:text-[#666] dark:hover:text-white transition-colors cursor-pointer">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-white dark:bg-[#0a0a0a] border-slate-200 dark:border-white/[0.04] w-64 p-0">
                <div className="flex flex-col h-full pt-12 px-6">
                  <div className="flex flex-col gap-1">
                    {NAV_LINKS.map((link) => (
                      <button
                        key={link.label}
                        onClick={() => {
                          setMobileOpen(false);
                          scrollTo(link.href);
                        }}
                        className="text-sm font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:text-[#888] dark:hover:text-white transition-colors cursor-pointer py-3 text-left"
                      >
                        {link.label}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-200 dark:border-white/[0.06] mt-4 pt-4 flex flex-col gap-3">
                    <button
                      onClick={toggleTheme}
                      className="text-sm font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:text-[#888] dark:hover:text-white transition-colors cursor-pointer py-2 text-left flex items-center gap-2"
                    >
                      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                      {theme === "dark" ? "Light Mode" : "Dark Mode"}
                    </button>
                    <button
                      onClick={() => {
                        setMobileOpen(false);
                        navigate("/login");
                      }}
                      className="text-sm font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:text-[#888] dark:hover:text-white transition-colors cursor-pointer py-2 text-left"
                    >
                      Sign In
                    </button>
                    <Button
                      className="h-10 rounded-lg bg-brand hover:brightness-110 text-black text-xs font-bold uppercase tracking-wider w-full"
                      onClick={() => {
                        setMobileOpen(false);
                        navigate("/login");
                      }}
                    >
                      Get Started
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {/* ── Hero ─���───────────────────────────────────────��──────────── */}
      <section className="pt-32 sm:pt-40 pb-6 px-5">
        <div className="mx-auto max-w-4xl text-center">
          <h1
            className={cn(fadeUp, "text-[clamp(2.5rem,8vw,6rem)] font-black uppercase leading-[0.9] tracking-[-0.02em]")}
          >
            Trip planning
            <br />
            <span className="text-brand">without the mess</span>
          </h1>

          <p
            className={cn(fadeUp, "mt-6 text-[15px] sm:text-lg text-slate-500 dark:text-[#888] max-w-lg mx-auto leading-relaxed")}
            style={{ animationDelay: "100ms" }}
          >
            You didn't start a travel business to juggle spreadsheets.
            {" "}{BRAND.name} brings itineraries, maps, and client sharing
            into one platform — so you can focus on the trips.
          </p>

          <div
            className={cn(fadeUp, "mt-8 flex flex-col sm:flex-row items-center justify-center gap-3")}
            style={{ animationDelay: "200ms" }}
          >
            <Button
              className="h-11 px-7 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-xs font-bold uppercase tracking-wider gap-2 transition-all"
              onClick={() => navigate("/login")}
            >
              Start Free <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Hero screenshot ─────────────────────────────────────────── */}
      <section className="px-5 pb-24 sm:pb-32">
        <div
          className={cn(fadeUp, "mx-auto max-w-5xl")}
          style={{ animationDelay: "350ms" }}
        >
          <img
            src="/hero-dashboard.png"
            alt="Dalefy dashboard"
            className="w-full h-auto block rounded-xl shadow-lg dark:shadow-none"
            loading="eager"
          />
        </div>
      </section>

      {/* ── Feature: Workspace ────────���─────────────────────────────── */}
      <section className="py-20 sm:py-28 px-5 border-t border-slate-200 dark:border-white/[0.04]">
        <div className="mx-auto max-w-5xl flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          <div className="lg:w-5/12 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand mb-3">
              Itinerary Builder
            </p>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight mb-4">
              Day-by-day planning with a live map
            </h2>
            <p className="text-sm text-slate-500 dark:text-[#888] leading-relaxed mb-6">
              Flights, hotels, activities — structured on a timeline with
              confirmation statuses, room types, and terminal info. The route
              map updates as you build.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="text-xs font-bold uppercase tracking-wider text-brand hover:underline underline-offset-4 cursor-pointer flex items-center gap-1.5"
            >
              Try the builder <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="lg:w-7/12">
            <img src="/hero-workspace.png" alt="Itinerary workspace" className="w-full h-auto block rounded-xl shadow-lg dark:shadow-none" loading="lazy" />
          </div>
        </div>
      </section>

      {/* ── Mobile App ───────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 px-5 border-t border-slate-200 dark:border-white/[0.04]">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand mb-3">
              Mobile App
            </p>
            <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight mb-4">
              Your trips, in your pocket
            </h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-[#888] max-w-md mx-auto leading-relaxed">
              Travelers access their itineraries on the go — no login needed. Just a PIN and they're in.
            </p>
          </div>
          <div className="relative flex items-end justify-center" style={{ perspective: "1200px" }}>
            {/* Ambient glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[280px] h-[280px] sm:w-[460px] sm:h-[460px] rounded-full bg-brand/[0.05] dark:bg-brand/[0.07] blur-3xl" />
            </div>

            <PhoneMockup
              src="/mobile-home.png"
              alt="Dalefy mobile — trips home"
              className={cn(fadeUp, "w-[180px] sm:w-[250px] relative z-10")}
              style={{ animationDelay: "100ms", transform: "rotateY(6deg) rotateX(2deg)" }}
            />
            <PhoneMockup
              src="/mobile-trip.png"
              alt="Dalefy mobile — trip detail"
              className={cn(fadeUp, "w-[180px] sm:w-[250px] relative z-20 -ml-6 sm:-ml-10 mb-8 sm:mb-12")}
              style={{ animationDelay: "250ms", transform: "rotateY(-6deg) rotateX(2deg)" }}
            />
          </div>
        </div>
      </section>

      {/* ── What you get ────────────────────────────────────────────── */}
      <section id="features" className="py-20 sm:py-28 px-5 border-t border-slate-200 dark:border-white/[0.04]">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight">
              What you get
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 dark:bg-white/[0.04] rounded-2xl overflow-hidden">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.title}
                  className="bg-white dark:bg-[#050505] p-6 sm:p-8 hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors"
                >
                  <Icon className="h-5 w-5 text-brand mb-4" strokeWidth={1.5} />
                  <p className="text-sm font-bold mb-1.5">{cap.title}</p>
                  <p className="text-[13px] text-slate-400 dark:text-[#555] leading-relaxed">{cap.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ���─ FAQ ─��───────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 sm:py-28 px-5 border-t border-slate-200 dark:border-white/[0.04]">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight mb-10 text-center">
            Questions
          </h2>
          <div>
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────��───────────────────────────────────────────────���─ */}
      <section className="py-24 sm:py-32 px-5 border-t border-slate-200 dark:border-white/[0.04]">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight mb-8">
            Ready when you are
          </h2>
          <Button
            className="h-12 px-8 rounded-xl bg-brand hover:brightness-110 active:scale-[0.98] text-black text-xs font-bold uppercase tracking-wider gap-2 transition-all"
            onClick={() => navigate("/login")}
          >
            Get Started <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ��─ Footer ──────��───────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-white/[0.04] pt-12 pb-6 px-5">
        <div className="mx-auto max-w-5xl">
          {/* Top: logo + columns */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {/* Brand column */}
            <div className="col-span-2 sm:col-span-2">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-7 w-7 bg-brand rounded-md flex items-center justify-center">
                  <Logo className="text-black h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-black uppercase tracking-tight">
                  {BRAND.nameUpper}
                </span>
              </div>
              <p className="text-[13px] text-slate-400 dark:text-[#555] leading-relaxed max-w-xs">
                {BRAND.tagline}
              </p>
            </div>

            {/* Link columns */}
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#555]">
                  {col.title}
                </p>
                {col.links.map((link) => (
                  <button
                    key={link.label}
                    onClick={() => link.href.startsWith("#") ? scrollTo(link.href) : undefined}
                    className="text-sm text-slate-500 hover:text-slate-900 dark:text-[#666] dark:hover:text-white transition-colors cursor-pointer text-left"
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-slate-200 dark:border-white/[0.04] mt-8 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-[10px] text-slate-300 dark:text-[#333]">
              &copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-[10px] text-slate-300 hover:text-slate-500 dark:text-[#333] dark:hover:text-[#666] transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-[10px] text-slate-300 hover:text-slate-500 dark:text-[#333] dark:hover:text-[#666] transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

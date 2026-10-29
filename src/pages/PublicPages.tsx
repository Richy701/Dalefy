import { useMemo, useState, type ReactNode } from "react";
import { Sun, Moon, MagnifyingGlass, EnvelopeSimple, CaretDown, Briefcase, Suitcase, Lifebuoy } from "@phosphor-icons/react";
import { useTheme } from "@/context/ThemeContext";
import { Logo } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import content from "@/data/public-pages.json";

const pages = [
  { id: "about", label: "About" },
  { id: "changelog", label: "What's new" },
  { id: "support", label: "Help" },
  { id: "privacy", label: "Privacy" },
  { id: "terms", label: "Terms" },
  { id: "delete-account", label: "Delete your account" },
] as const;
const NAV = ["changelog", "support", "privacy", "terms"] as const;

type PageId = (typeof pages)[number]["id"];
type Page = (typeof content)[PageId];
type Section = Page["sections"][number];
type Release = (typeof content)["changelog"]["releases"][number];

// Local, reviewed document content only; never populated from user input or an API.
// Reading text: dark enough to read for long, ~70 characters a line, normal line height.
const prose = "text-base sm:text-[17px] leading-7 sm:leading-8 text-foreground/80 [&_p+p]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:pl-1 [&_li+li]:mt-1.5 [&_ul+p]:mt-4 [&_ol+p]:mt-4 [&_p+ul]:mt-3 [&_p+ol]:mt-3 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-foreground/30 hover:[&_a]:decoration-foreground [&_a]:break-words [&_strong]:font-semibold [&_strong]:text-foreground [&_.path]:rounded [&_.path]:bg-secondary [&_.path]:px-1.5 [&_.path]:py-0.5 [&_.path]:text-[13px] [&_.path]:text-foreground";
// Where each portrait photo keeps its people when cut to a phone-width banner
const CROP: Partial<Record<PageId, string>> = { about: "object-[center_40%]", support: "object-[center_45%]", changelog: "object-[center_68%]", terms: "object-[center_65%]", "delete-account": "object-[center_45%]" };
const card = "rounded-xl border border-border bg-card shadow-sm";

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
const PLATFORM: Record<string, string> = { iOS: "iPhone", Android: "Android", Web: "Web", Workspace: "Workspace" };

function TopBar({ active }: { active: PageId }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
        <a href="/about.html" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          <Logo className="size-5 text-foreground" />
          <span className="hidden sm:inline text-sm font-semibold text-foreground">Dalefy</span>
        </a>
        <nav aria-label="Pages" className="ml-auto flex items-center gap-1 overflow-x-auto">
          {NAV.map(id => {
            const p = pages.find(x => x.id === id)!;
            return (
              <a key={id} href={`/${id}.html`} aria-current={id === active ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${id === active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                {p.label}
              </a>
            );
          })}
        </nav>
        <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="hidden sm:flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </header>
  );
}

/** Title beside the page's holiday photo on wide screens; the photo leads as a banner on phones */
function Hero({ id, page, children }: { id: PageId; page: Page; children?: ReactNode }) {
  return (
    <div className="relative mb-12 md:flex md:min-h-[22rem] md:items-center md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
      <img src={`/pages/${id}.jpg`} alt="" decoding="async"
        className={`h-48 w-full rounded-xl object-cover ${CROP[id] ?? "object-center"} shadow-sm md:absolute md:inset-y-0 md:right-0 md:h-full md:w-[42%] md:rounded-none md:shadow-none`} />
      <div aria-hidden className="absolute inset-0 hidden md:block bg-linear-to-r from-card from-58% to-transparent to-72%" />
      <div className="relative min-w-0 mt-6 md:mt-0 md:max-w-[58%] md:py-10 md:pl-10 md:pr-6 lg:py-12 lg:pl-12">
        {page.eyebrow && <p className="mb-2 text-sm font-medium text-link">{page.eyebrow}</p>}
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-foreground text-balance">{page.title}</h1>
        {page.description && <p className="mt-4 text-base sm:text-lg leading-7 sm:leading-8 text-muted-foreground text-pretty">{page.description}</p>}
        {page.updated && <p className="mt-3 text-sm text-muted-foreground">{page.updated}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

/** Help: search up top, topics as cards with every answer showing, and a person to email at the end */
function Support({ page, q }: { page: Page; q: string }) {
  const contact = page.sections.find(s => !s.faqs.length);
  const groups = page.sections.filter(s => s.faqs.length);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return groups.map(g => ({ ...g, faqs: term ? g.faqs.filter(f => f.question.toLowerCase().includes(term) || plain(f.answer).includes(term)) : g.faqs }));
  }, [groups, q]);
  const hits = filtered.reduce((n, g) => n + g.faqs.length, 0);

  const contactCard = contact?.html && (
    <section id={slug(contact.heading)} className="scroll-mt-20 flex gap-4 border-t border-border pt-8">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><Lifebuoy className="size-5 text-foreground" /></span>
      <div className="min-w-0 max-w-[68ch]">
        <h2 className="text-base font-semibold text-foreground">{contact.heading}</h2>
        <div className={`mt-1.5 ${prose}`} dangerouslySetInnerHTML={{ __html: contact.html }} />
      </div>
    </section>
  );

  return (
    <>
      <nav aria-label="Topics" className="mb-10 flex flex-wrap gap-x-6 gap-y-2">
        {groups.map(g => {
          const Icon = /organis/i.test(g.heading) ? Briefcase : Suitcase;
          return (
            <a key={g.heading} href={`#${slug(g.heading)}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Icon className="size-4 text-muted-foreground" /> {g.heading}
              <span className="text-muted-foreground tabular-nums">{g.faqs.length}</span>
            </a>
          );
        })}
      </nav>
      {hits === 0 ? (
        <p className={`${card} mb-10 px-5 py-8 text-center text-base text-muted-foreground`}>Nothing matches "{q}". Try another word, or email us and we'll help.</p>
      ) : filtered.map(g => g.faqs.length > 0 && (
        <section key={g.heading} id={slug(g.heading)} className="mb-12 scroll-mt-20">
          <h2 className="mb-4 text-xl font-semibold tracking-tight text-foreground">{g.heading}</h2>
          <div className="grid md:grid-cols-2 md:gap-x-12">
            {g.faqs.map(f => (
              <div key={f.question} id={slug(f.question)} className="scroll-mt-20 border-t border-border pt-5 pb-8">
                <h3 className="text-base font-semibold text-foreground">{f.question}</h3>
                <div className={`mt-1.5 ${prose}`} dangerouslySetInnerHTML={{ __html: f.answer }} />
              </div>
            ))}
          </div>
        </section>
      ))}
      {contactCard}
    </>
  );
}

/** What's new: one row per release, the date and platforms in their own column beside what changed */
function Changelog({ releases }: { releases: Release[] }) {
  return (
    <ol>
      {releases.map((r, i) => (
        <li key={r.date} id={r.date} className="scroll-mt-20 border-t border-border py-8 first:border-t-0 first:pt-0 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10 md:py-10">
          <div className="mb-3 md:mb-0">
            <div className="md:sticky md:top-20">
              <a href={`#${r.date}`} className="text-sm font-medium text-link tabular-nums hover:underline"><time dateTime={r.date}>{r.dateLabel}</time></a>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {i === 0 && <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Latest</span>}
                {r.platforms.map(p => <span key={p} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">{PLATFORM[p] ?? p}</span>)}
              </div>
            </div>
          </div>
          <div className="min-w-0 max-w-[68ch]">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">{r.heading}</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-base sm:text-[17px] leading-7 text-foreground/80 marker:text-muted-foreground">
              {r.items.map(item => <li key={item} className="pl-1">{item}</li>)}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** About: who it's for side by side as cards, then how to get in */
function About({ sections }: { sections: Section[] }) {
  const audiences = sections.filter(s => !s.signIn);
  const signIn = sections.find(s => s.signIn);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {audiences.map(s => {
          const Icon = /organis/i.test(s.heading) ? Briefcase : Suitcase;
          return (
            <section key={s.heading} id={slug(s.heading)} className={`${card} scroll-mt-20 p-5 sm:p-6`}>
              <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-secondary"><Icon className="size-5 text-foreground" /></span>
              <h2 className="mb-2 text-lg font-semibold tracking-tight text-foreground">{s.heading}</h2>
              <div className={prose} dangerouslySetInnerHTML={{ __html: s.html }} />
            </section>
          );
        })}
      </div>
      {signIn && (
        <section id={slug(signIn.heading)} className="mt-12 max-w-[68ch] scroll-mt-20">
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">{signIn.heading}</h2>
          <div className={prose} dangerouslySetInnerHTML={{ __html: signIn.html }} />
          <Button render={<a href="/#/login" />} className="mt-5">Sign in to Dalefy</Button>
        </section>
      )}
    </>
  );
}

/** Privacy, terms and the rest: the short version first, then numbered sections with contents beside them on wide screens */
function Document({ sections, numbered, summary }: { sections: Section[]; numbered: boolean; summary?: string[] }) {
  const toc = numbered && sections.length > 3;
  return (
    <>
      {summary && (
        <div className={`${card} mb-12 p-5 sm:p-6`}>
          <h2 className="text-base font-semibold text-foreground">The short version</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-7 text-foreground/80 marker:text-muted-foreground">
            {summary.map(line => <li key={line} className="pl-1">{line}</li>)}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">This summary helps you find your way. The full text below is what applies.</p>
        </div>
      )}
      <div className={toc ? "lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12" : ""}>
        {toc && (
          <nav aria-label="On this page" className="mb-10 lg:mb-0">
            {/* Folded away on phones so the text comes first; always open beside the text on wide screens */}
            <details className="group lg:sticky lg:top-24 rounded-xl border border-border bg-card px-4 py-3 lg:border-0 lg:bg-transparent lg:p-0 lg:[&>summary]:pointer-events-none" open={typeof window !== "undefined" && window.innerWidth >= 1024}>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground lg:mb-2 lg:text-xs lg:text-muted-foreground lg:font-medium [&::-webkit-details-marker]:hidden">
                On this page <CaretDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 lg:hidden" />
              </summary>
              <ol className="mt-3 lg:mt-0 space-y-2 lg:space-y-1.5 text-sm">
                {sections.map((s, i) => (
                  <li key={s.heading}>
                    <a href={`#${slug(s.heading)}`} className="flex gap-2 text-muted-foreground hover:text-foreground">
                      <span className="tabular-nums w-5 shrink-0">{i + 1}.</span><span>{s.heading}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          </nav>
        )}
        <div className="min-w-0 max-w-[68ch] space-y-10">
          {sections.map((s, i) => (
            <section key={s.heading} id={slug(s.heading)} className="scroll-mt-20">
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">{toc ? `${i + 1}. ` : ""}{s.heading}</h2>
              {s.html && <div className={prose} dangerouslySetInnerHTML={{ __html: s.html }} />}
              {s.faqs.length > 0 && (
                <div className="mt-6 space-y-6">
                  {s.faqs.map(f => (
                    <div key={f.question}>
                      <h3 className="text-base font-semibold text-foreground">{f.question}</h3>
                      <div className={`mt-1.5 ${prose}`} dangerouslySetInnerHTML={{ __html: f.answer }} />
                    </div>
                  ))}
                </div>
              )}
              {s.signIn && <Button render={<a href="/#/login" />} className="mt-4">Sign in to Dalefy</Button>}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

export function PublicPages() {
  const active = pages.find(page => window.location.pathname === `/${page.id}.html`) ?? pages[0];
  const page = content[active.id] as Page;
  const legal = active.id === "privacy" || active.id === "terms";
  const [q, setQ] = useState("");

  const heroActions = active.id === "support" ? (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the questions" aria-label="Search the questions" className="h-11 bg-card pl-9 text-base" />
      </div>
      <Button render={<a href="mailto:support@dalefy.app" />} className="h-11"><EnvelopeSimple /> Email us</Button>
    </div>
  ) : active.id === "about" ? (
    <div className="flex flex-wrap gap-3">
      <Button render={<a href="/#/login" />}>Sign in</Button>
      <Button variant="outline" render={<a href="/support.html" />}>Get help</Button>
    </div>
  ) : null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a href="#page-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:p-3">Skip to content</a>
      <TopBar active={active.id} />
      <main id="page-content" className={`mx-auto px-4 sm:px-6 pt-6 sm:pt-12 pb-20 max-w-5xl`}>
        <Hero id={active.id} page={page}>{heroActions}</Hero>
        {active.id === "support" ? <Support page={page} q={q} />
          : active.id === "changelog" ? <Changelog releases={page.releases as Release[]} />
          : active.id === "about" ? <About sections={page.sections} />
          : <Document sections={page.sections} numbered={legal} summary={(page as { summary?: string[] }).summary} />}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 sm:px-6 py-6 text-sm text-muted-foreground">
          <span className="mr-auto">© 2026 Dalefy</span>
          {pages.map(p => <a key={p.id} href={`/${p.id}.html`} className="hover:text-foreground">{p.label}</a>)}
        </div>
      </footer>
    </div>
  );
}

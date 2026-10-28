import { Info, MegaphoneSimple, ChatCircle, Shield, FileText, UserMinus, Sun, Moon, EnvelopeSimple, Suitcase, Briefcase } from "@phosphor-icons/react";
import { useTheme } from "@/context/ThemeContext";
import { Logo } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import content from "@/data/public-pages.json";

const pages = [
  { id: "about", label: "About", icon: Info },
  { id: "changelog", label: "What's new", icon: MegaphoneSimple },
  { id: "support", label: "Help & support", icon: ChatCircle },
  { id: "privacy", label: "Privacy policy", icon: Shield },
  { id: "terms", label: "Terms of service", icon: FileText },
  { id: "delete-account", label: "Delete your account", icon: UserMinus },
] as const;

// Support topics get the same kind of icon the app puts beside its rows
const sectionIcons: Record<string, typeof Info> = {
  "Contact us": EnvelopeSimple,
  "For travellers": Suitcase,
  "For organisers": Briefcase,
};

// Local, reviewed document content only; never populated from user input or an API.
const prose = "text-sm leading-7 text-muted-foreground [&_p+p]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li+li]:mt-2 [&_ul+p]:mt-4 [&_ol+p]:mt-4 [&_p+ul]:mt-4 [&_p+ol]:mt-4 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-border hover:[&_a]:decoration-brand [&_a]:break-words [&_strong]:font-medium [&_strong]:text-foreground [&_.path]:rounded-md [&_.path]:bg-secondary [&_.path]:px-1.5 [&_.path]:py-0.5 [&_.path]:text-xs [&_.path]:text-foreground";

type Release = (typeof content)["changelog"]["releases"][number];

function ReleaseBody({ release }: { release: Release }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">{release.platforms.map(platform => <Badge key={platform} variant="secondary">{platform}</Badge>)}</div>
      <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">{release.items.map(item => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

export function PublicPages() {
  const active = pages.find(page => window.location.pathname === `/${page.id}.html`) ?? pages[0];
  const page = content[active.id];
  const { theme, toggleTheme } = useTheme();
  const isAbout = active.id === "about";
  const [latest, ...earlier] = page.releases;
  return (
    <SidebarProvider>
      <a href="#page-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:p-3">Skip to content</a>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4">
          <a href="/about.html" className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-brand">
            <div className="flex size-8 items-center justify-center rounded-xl bg-brand"><Logo className="size-[18px] text-black" /></div>
            <span className="text-[13px] font-semibold">Dalefy</span>
          </a>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Dalefy</SidebarGroupLabel>
            <SidebarMenu>
              {pages.map(({ id, label, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton render={<a href={`/${id}.html`} />} isActive={id === active.id} aria-current={id === active.id ? "page" : undefined} className="h-10 gap-3 rounded-lg text-[13px] data-active:bg-brand/10 data-active:font-semibold">
                    <Icon weight={id === active.id ? "fill" : "regular"} />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-4">
          <Button render={<a href="/#/login" />} className="w-full">Open Dalefy</Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 hidden h-16 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md lg:flex lg:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4!" />
          <span className="flex-1 truncate text-sm font-medium">{active.label}</span>
          <Button variant="outline" size="icon" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
        </header>
        {/* On a phone the page opens inside the app, so it leads with a photo like the app's own pages */}
        <div className="relative h-64 overflow-hidden lg:hidden">
          <img src={`/pages/${active.id}.jpg`} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/35 to-black/10" />
          <div className="absolute inset-x-4 bottom-5">
            <p className="mb-1 text-xs font-medium text-white/80">{page.eyebrow}</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">{page.title}</h1>
          </div>
        </div>
        <div id="page-content" className="flex-1 scroll-mt-20 px-4 pt-5 pb-8 sm:px-6 lg:p-10">
          <div className="mb-6 max-w-3xl lg:mb-8">
            <p className="mb-3 hidden text-xs font-medium text-muted-foreground lg:block">{page.eyebrow}</p>
            <h1 className="hidden text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:block">{page.title}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base lg:mt-4 lg:leading-7">{page.description}</p>
            {page.updated && <p className="mt-3 text-xs text-muted-foreground lg:mt-4">{page.updated}</p>}
          </div>
          <div className={`grid items-start gap-6 ${isAbout ? "" : "xl:grid-cols-[minmax(0,1fr)_200px]"}`}>
            <div className={`grid min-w-0 gap-5 ${isAbout ? "lg:grid-cols-2" : ""}`}>
              {page.sections.map((section, i) => {
                const Icon = sectionIcons[section.heading];
                return (
                <section key={section.heading} id={`section-${i}`} className={`min-w-0 scroll-mt-24 ${isAbout && i === page.sections.length - 1 ? "lg:col-span-2" : ""}`}>
                  {/* The heading sits above its group, like a settings list, so the text gets the card's full width */}
                  <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold">
                    {Icon && <span className="flex size-6 items-center justify-center rounded-md bg-brand/15 text-link"><Icon weight="fill" className="size-3.5" /></span>}
                    {section.heading}
                  </h2>
                  <Card className={`[--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(6)] ${section.html ? "" : "py-0"}`}>
                    <CardContent>
                      {section.html && <div className={prose} dangerouslySetInnerHTML={{ __html: section.html }} />}
                      {section.faqs.length > 0 && <Accordion>{section.faqs.map(faq => (
                        <AccordionItem key={faq.question} value={faq.question}>
                          <AccordionTrigger>{faq.question}</AccordionTrigger>
                          <AccordionContent><div className={prose} dangerouslySetInnerHTML={{ __html: faq.answer }} /></AccordionContent>
                        </AccordionItem>
                      ))}</Accordion>}
                      {section.signIn && <div><Button render={<a href="/#/login" />}>Sign in to Dalefy</Button></div>}
                    </CardContent>
                  </Card>
                </section>
                );
              })}
              {/* The newest release in full, everything before it as rows that open */}
              {latest && (
                <section id="release-0" className="scroll-mt-24">
                  <Card className="[--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(6)]">
                    <CardHeader>
                      <div className="mb-2 flex items-center gap-2">
                        <Badge className="bg-brand/15 text-link">Latest</Badge>
                        <time dateTime={latest.date} className="text-xs text-muted-foreground">{latest.dateLabel}</time>
                      </div>
                      <CardTitle><h2 className="text-lg font-semibold leading-snug">{latest.heading}</h2></CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ReleaseBody release={latest} />
                    </CardContent>
                  </Card>
                </section>
              )}
              {earlier.length > 0 && (
                <section className="scroll-mt-24">
                  <h2 className="mb-2 px-1 text-sm font-semibold">Earlier</h2>
                  <Card className="py-0">
                    <Accordion>{earlier.map((release, i) => (
                      <AccordionItem key={release.date} value={release.date} id={`release-${i + 1}`} className="scroll-mt-24 px-4 sm:px-6">
                        <AccordionTrigger>
                          <span className="flex min-w-0 flex-col gap-0.5 text-left">
                            <time dateTime={release.date} className="text-xs font-normal text-muted-foreground">{release.dateLabel}</time>
                            <span>{release.heading}</span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent><ReleaseBody release={release} /></AccordionContent>
                      </AccordionItem>
                    ))}</Accordion>
                  </Card>
                </section>
              )}
            </div>
            {!isAbout && <nav aria-label="On this page" className="sticky top-24 hidden space-y-1 xl:block">
              <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">On this page</p>
              {page.sections.map((s,i) => <Button key={s.heading} variant="ghost" render={<a href={`#section-${i}`} />} className="h-auto min-h-9 w-full justify-start whitespace-normal text-left text-xs text-muted-foreground">{s.heading}</Button>)}
              {page.releases.map((r,i) => <Button key={r.date} variant="ghost" render={<a href={`#release-${i}`} />} className="w-full justify-start text-xs text-muted-foreground">{r.dateLabel}</Button>)}
            </nav>}
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border px-6 py-5 text-xs text-muted-foreground">
          <span className="mr-auto">© 2026 Dalefy</span>
          {pages.map(p => <a className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand" key={p.id} href={`/${p.id}.html`}>{p.label}</a>)}
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}


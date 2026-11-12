import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AirplaneLanding, AirplaneTakeoff, CaretDown, CaretLeft, CaretRight, Check, FileText, Moon, Printer, Sun, Users } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { CategoryDot } from "@/components/ui/category-dot";
import { AirlineMark } from "@/components/shared/AirlineMark";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { objectPosition } from "@/lib/imagePosition";
import { Linkify } from "@/lib/linkify";
import { parseTripDate } from "@/lib/dates";
import { stayCheckIn, stayDates } from "@/lib/stays";
import { clockTime, stayTime } from "@/lib/timeInput";
import { topicIcon, factRows } from "@/lib/infoTopics";
import { destinationFlag, shortDay, tripDatesLine, tripLengthDays, tripTimingLine, daysUntil } from "@/lib/tripSummary";
import { dayKey, flightNotice, fmtLong, fmtShort, fmtSize, isPlaceholderTime, mapsUrl, nextEvent, rowSub, rowTitle, tidyLocation, tidyTitle, tripDays } from "@/lib/itineraryFormat";
import type { ItineraryTheme } from "@/lib/itineraryTheme";
import type { Trip, TravelEvent } from "@/types";

type Screen = { kind: "list" } | { kind: "event"; id: string } | { kind: "info" };
export type ThemeControl = { theme: ItineraryTheme; toggle: () => void };
type Traveller = NonNullable<Trip["travelers"]>[number];

// On the photo wash dark mode uses the app's white-at-75%; this and the teal times hold 4.5:1 even over a white photo
const QUIET = "text-muted-foreground dark:text-white/75";
const LINE = "border-foreground/10";
const TILE = "bg-card/80 shadow-sm dark:bg-white/10 dark:shadow-none";
const RAIL_FROM: Record<TravelEvent["type"], string> = { flight: "from-cat-flight", hotel: "from-cat-stay", dining: "from-cat-meal", activity: "from-cat-activity", transfer: "from-cat-transfer" };
const RAIL_TO: Record<TravelEvent["type"], string> = { flight: "to-cat-flight", hotel: "to-cat-stay", dining: "to-cat-meal", activity: "to-cat-activity", transfer: "to-cat-transfer" };

const MARK_SIZE = { sm: "size-7", md: "size-9", lg: "size-11" } as const;

/** A flight shows its airline's logo, anything else its category; a flight we have no logo for keeps the plane */
function EventMark({ ev, size }: { ev: TravelEvent; size: keyof typeof MARK_SIZE }) {
  const dot = <CategoryDot type={ev.type} transferType={ev.transferType} size={size} />;
  return ev.type === "flight" ? <AirlineMark flightNum={ev.flightNum} className={MARK_SIZE[size]} fallback={dot} /> : dot;
}

/** The cover photo blurred behind the whole page, as in the app, with a shade for each theme */
function PhotoWash({ uri }: { uri: string }) {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-background print:hidden">
      <img src={uri} alt="" className="absolute inset-0 h-full w-full scale-[1.12] object-cover blur-[70px]" />
      <div className="absolute inset-0 bg-background/[0.94] dark:bg-[rgb(8_8_10/0.74)]" />
    </div>
  );
}

function FloatingButton({ label, onClick, onPhoto, children }: { label: string; onClick: () => void; onPhoto: boolean; children: ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className={`size-11 rounded-full ${onPhoto ? "bg-black/35 text-white backdrop-blur-md hover:bg-black/50 hover:text-white" : "bg-foreground/10 text-foreground"}`}>
      {children}
    </Button>
  );
}

/** Scrolled past this marker: the bar or strip above it turns solid, so text never runs through it */
function usePassed() {
  const marker = useRef<HTMLDivElement>(null);
  const [passed, setPassed] = useState(false);
  useEffect(() => {
    const check = () => setPassed((marker.current?.getBoundingClientRect().top ?? 0) < 0);
    check();
    // Capture too: inside the organiser's preview on a small window, the dialog scrolls rather than the page
    window.addEventListener("scroll", check, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", check, { capture: true });
  }, []);
  return { marker, passed };
}

function Hero({ trip, brandName, brandLogo, travelers, themeControl, onPrint }: { trip: Trip; brandName: string; brandLogo?: string | null; travelers: Traveller[]; themeControl?: ThemeControl; onPrint?: () => void }) {
  const onPhoto = !!trip.image;
  const flag = destinationFlag(trip.destination);
  const running = daysUntil(trip.start) <= 0 && daysUntil(trip.end) >= 0;
  const faces = [...travelers].sort((a, b) => Number(!!b.avatar) - Number(!!a.avatar)).slice(0, 5);
  return (
    <header className={`relative flex flex-col justify-end ${onPhoto ? "min-h-[min(520px,68dvh)]" : "pt-20"}`}>
      {onPhoto && (
        // The photo and its shade melt into the wash below the words, which stay on the photo in both themes
        <div className="absolute inset-0 [mask-image:linear-gradient(#000_84%,transparent)]">
          <img src={trip.image} alt="" style={{ objectPosition: objectPosition(trip.imagePosition) }} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-b from-black/35 from-0% via-transparent via-30% to-black/70 to-85%" />
        </div>
      )}
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        {themeControl && (
          <FloatingButton label={themeControl.theme === "light" ? "Switch to dark mode" : "Switch to light mode"} onClick={themeControl.toggle} onPhoto={onPhoto}>
            {themeControl.theme === "light" ? <Moon className="size-5" /> : <Sun className="size-5" />}
          </FloatingButton>
        )}
        {onPrint && <FloatingButton label="Print or save PDF" onClick={onPrint} onPhoto={onPhoto}><Printer className="size-5" /></FloatingButton>}
      </div>
      <div className={`relative flex flex-col items-center gap-[3px] px-6 text-center ${onPhoto ? "pb-16 text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]" : "pb-4 text-foreground"}`}>
        {flag && <span className={`mb-2 flex size-11 items-center justify-center rounded-full text-2xl ${onPhoto ? "bg-white/20" : "bg-foreground/10"}`}>{flag}</span>}
        {trip.destination && <p className={`text-[13px] font-bold uppercase tracking-[0.04em] ${onPhoto ? "text-white/90" : QUIET}`}>{trip.destination}</p>}
        <h1 id="phone-trip-title" className="break-words text-[30px] font-bold leading-[34px] tracking-[-0.013em]">{trip.name}</h1>
        <p className="mt-0.5 text-[15px] font-semibold">{tripTimingLine(trip)}{running ? "" : `, ${tripLengthDays(trip)}-day trip`}</p>
        <p className="text-[13px] font-medium opacity-90">{tripDatesLine(trip)}</p>
        <div className="mt-3 flex max-w-full items-center gap-2">
          {faces.length > 0 && (
            <div className="flex shrink-0 -space-x-1.5">
              {faces.map(t => <PersonAvatar key={t.id} avatar={t.avatar} initials={t.initials} name={t.name} className={`size-[26px] ring-2 ${onPhoto ? "ring-black/30" : "ring-background"}`} fallbackClassName="bg-white text-neutral-900 text-[9px] font-bold [text-shadow:none]" />)}
              {travelers.length > 5 && <span className={`flex size-[26px] items-center justify-center rounded-full bg-white text-[9px] font-bold text-neutral-900 ring-2 [text-shadow:none] ${onPhoto ? "ring-black/30" : "ring-background"}`}>+{travelers.length - 5}</span>}
            </div>
          )}
          <p className="line-clamp-2 min-w-0 text-left text-[13px] font-semibold">{travelers.length > 0 ? `${travelers.length} traveller${travelers.length === 1 ? "" : "s"}, ` : ""}Hosted by {brandName}</p>
          {brandLogo && <img src={brandLogo} alt="" className="size-4 shrink-0 rounded object-contain" />}
        </div>
      </div>
    </header>
  );
}

function ContactTile({ org, avatar }: { org: NonNullable<Trip["organizer"]>; avatar?: string }) {
  const initials = org.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  const face = <PersonAvatar avatar={avatar} initials={initials} name={org.name} className="size-9 shrink-0" fallbackClassName="bg-foreground/10 text-foreground text-xs font-semibold" />;
  const text = (
    <span className="min-w-0 text-left">
      <span className="block truncate text-[15px] font-semibold text-foreground">{org.name}</span>
      <span className={`block truncate text-[13px] ${QUIET}`}>Get in touch</span>
    </span>
  );
  const box = `flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-xl px-3 ${TILE}`;
  const ways = [
    org.phone && { label: "Call", url: `tel:${org.phone.replace(/[^\d+]/g, "")}` },
    org.phone && { label: "Message", url: `sms:${org.phone.replace(/[^\d+]/g, "")}` },
    org.email && { label: "Email", url: `mailto:${org.email}` },
  ].filter(Boolean) as { label: string; url: string }[];
  if (!ways.length) return <div className={box}>{face}{text}</div>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={box} aria-label={`Contact ${org.name}`}>{face}{text}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px] rounded-xl border border-border bg-card p-1 text-foreground shadow-xl">
        {ways.map(way => <DropdownMenuItem key={way.label} onClick={() => { window.location.href = way.url; }} className="min-h-11 rounded-lg p-2 text-[15px]">{way.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TravellerPicker({ travelers, viewAsId, setViewAsId }: { travelers: Traveller[]; viewAsId: string | null; setViewAsId: (id: string | null) => void }) {
  const current = travelers.find(t => t.id === viewAsId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-foreground ${TILE}`}>
        <Users aria-hidden="true" className="size-4" />
        {current ? `Showing ${current.name}` : "Showing everyone"}
        <CaretDown aria-hidden="true" className={`size-3.5 ${QUIET}`} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-[220px] overflow-y-auto rounded-xl border border-border bg-card p-1 text-foreground shadow-xl">
        {[{ id: null, name: "Everyone" }, ...travelers].map(t => (
          <DropdownMenuItem key={t.id ?? "all"} onClick={() => setViewAsId(t.id)} className="min-h-11 gap-2 rounded-lg p-2 text-[15px]">
            <span className="flex-1">{t.name}</span>
            {viewAsId === t.id && <Check className="size-4 text-link" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ListScreen({ trip, events, today, now, onOpen, picker, tiles }: { trip: Trip; events: TravelEvent[]; today: string; now: Date; onOpen: (s: Screen) => void; picker: ReactNode; tiles: ReactNode }) {
  const { marker, passed: pinned } = usePassed();
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const upNext = useMemo(() => nextEvent(events, now), [events, now]);
  const days = useMemo(() => {
    const grouped = new Map<string, TravelEvent[]>();
    for (const ev of events) grouped.set(ev.date, [...(grouped.get(ev.date) ?? []), ev]);
    const keys = [...new Set([...tripDays(trip), ...grouped.keys()])].sort();
    return keys.map(date => ({ date, events: grouped.get(date) ?? [] }));
  }, [trip, events]);
  const dimPast = today >= trip.start && today <= trip.end;

  // The day being read lights up in the pinned strip
  useEffect(() => {
    if (!pinned) return;
    const seen = new IntersectionObserver(entries => {
      const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActiveDay((top.target as HTMLElement).dataset.day ?? null);
    }, { rootMargin: "-100px 0px -65% 0px" });
    document.querySelectorAll("[data-day]").forEach(el => seen.observe(el));
    return () => seen.disconnect();
  }, [pinned, days]);
  useEffect(() => {
    const cell = strip.current?.querySelector<HTMLElement>(`[data-cell="${activeDay}"]`);
    if (cell && strip.current) strip.current.scrollTo({ left: cell.offsetLeft - strip.current.clientWidth / 2 + cell.offsetWidth / 2, behavior: "smooth" });
  }, [activeDay]);

  const jumpTo = (date: string) => {
    setActiveDay(date);
    document.getElementById(`phone-day-${date}`)?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  return (
    <>
      <div ref={marker} aria-hidden="true" />
      <nav aria-label="Trip days" className={`sticky top-0 z-20 transition-colors ${pinned ? "bg-background/85 backdrop-blur-xl" : ""}`}>
        <div ref={strip} className="relative flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          {days.map(({ date, events: dayEvents }) => {
            const d = parseTripDate(date);
            const active = activeDay === date && pinned;
            return (
              <button
                key={date}
                type="button"
                data-cell={date}
                onClick={() => jumpTo(date)}
                aria-current={date === today ? "date" : undefined}
                aria-label={`${fmtLong(date)}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                className={`flex w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-xl border-[1.5px] px-1 pb-1.5 pt-2 ${date === today ? "border-brand" : "border-transparent"} ${active ? "bg-foreground text-background" : `${TILE} text-foreground`} ${dimPast && date < today ? "opacity-55" : ""}`}
              >
                <span className={`text-[10px] font-semibold uppercase tracking-[0.04em] ${active ? "" : date === today ? "text-foreground" : QUIET}`}>{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                <span className="text-xl font-semibold tabular-nums tracking-tight">{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {upNext && (
        <section aria-label="Next up" className="mt-2">
          <div className="flex items-center justify-between px-4 pb-2 pt-3 text-[13px] font-semibold">
            <p className={QUIET}>{upNext.date === today ? "Today" : shortDayName(upNext.date)}</p>
            {!isPlaceholderTime(upNext.time) && <p className="tabular-nums text-foreground">{clockTime(upNext.time)}</p>}
          </div>
          <button type="button" onClick={() => onOpen({ kind: "event", id: upNext.id })} className="flex w-full items-center gap-3.5 px-4 pb-3.5 text-left active:opacity-70">
            <EventMark ev={upNext} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-semibold leading-tight tracking-tight text-foreground">{rowTitle(upNext)}</span>
              {upNext.location && <span className={`mt-0.5 block truncate text-[13px] ${QUIET}`}>{tidyLocation(upNext.location)}</span>}
            </span>
          </button>
          {upNext.type === "flight" ? (
            <button type="button" onClick={() => onOpen({ kind: "event", id: upNext.id })} className={`block min-h-11 w-full border-t px-4 py-3 text-left text-[13px] font-semibold text-link ${LINE}`}>View flight</button>
          ) : upNext.location ? (
            <a href={mapsUrl(upNext.location)} target="_blank" rel="noopener noreferrer" className={`block min-h-11 border-t px-4 py-3 text-[13px] font-semibold text-link ${LINE}`}>Directions</a>
          ) : null}
        </section>
      )}

      {tiles}
      {picker && <div className="mt-3 px-4">{picker}</div>}

      <main>
        {days.map(({ date, events: dayEvents }) => (
          <section key={date} id={`phone-day-${date}`} data-day={date} className="mt-6 scroll-mt-[92px]">
            <div className="flex items-center gap-2 px-4 pb-2">
              <h2 className={`text-[17px] font-semibold tracking-tight ${dimPast && date < today ? QUIET : "text-foreground"}`}>{shortDayLabel(date)}</h2>
              {date === today && <span className="rounded-lg bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-foreground">Today</span>}
              <p className={`ml-auto text-[13px] ${QUIET}`}>{dayEvents.length ? `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}${dayEvents.every(e => isPlaceholderTime(e.time)) ? ", times TBC" : ""}` : "Free day"}</p>
            </div>
            {dayEvents.map((ev, i) => {
              const next = dayEvents[i + 1];
              const hasLegs = ev.type === "flight" && (ev.depAirport || ev.arrAirport);
              const sub = ev.type === "flight" && (ev.airline || ev.flightNum) ? [ev.airline, ev.flightNum].filter(Boolean).join(" ") : rowSub(ev);
              return (
                <button key={ev.id} type="button" onClick={() => onOpen({ kind: "event", id: ev.id })} className="grid w-full grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 px-4 text-left active:bg-foreground/5">
                  <span className="flex flex-col items-center pt-3">
                    <EventMark ev={ev} size="md" />
                    {next && <span className={`-mb-1.5 mt-1.5 w-0.5 flex-1 rounded-full bg-linear-to-b opacity-50 ${RAIL_FROM[ev.type]} ${RAIL_TO[next.type]}`} />}
                  </span>
                  <span className={`block min-w-0 py-3 ${i > 0 ? `border-t ${LINE}` : ""}`}>
                    <span className="flex min-h-9 items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-base font-medium leading-snug text-foreground">{rowTitle(ev)}</span>
                        {sub && <span className={`block truncate text-[13px] ${QUIET}`}>{sub}</span>}
                      </span>
                      {!isPlaceholderTime(ev.time) && <span className="text-[13px] font-medium tabular-nums text-link">{clockTime(ev.time)}</span>}
                    </span>
                    {hasLegs && (
                      <span className="mt-2 flex flex-col gap-1">
                        <Leg icon={<AirplaneTakeoff aria-hidden="true" className={`size-[13px] ${QUIET}`} />} place={[ev.depAirport, ev.terminal && `Terminal ${ev.terminal.replace(/^T/i, "")}`]} time={ev.time} />
                        <Leg icon={<AirplaneLanding aria-hidden="true" className={`size-[13px] ${QUIET}`} />} place={[ev.arrAirport, ev.arrTerminal && `Terminal ${ev.arrTerminal.replace(/^T/i, "")}`]} time={ev.endTime} />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
        {events.length === 0 && <p className={`mt-8 px-4 text-center text-[15px] ${QUIET}`}>No itinerary items yet.</p>}
      </main>
    </>
  );
}

const shortDayName = (date: string) => parseTripDate(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
const shortDayLabel = shortDayName;

function Leg({ icon, place, time }: { icon: ReactNode; place: Array<string | undefined | false>; time?: string }) {
  return (
    <span className="flex items-center gap-2 text-[13px]">
      {icon}
      <span className={`min-w-0 flex-1 truncate ${QUIET}`}>{place.filter(Boolean).join(", ")}</span>
      {!isPlaceholderTime(time) && <span className={`tabular-nums ${QUIET}`}>{clockTime(time)}</span>}
    </span>
  );
}

/** Back button and page label, clear over a photo at the top and solid once content scrolls under them */
function ScreenBar({ label, onBack, onPhoto, solid }: { label: string; onBack: () => void; onPhoto: boolean; solid: boolean }) {
  return (
    <div className={`sticky top-0 z-20 -mb-14 flex h-14 items-center gap-2 px-2 transition-colors ${solid ? `border-b bg-background/90 backdrop-blur-xl ${LINE}` : ""}`}>
      <Button type="button" variant="ghost" size="icon" aria-label="Go back" onClick={onBack} className={`size-11 rounded-full ${onPhoto && !solid ? "bg-black/35 text-white backdrop-blur-md hover:bg-black/50 hover:text-white" : "text-foreground"}`}>
        <CaretLeft className="size-5" weight="bold" />
      </Button>
      <p className={`min-w-0 truncate text-[17px] font-semibold ${onPhoto && !solid ? "text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]" : "text-foreground"}`}>{label}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-[17px] font-semibold tracking-tight text-foreground">{children}</h2>;
}

function DocRow({ doc, first }: { doc: { id: string; name: string; url: string; size?: number }; first: boolean }) {
  const tag = (doc.name.split(".").pop() ?? "").slice(0, 4).toUpperCase();
  return (
    <a href={doc.url} target="_blank" rel="noopener noreferrer" className={`flex min-h-14 items-center gap-3 py-2.5 active:opacity-70 ${first ? "" : `border-t ${LINE}`}`}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${TILE} ${QUIET}`}>{tag || "FILE"}</span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-medium text-foreground">{doc.name.replace(/\.[a-z0-9]+$/i, "")}</span>
        {!!doc.size && <span className={`block text-[13px] ${QUIET}`}>{fmtSize(doc.size)}</span>}
      </span>
      <CaretRight aria-hidden="true" className={`size-3.5 shrink-0 ${QUIET}`} />
    </a>
  );
}

function OrganiserRow({ org, avatar }: { org: NonNullable<Trip["organizer"]>; avatar?: string }) {
  const initials = org.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  return (
    <div className="flex items-center gap-3">
      <PersonAvatar avatar={avatar} initials={initials} name={org.name} className="size-11 shrink-0" fallbackClassName="bg-foreground/10 text-foreground text-sm font-semibold" />
      <div className="min-w-0">
        <p className="text-base font-semibold text-foreground">{org.name}</p>
        <p className={`text-[13px] ${QUIET}`}>{["Your organiser", org.role, org.company].filter(Boolean).join(", ")}</p>
      </div>
    </div>
  );
}

function EventScreen({ ev, trip, events, avatar, onOpen, onBack }: { ev: TravelEvent; trip: Trip; events: TravelEvent[]; avatar?: string; onOpen: (s: Screen) => void; onBack: () => void }) {
  const { marker, passed } = usePassed();
  const photo = ev.image && ev.type !== "transfer" ? ev.image : "";
  const notice = ev.type === "flight" ? flightNotice(ev.status) : null;
  const route = ev.type === "transfer" && ev.location ? tidyLocation(ev.location).split(/\s+to\s+/i) : [];
  const isTwoStop = route.length === 2;
  const sameDay = events.filter(e => e.date === ev.date);
  const at = sameDay.findIndex(e => e.id === ev.id);
  const neighbours = [at > 0 && { label: "Before", e: sameDay[at - 1] }, at >= 0 && at < sameDay.length - 1 && { label: "Up next", e: sameDay[at + 1] }].filter(Boolean) as { label: string; e: TravelEvent }[];
  const checkin = stayTime(ev.checkin) || (isPlaceholderTime(ev.time) ? "" : clockTime(ev.time));
  const checkout = stayTime(ev.checkout);
  // A hotel row shows its stay's dates; an overnight borrows them, and its stay's confirmations, from the check-in
  const overnight = ev.type === "hotel" && !!ev.isOvernight;
  const stay = ev.type === "hotel" ? stayDates(ev, trip.events) : null;
  const checkInDate = overnight ? stay?.from || ev.date : ev.date;
  const checkOutDate = ev.endDate || stay?.to || "";
  const dayGap = (a: string, b: string) => Math.round((parseTripDate(b).getTime() - parseTripDate(a).getTime()) / 86400000);
  const nights = ev.type === "hotel" && checkInDate && checkOutDate ? dayGap(checkInDate, checkOutDate) : 0;
  const nightNo = nights > 1 && checkInDate ? dayGap(checkInDate, ev.date) + 1 : 0;
  const nightLine = nightNo >= 1 && nightNo <= nights ? `Night ${nightNo} of ${nights}` : "";
  const stayDocs = overnight ? stayCheckIn(ev, trip.events)?.documents ?? [] : [];
  const docs = [...(ev.documents ?? []), ...stayDocs.filter(d => !(ev.documents ?? []).some(o => o.id === d.id || o.url === d.url))];
  const rows = ([
    ev.type === "flight" && ["Airline", [ev.airline, ev.flightNum].filter(Boolean).join(" ")],
    ev.type === "flight" && ["Aircraft", ev.aircraft],
    ev.type === "flight" && ["Duration", ev.duration],
    ev.type === "hotel" && ["Room", ev.roomType],
    ev.type === "hotel" && ["Check in", `${fmtShort(checkInDate)}${checkin && !overnight ? `, ${checkin}` : ""}`],
    ev.type === "hotel" && checkOutDate && ["Check out", `${fmtShort(checkOutDate)}${checkout && !overnight ? `, ${checkout}` : ""}`],
    ev.type === "hotel" && nights > 0 && ["Nights", String(nights)],
    ev.type !== "flight" && ev.type !== "hotel" && !isPlaceholderTime(ev.endTime) && ["Until", clockTime(ev.endTime)],
    ev.type !== "flight" && ev.type !== "hotel" && ["Duration", ev.duration],
    ev.meetingPoint && ["Meet at", ev.meetingPoint],
    ev.contactName && ["Contact", ev.contactName],
  ].filter(row => row && row[1]) as [string, string][]);
  const title = ev.type === "hotel" ? tidyTitle(ev.title).split(" – ")[0] : tidyTitle(ev.title);
  // An event with only a title and a time: a shorter photo and the time as a line, so the page reads as a summary
  const thin = ev.type !== "hotel" && ev.type !== "flight" && !ev.location && !ev.description && !ev.notes && !docs.length && !rows.length;
  const hasTime = !isPlaceholderTime(ev.time);
  return (
    <>
      {!photo && <div ref={marker} aria-hidden="true" />}
      {/* The event's own title sits right under the photo, so the bar doesn't repeat a generic "Stay" or "Activity" */}
      <ScreenBar label="" onBack={onBack} onPhoto={!!photo} solid={passed} />
      {photo ? (
        <div className={`relative ${thin ? "h-[min(240px,33dvh)]" : "h-[min(400px,55dvh)]"} [mask-image:linear-gradient(#000_70%,transparent)]`}>
          <img src={photo} alt="" style={{ objectPosition: objectPosition(ev.imagePosition) }} className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/35 to-transparent" />
        </div>
      ) : <div className="h-[52px]" />}
      {photo && <div ref={marker} aria-hidden="true" className="-mt-14" />}
      <main className={`flex flex-col gap-6 px-4 pb-10 ${photo ? "mt-14" : "pt-3"}`}>
        <div>
          {ev.type === "flight" && <div className="mb-3"><EventMark ev={ev} size="lg" /></div>}
          <h1 className="text-[28px] font-bold leading-[33px] tracking-[-0.014em] text-foreground">{title}</h1>
          <p className={`mt-1 text-[15px] ${QUIET}`}>{thin && hasTime ? `${clockTime(ev.time)}, ${fmtLong(ev.date)}` : fmtLong(ev.date)}</p>
          {nightLine && <p className={`text-[15px] ${QUIET}`}>{nightLine}</p>}
          {ev.type !== "hotel" && !thin && hasTime && <p className="mt-1 text-[32px] font-bold tabular-nums leading-tight tracking-tight text-foreground">{clockTime(ev.time)}</p>}
          {notice && <p className={`mt-1 text-[15px] ${notice.className}`}>{notice.text}</p>}
        </div>

        {ev.type === "flight" && (ev.depAirport || ev.arrAirport) && (
          <section className={`rounded-xl p-4 ${TILE}`}>
            <div className="flex flex-col gap-3">
              <FlightStop icon={<AirplaneTakeoff aria-hidden="true" className={`size-5 ${QUIET}`} />} code={ev.depAirport} extra={[ev.terminal && `Terminal ${ev.terminal.replace(/^T/i, "")}`, ev.gate && `Gate ${ev.gate}`]} date={ev.date} time={ev.time} />
              <div className={`border-t ${LINE}`} />
              <FlightStop icon={<AirplaneLanding aria-hidden="true" className={`size-5 ${QUIET}`} />} code={ev.arrAirport} extra={[ev.arrTerminal && `Terminal ${ev.arrTerminal.replace(/^T/i, "")}`, ev.arrGate && `Gate ${ev.arrGate}`, ev.baggageBelt && `Belt ${ev.baggageBelt}`]} date={ev.endDate || ev.date} time={ev.endTime} />
            </div>
          </section>
        )}

        {ev.location && ev.type !== "flight" && (
          <section>
            <SectionLabel>{isTwoStop ? "Route" : ev.type === "hotel" ? "Address" : "Where"}</SectionLabel>
            <div className="flex items-start justify-between gap-4">
              {isTwoStop ? (
                <div className="min-w-0 flex-1 text-base text-foreground">
                  <p className={`text-[13px] ${QUIET}`}>Pickup</p><p>{route[0]}</p>
                  <p className={`mt-2 text-[13px] ${QUIET}`}>Drop-off</p><p>{route[1]}</p>
                </div>
              ) : <p className="min-w-0 flex-1 text-base text-foreground">{tidyLocation(ev.location)}</p>}
              <a href={mapsUrl(isTwoStop ? route[1] : ev.location)} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[13px] font-semibold leading-6 text-link">Directions</a>
            </div>
          </section>
        )}

        {rows.length > 0 && (
          <section>
            {rows.map(([name, value], i) => (
              <div key={name} className={`flex gap-3 py-3 text-[15px] ${i ? `border-t ${LINE}` : ""}`}>
                <p className={`w-24 shrink-0 ${QUIET}`}>{name}</p>
                <p className="min-w-0 flex-1 text-foreground">{value}</p>
              </div>
            ))}
            {ev.contactPhone && (
              <a href={`tel:${ev.contactPhone.replace(/[^\d+]/g, "")}`} className={`flex min-h-11 gap-3 border-t py-3 text-[15px] ${LINE}`}>
                <span className={`w-24 shrink-0 ${QUIET}`}>Phone</span><span className="min-w-0 flex-1 text-link">{ev.contactPhone}</span>
              </a>
            )}
          </section>
        )}

        {ev.description && (
          <section>
            <SectionLabel>Good to know</SectionLabel>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground"><Linkify text={ev.description} /></p>
          </section>
        )}

        {docs.length > 0 && (
          <section>
            <SectionLabel>Documents</SectionLabel>
            {docs.map((doc, i) => <DocRow key={doc.id} doc={doc} first={i === 0} />)}
          </section>
        )}

        {neighbours.length > 0 && (
          <section>
            <SectionLabel>On this day</SectionLabel>
            {neighbours.map(({ label: when, e }, i) => (
              <button key={e.id} type="button" onClick={() => onOpen({ kind: "event", id: e.id })} className={`flex min-h-14 w-full items-center gap-3 py-2.5 text-left active:opacity-70 ${i ? `border-t ${LINE}` : ""}`}>
                <EventMark ev={e} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] ${QUIET}`}>{when}</span>
                  <span className="block truncate text-[15px] font-medium text-foreground">{rowTitle(e)}</span>
                </span>
                {!isPlaceholderTime(e.time) && <span className="text-[13px] font-medium tabular-nums text-link">{clockTime(e.time)}</span>}
                <CaretRight aria-hidden="true" className={`size-3.5 shrink-0 ${QUIET}`} />
              </button>
            ))}
          </section>
        )}

        {trip.organizer?.name && <OrganiserRow org={trip.organizer} avatar={avatar} />}
      </main>
    </>
  );
}

function FlightStop({ icon, code, extra, date, time }: { icon: ReactNode; code?: string; extra: Array<string | undefined | false>; date: string; time?: string }) {
  const line = extra.filter(Boolean).join(", ");
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-xl font-semibold tracking-tight text-foreground">{code || "TBC"}</p>
        <p className={`text-[13px] ${QUIET}`}>{[shortDay(date), line].filter(Boolean).join(", ")}</p>
      </div>
      <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground">{isPlaceholderTime(time) ? "TBC" : clockTime(time)}</p>
    </div>
  );
}

function InfoScreen({ trip, events, avatar, onOpen, onBack }: { trip: Trip; events: TravelEvent[]; avatar?: string; onOpen: (s: Screen) => void; onBack: () => void }) {
  const { marker, passed } = usePassed();
  const stays = events.filter(e => e.type === "hotel");
  return (
    <>
      <div ref={marker} aria-hidden="true" />
      <ScreenBar label="Trip info" onBack={onBack} onPhoto={false} solid={passed} />
      <div className="h-14" />
      <main className="flex flex-col gap-7 px-4 pb-10 pt-1">
        {/* The organiser's order, as written */}
        {trip.info?.map(item => {
          const { Icon, warn } = topicIcon(item.title || "");
          const rows = item.body ? factRows(item.body) : [];
          return (
            <section key={item.id}>
              <div className="mb-1.5 flex items-center gap-2.5">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${warn ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-foreground/10 text-foreground"}`}>
                  <Icon aria-hidden="true" weight="fill" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold tracking-tight text-foreground">{item.title}</h2>
                  {item.deadline && <p className={`text-[13px] ${QUIET}`}>Due {fmtShort(item.deadline)}</p>}
                </div>
              </div>
              {rows.map((row, i) => (
                <div key={i} className={`py-2.5 text-[15px] leading-relaxed ${i ? `border-t ${LINE}` : ""}`}>
                  {row.label && <p className={`text-[13px] ${QUIET}`}>{row.label}</p>}
                  <p className="text-foreground"><Linkify text={row.text} /></p>
                </div>
              ))}
              {item.actionUrl && <a href={item.actionUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-[15px] font-semibold text-link">{item.actionLabel || "Open link"}</a>}
              {item.documents?.map((doc, i) => <DocRow key={doc.id} doc={doc} first={i === 0} />)}
            </section>
          );
        })}

        {stays.length > 0 && (
          <section>
            <SectionLabel>Where you're staying</SectionLabel>
            {stays.map((ev, i) => (
              <button key={ev.id} type="button" onClick={() => onOpen({ kind: "event", id: ev.id })} className={`flex min-h-14 w-full items-center gap-3 py-2.5 text-left active:opacity-70 ${i ? `border-t ${LINE}` : ""}`}>
                <CategoryDot type="hotel" size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-foreground">{rowTitle(ev)}</span>
                  <span className={`block truncate text-[13px] ${QUIET}`}>{shortDay(ev.date)}{ev.endDate ? ` to ${shortDay(ev.endDate)}` : ""}</span>
                </span>
                <CaretRight aria-hidden="true" className={`size-3.5 shrink-0 ${QUIET}`} />
              </button>
            ))}
          </section>
        )}

        {!!trip.documents?.length && (
          <section>
            <SectionLabel>Documents</SectionLabel>
            {trip.documents.map((doc, i) => <DocRow key={doc.id} doc={doc} first={i === 0} />)}
          </section>
        )}

        {trip.organizer?.name && <OrganiserRow org={trip.organizer} avatar={avatar} />}
      </main>
    </>
  );
}

/**
 * The traveller's page on a phone, laid out like the app's trip screen: a photo edge to edge melting into a wash of
 * itself, a week strip, what's next, then tight rows that open their own page. Print always uses the document layout.
 * `preview` runs inside the organiser's preview, where browser history belongs to the Workspace.
 */
export function PhoneTripView({ trip, brandName, brandLogo, platformName, events, viewAsId, setViewAsId, preview, themeControl, onPrint }: {
  trip: Trip; brandName: string; brandLogo?: string | null; platformName: string; events: TravelEvent[];
  viewAsId: string | null; setViewAsId: (id: string | null) => void; preview: boolean; themeControl?: ThemeControl; onPrint?: () => void;
}) {
  const [stack, setStack] = useState<Screen[]>([{ kind: "list" }]);
  const [now] = useState(() => new Date());
  const root = useRef<HTMLDivElement>(null);
  const savedY = useRef<number[]>([]);
  const depth = useRef(1);
  const screen = stack[stack.length - 1];
  const travelers = trip.travelers ?? [];
  const org = trip.organizer?.name?.trim() ? trip.organizer : null;
  // The organiser is usually on the trip too, so their traveller photo stands in when they have none
  const orgAvatar = org ? org.avatar || travelers.find(t => t.name.trim().toLowerCase() === org.name.trim().toLowerCase())?.avatar : undefined;

  const open = (next: Screen) => {
    savedY.current.push(window.scrollY);
    setStack(s => [...s, next]);
    if (!preview) window.history.pushState({ itineraryScreen: true }, "");
  };
  const pop = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
  const back = () => (preview ? pop() : window.history.back());

  useEffect(() => {
    if (preview) return;
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [preview]);

  // A new page starts at its top; going back lands where the reader was
  useLayoutEffect(() => {
    if (stack.length > depth.current) root.current?.scrollIntoView({ block: "start", behavior: "instant" });
    else if (stack.length < depth.current) window.scrollTo({ top: savedY.current.pop() ?? 0, behavior: "instant" });
    depth.current = stack.length;
  }, [stack.length]);

  const hasInfo = !!trip.info?.length || !!trip.documents?.length || events.some(e => e.type === "hotel");
  const tiles = (hasInfo || org) && (
    <div className="mt-3 flex gap-3 px-4">
      {hasInfo && (
        <button type="button" onClick={() => open({ kind: "info" })} className={`flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-left active:opacity-70 ${TILE}`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/10"><FileText aria-hidden="true" weight="fill" className="size-[18px] text-foreground" /></span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-foreground">Trip info</span>
            <span className={`block truncate text-[13px] ${QUIET}`}>All the details</span>
          </span>
        </button>
      )}
      {org && <ContactTile org={org} avatar={orgAvatar} />}
    </div>
  );
  const picker = travelers.length > 0 ? <TravellerPicker travelers={travelers} viewAsId={viewAsId} setViewAsId={setViewAsId} /> : null;
  const event = screen.kind === "event" ? trip.events.find(e => e.id === screen.id) : null;

  return (
    <div ref={root} data-phone-itinerary className="relative isolate min-h-dvh w-full overflow-x-clip bg-transparent text-foreground">
      {trip.image ? <PhotoWash uri={trip.image} /> : <div aria-hidden="true" className="fixed inset-0 -z-10 bg-background" />}
      {event ? (
        <EventScreen ev={event} trip={trip} events={events} avatar={orgAvatar} onOpen={open} onBack={back} />
      ) : screen.kind === "info" ? (
        <InfoScreen trip={trip} events={events} avatar={orgAvatar} onOpen={open} onBack={back} />
      ) : (
        <>
          <Hero trip={trip} brandName={brandName} brandLogo={brandLogo} travelers={travelers} themeControl={themeControl} onPrint={onPrint} />
          <ListScreen trip={trip} events={events} today={dayKey(now)} now={now} onOpen={open} picker={picker} tiles={tiles} />
          <footer className={`mt-10 flex flex-col items-center gap-1 px-4 pb-8 text-center text-xs ${QUIET}`}>
            <p>Prepared by {brandName}, powered by {platformName}</p>
            <p className="flex gap-4"><a href="/privacy.html" className="inline-flex min-h-11 items-center">Privacy</a><a href="/terms.html" className="inline-flex min-h-11 items-center">Terms</a></p>
          </footer>
        </>
      )}
    </div>
  );
}

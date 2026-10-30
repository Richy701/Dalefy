import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PencilSimple, UsersThree, EnvelopeSimple, UserSwitch, Suitcase, SpinnerGap } from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTrips } from "@/context/TripsContext";
import { initialsFrom } from "@/lib/names";
import { useTeamPhoto } from "@/hooks/useStaffPhoto";
import { fetchTeamActivity, type TeamActivityEntry } from "@/services/teamAdmin";

type Kind = TeamActivityEntry["kind"] | "edit";

interface Item {
  id: string;
  at: number;
  by: string;
  byUid?: string;
  kind: Kind;
  summary: string;
  tripId?: string;
  tripName?: string;
}

const KINDS: Record<Kind, { label: string; icon: typeof PencilSimple }> = {
  edit: { label: "Trip edits", icon: PencilSimple },
  trips: { label: "Handovers", icon: Suitcase },
  team: { label: "Team changes", icon: UsersThree },
  email: { label: "Emails sent", icon: EnvelopeSimple },
  "sign-in-as": { label: "Signed in as", icon: UserSwitch },
};
const ALL = "all";
const PAGE = 30;

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

/** Everything the team did, for owners and admins: trip edits from each trip's history, team changes and "Sign in as" sessions */
export function TeamActivity({ orgId }: { orgId: string }) {
  const { trips } = useTrips();
  const navigate = useNavigate();
  const [logged, setLogged] = useState<TeamActivityEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [person, setPerson] = useState(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    fetchTeamActivity(orgId)
      .then(list => { if (!cancelled) setLogged(list); })
      .catch(() => { if (!cancelled) { setLogged([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [orgId]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const t of trips) for (const h of t.history ?? []) {
      const at = Date.parse(h.at);
      if (Number.isFinite(at)) out.push({ id: `${t.id}-${h.id}`, at, by: h.by, kind: "edit", summary: h.summary, tripId: t.id, tripName: t.name });
    }
    for (const e of logged ?? []) out.push({ id: e.id, at: e.at, by: e.byName, byUid: e.byUid, kind: e.kind, summary: e.summary });
    return out.sort((a, b) => b.at - a.at);
  }, [trips, logged]);

  const teamPhoto = useTeamPhoto();
  const photoFor = (item: Item) => teamPhoto(item.by, item.byUid);

  const people = useMemo(() => [...new Set(items.map(i => i.by).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  const filtered = items.filter(i => (person === ALL || i.by === person) && (kind === ALL || i.kind === kind));
  const visible = filtered.slice(0, shown);

  if (!logged) {
    return (
      <div className="flex items-center justify-center py-8">
        <SpinnerGap className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={person} onValueChange={v => { setPerson(typeof v === "string" ? v : ALL); setShown(PAGE); }}>
          <SelectTrigger className="h-9 w-full sm:w-52 text-[13px]" aria-label="Filter by person">
            <SelectValue>{(v: string) => (v === ALL ? "Everyone" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-[13px]">Everyone</SelectItem>
            {people.map(p => <SelectItem key={p} value={p} className="text-[13px]">{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={v => { setKind(typeof v === "string" ? v : ALL); setShown(PAGE); }}>
          <SelectTrigger className="h-9 w-full sm:w-44 text-[13px]" aria-label="Filter by kind">
            <SelectValue>{(v: string) => (v === ALL ? "Everything" : KINDS[v as Kind]?.label ?? v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-[13px]">Everything</SelectItem>
            {(Object.keys(KINDS) as Kind[]).map(k => <SelectItem key={k} value={k} className="text-[13px]">{KINDS[k].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {failed && <p className="text-[12px] text-muted-foreground">Team changes couldn't load. Trip edits below are complete.</p>}

      {visible.length === 0 ? (
        <p className="text-[13px] text-muted-foreground py-4">Nothing here yet. Edits to trips and changes to the team show up as they happen.</p>
      ) : (
        <ol className="space-y-1">
          {visible.map((item, i) => {
            const day = dayLabel(item.at);
            const header = i === 0 || dayLabel(visible[i - 1].at) !== day;
            const Icon = KINDS[item.kind]?.icon ?? PencilSimple;
            return (
              <li key={item.id}>
                {header && <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground pt-3 pb-1.5 first:pt-0">{day}</p>}
                <div className="flex items-start gap-3 py-1.5">
                  <div className="relative shrink-0 mt-0.5">
                    <Avatar className="h-8 w-8">
                      {photoFor(item) && <AvatarImage src={photoFor(item)} alt="" />}
                      <AvatarFallback className="text-[10px] font-semibold">{initialsFrom(item.by.split(" as ")[0] || "?")}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-card ring-2 ring-card flex items-center justify-center" title={KINDS[item.kind]?.label}>
                      <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-foreground leading-snug">
                      <span className="font-semibold">{item.by || "Someone"}</span>{" "}
                      {item.summary.charAt(0).toLowerCase() + item.summary.slice(1)}
                    </p>
                    {item.tripId && (
                      <button type="button" onClick={() => navigate(`/trip/${item.tripId}`)} className="text-[12px] text-link hover:underline truncate max-w-full text-left">
                        {item.tripName || "Untitled trip"}
                      </button>
                    )}
                  </div>
                  <span className="text-[12px] text-muted-foreground tabular-nums shrink-0 mt-0.5">
                    {new Date(item.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {(filtered.length > shown || shown > PAGE) && (
        <div className="flex gap-2">
          {filtered.length > shown && (
            <Button variant="outline" onClick={() => setShown(n => n + PAGE)} className="h-9 rounded-xl text-[13px] flex-1">
              Show {Math.min(PAGE, filtered.length - shown)} more
            </Button>
          )}
          {shown > PAGE && (
            <Button
              variant="ghost"
              onClick={() => {
                setShown(PAGE);
                // Back to the top of the list, not stranded far below it
                document.getElementById("activity")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="h-9 rounded-xl text-[13px] flex-1"
            >
              Show less
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

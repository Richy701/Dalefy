import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { peopleOnEvent } from "@/lib/bookingRefs";
import type { TravelEvent } from "@/types";

interface Person { id: string; name: string; initials: string; avatar?: string }

/** Individual booking references, for events where travellers aren't all on one booking */
export function TravelerRefsFields({ event, travellers, onChange, onOpenAll }: {
  event: Pick<TravelEvent, "assignedTo" | "confNumber" | "travelerRefs">;
  travellers: Person[];
  onChange: (refs: Record<string, string> | undefined) => void;
  /** Opens every traveller's references across the trip */
  onOpenAll?: () => void;
}) {
  const open = event.travelerRefs !== undefined;
  const people = peopleOnEvent(event, travellers);
  const fallback = event.confNumber?.trim() ? `Uses ${event.confNumber.trim()}` : "No reference";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox checked={open} onCheckedChange={checked => onChange(checked ? event.travelerRefs ?? {} : undefined)} />
          <span className="text-xs text-foreground">Some travellers have their own reference</span>
        </label>
        {onOpenAll && (
          <Button type="button" variant="link" size="xs" className="h-auto px-0 text-xs font-medium text-foreground underline" onClick={onOpenAll}>
            All references by person
          </Button>
        )}
      </div>
      {open && (people.length > 0 ? (
        <div className="space-y-2">
          {people.map(person => (
            <div key={person.id} className="flex items-center gap-2.5">
              <PersonAvatar avatar={person.avatar} initials={person.initials} name={person.name} className="h-7 w-7 shrink-0" fallbackClassName="text-[9px] font-black" />
              <Label htmlFor={`ref-${person.id}`} className="flex-1 min-w-0 truncate text-xs font-medium text-foreground">{person.name}</Label>
              <Input
                id={`ref-${person.id}`}
                value={event.travelerRefs?.[person.id] ?? ""}
                onChange={e => onChange({ ...event.travelerRefs, [person.id]: e.target.value })}
                placeholder={fallback}
                autoComplete="off"
                className="h-9 w-40 shrink-0 text-sm font-semibold bg-background border-border text-foreground"
              />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Each traveller sees only their own on their phone.</p>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Add travellers in the People tab first to give them their own reference.</p>
      ))}
    </div>
  );
}

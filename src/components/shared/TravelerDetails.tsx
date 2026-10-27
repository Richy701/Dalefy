import { useState } from "react";
import { PencilSimple, Phone, ForkKnife, FirstAid, Cake, GlobeHemisphereWest, Note } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ageOn, cleanProfile } from "@/lib/travelerProfile";
import { cn } from "@/lib/utils";
import type { TravelerProfile } from "@/types";

const longDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

type Field = { key: keyof TravelerProfile; label: string; type?: "date" | "tel"; placeholder?: string; wide?: boolean };
const FIELDS: Field[] = [
  { key: "phone", label: "Phone", type: "tel", placeholder: "+44 7700 900123" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "nationality", label: "Nationality", placeholder: "British" },
  { key: "dietary", label: "Dietary needs", placeholder: "Vegetarian, nut allergy" },
  { key: "emergencyName", label: "Emergency contact", placeholder: "Name" },
  { key: "emergencyPhone", label: "Their phone", type: "tel", placeholder: "+44 7700 900456" },
];

/**
 * The travel details an organiser keeps on a person: date of birth, dietary needs, who to call. Read-only rows
 * with an edit mode. Passport details are left out on purpose: they're not needed here and not worth holding.
 */
export function TravelerDetails({ profile, canEdit, onSave }: {
  profile: TravelerProfile | undefined;
  canEdit: boolean;
  onSave: (profile: TravelerProfile | undefined) => void;
}) {
  const [draft, setDraft] = useState<TravelerProfile | null>(null);
  const age = ageOn(profile?.dateOfBirth);
  const has = (k: keyof TravelerProfile) => !!profile?.[k];
  const empty = !profile || Object.keys(profile).length === 0;

  if (draft) {
    return (
      <form
        className="space-y-3"
        onSubmit={e => { e.preventDefault(); onSave(cleanProfile(draft)); setDraft(null); }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map(f => (
            <div key={f.key} className={cn("space-y-1", f.wide && "sm:col-span-2")}>
              <Label htmlFor={`profile-${f.key}`} className="text-xs text-muted-foreground">{f.label}</Label>
              <Input
                id={`profile-${f.key}`}
                type={f.type ?? "text"}
                value={draft[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={e => setDraft(d => d && { ...d, [f.key]: e.target.value })}
                className="h-9"
              />
            </div>
          ))}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="profile-notes" className="text-xs text-muted-foreground">Notes</Label>
            <Textarea id="profile-notes" value={draft.notes ?? ""} placeholder="Mobility needs, room preferences, anything the team should know" onChange={e => setDraft(d => d && { ...d, notes: e.target.value })} className="min-h-20 text-sm" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" className="bg-primary text-primary-foreground">Save details</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
        </div>
      </form>
    );
  }

  const rows: Array<{ icon: typeof Phone; label: string; value: string }> = [];
  if (has("phone")) rows.push({ icon: Phone, label: "Phone", value: profile!.phone! });
  if (has("dateOfBirth")) rows.push({ icon: Cake, label: "Date of birth", value: `${longDate(profile!.dateOfBirth!)}${age !== null ? `, ${age}` : ""}` });
  if (has("nationality")) rows.push({ icon: GlobeHemisphereWest, label: "Nationality", value: profile!.nationality! });
  if (has("dietary")) rows.push({ icon: ForkKnife, label: "Dietary", value: profile!.dietary! });
  if (has("emergencyName") || has("emergencyPhone")) rows.push({ icon: FirstAid, label: "Emergency contact", value: [profile!.emergencyName, profile!.emergencyPhone].filter(Boolean).join(", ") });
  if (has("notes")) rows.push({ icon: Note, label: "Notes", value: profile!.notes! });

  return (
    <div className="space-y-2">
      {empty ? (
        <p className="text-sm text-muted-foreground">No travel details yet. {canEdit ? "Add dietary needs and an emergency contact." : ""}</p>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border">
          {rows.map(r => {
            const Icon = r.icon;
            return (
              <div key={r.label} className="flex items-start gap-3 px-3 py-2.5">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                  <p className="text-sm text-foreground whitespace-pre-line break-words">{r.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {canEdit && (
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setDraft({ ...(profile ?? {}) })}>
          <PencilSimple className="h-4 w-4" /> {empty ? "Add details" : "Edit details"}
        </Button>
      )}
    </div>
  );
}

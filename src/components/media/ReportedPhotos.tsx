import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Flag, Trash, Check } from "@phosphor-icons/react";
import { toast } from "sonner";
import { firebaseDb, firebaseAuth, isFirebaseConfigured } from "@/services/firebase";
import { timeAgo } from "@/lib/timeAgo";
import type { TripMedia } from "@/types";

export type ReportedItem = TripMedia & { tripId: string; tripName: string };
interface Report { trip_id: string; media_id: string; reported_at: string }

/** Clears every report on a photo, for the trip's team; false when the server refused */
async function dismissReports(tripId: string, mediaId: string): Promise<boolean> {
  const token = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
  if (!token) return false;
  const res = await fetch("/api/report-media", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tripId, mediaId, action: "dismiss" }),
  }).catch(() => null);
  return !!res?.ok;
}

/**
 * Photos travellers reported, ahead of the gallery, with remove and keep. Reports are read a trip at a
 * time, as the rules allow; if they can't be read (rules not live yet, or no access) the strip stays hidden.
 */
export function ReportedPhotos({ tripIds, items, onRemove }: {
  tripIds: string[];
  items: ReportedItem[];
  onRemove: (item: ReportedItem) => void;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const key = tripIds.slice().sort().join(",");

  useEffect(() => {
    if (!isFirebaseConfigured() || !key) return;
    let cancelled = false;
    Promise.all(key.split(",").map(id =>
      getDocs(query(collection(firebaseDb(), "media_reports"), where("trip_id", "==", id)))
        .then(s => s.docs.map(d => d.data() as Report))
        .catch(() => [] as Report[]),
    )).then(lists => { if (!cancelled) setReports(lists.flat()); });
    return () => { cancelled = true; };
  }, [key]);

  // One row per reported photo that's still in the gallery, newest report first
  const rows = useMemo(() => {
    const byPhoto = new Map<string, { item: ReportedItem; count: number; latest: string }>();
    for (const r of reports) {
      const item = items.find(i => i.tripId === r.trip_id && i.id === r.media_id);
      if (!item || dismissed.has(`${r.trip_id}/${r.media_id}`)) continue;
      const k = `${r.trip_id}/${r.media_id}`;
      const row = byPhoto.get(k);
      if (row) { row.count++; if (r.reported_at > row.latest) row.latest = r.reported_at; }
      else byPhoto.set(k, { item, count: 1, latest: r.reported_at });
    }
    return [...byPhoto.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [reports, items, dismissed]);

  if (rows.length === 0) return null;

  const keep = async (item: ReportedItem) => {
    setDismissed(prev => new Set(prev).add(`${item.tripId}/${item.id}`));
    if (await dismissReports(item.tripId, item.id)) toast.success("Kept. The report is cleared.");
    else toast.message("Hidden here. The report couldn't be cleared for everyone.");
  };
  // Removing goes through the page's delete confirm; a report on a photo that's gone no longer shows anywhere
  const remove = (item: ReportedItem) => onRemove(item);

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 text-red-600 dark:text-red-400" weight="fill" />
        <h2 className="text-sm font-semibold text-foreground">Reported by travellers</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Everyone else on the trip still sees these until you remove them.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ item, count, latest }) => (
          <li key={`${item.tripId}-${item.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5">
            <img src={item.thumbUrl || item.url} alt="" className="h-14 w-14 rounded-lg object-cover bg-secondary shrink-0" loading="lazy" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{item.tripName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {count > 1 ? `${count} reports, latest ${timeAgo(latest)}` : `Reported ${timeAgo(latest)}`}
                {item.uploadedBy ? `, shared by ${item.uploadedBy}` : ""}
              </p>
              <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={() => remove(item)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash className="h-3.5 w-3.5" /> Remove
                </button>
                <button type="button" onClick={() => void keep(item)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-secondary transition-colors">
                  <Check className="h-3.5 w-3.5" /> Keep
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useCallback, useMemo } from "react";
import { useDirectoryTravelers } from "@/context/directory";
import { useTrips } from "@/context/TripsContext";
import { directoryPhoto } from "@/lib/staffPhoto";

/** A teammate's photo from the people they travel as: their directory entry, or the copy of them on a trip, as the Travellers page shows it */
export function useStaffPhoto() {
  const [directory] = useDirectoryTravelers();
  const { trips } = useTrips();
  const people = useMemo(() => [...directory, ...trips.flatMap(t => t.travelers ?? [])], [directory, trips]);
  return useCallback((email: string, name: string) => directoryPhoto(people, email, name), [people]);
}

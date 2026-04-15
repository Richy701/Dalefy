import React, { createContext, useContext, useState } from "react";
import type { Trip } from "@/shared/types";
import { INITIAL_TRIPS } from "@/shared/trips";

interface TripsContextValue {
  trips: Trip[];
  addTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
  updateTrip: (trip: Trip) => void;
}

const TripsContext = createContext<TripsContextValue | null>(null);

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>(INITIAL_TRIPS);

  const addTrip = (trip: Trip) => setTrips(prev => [trip, ...prev]);
  const deleteTrip = (id: string) => setTrips(prev => prev.filter(t => t.id !== id));
  const updateTrip = (trip: Trip) => setTrips(prev => prev.map(t => t.id === trip.id ? trip : t));

  return (
    <TripsContext.Provider value={{ trips, addTrip, deleteTrip, updateTrip }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within TripsProvider");
  return ctx;
}

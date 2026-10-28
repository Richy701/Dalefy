import { useEffect, useState } from "react";

const API_BASE = `${process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app"}/api`;

interface FlightLiveData {
  gate: string;
  arrGate: string;
  baggageBelt: string;
  aircraft: string;
  terminal: string;
  arrTerminal: string;
  status: string;
  departTime: string;
  arriveTime: string;
  /** Live estimates, "" when there are none */
  revisedTime: string;
  revisedEndTime: string;
}

/** poll: keep refreshing even when the flight is not dated today, e.g. an overnight flight landing this morning */
export function useFlightLiveData(flightNum?: string, date?: string, poll = false) {
  const [data, setData] = useState<FlightLiveData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Another flight's gate must not show while this one loads
    setData(null);
    if (!flightNum || !date) return;

    const clean = flightNum.replace(/\s+/g, "");
    const dateStr = date.slice(0, 10);
    let cancelled = false;

    const doFetch = () => {
      setLoading(true);
      fetch(`${API_BASE}/flight-number?number=${clean}&date=${dateStr}`)
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (cancelled || !json?.flights?.length) return;
          const f = json.flights[0];
          setData({
            gate: f.gate || "",
            arrGate: f.arrGate || "",
            baggageBelt: f.baggageBelt || "",
            aircraft: f.aircraft || "",
            terminal: f.terminal || "",
            arrTerminal: f.arrTerminal || "",
            status: f.status || "",
            departTime: f.departTime || "",
            arriveTime: f.arriveTime || "",
            revisedTime: f.revisedTime || "",
            revisedEndTime: f.revisedEndTime || "",
          });
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    // Gates and delays only move on the day itself; other days fetch once and stop
    const getInterval = () => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return poll || dateStr === today ? 5 * 60 * 1000 : 0;
    };

    doFetch();
    const ms = getInterval();
    const interval = ms > 0 ? setInterval(doFetch, ms) : null;

    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [flightNum, date, poll]);

  return { data, loading };
}

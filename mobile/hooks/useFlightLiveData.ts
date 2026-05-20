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
}

export function useFlightLiveData(flightNum?: string, date?: string) {
  const [data, setData] = useState<FlightLiveData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
          });
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    const getInterval = () => {
      const dep = new Date(`${dateStr}T12:00:00Z`);
      const hoursOut = (dep.getTime() - Date.now()) / 3_600_000;
      if (hoursOut <= 1) return 5 * 60 * 1000;
      if (hoursOut <= 3) return 30 * 60 * 1000;
      return 0;
    };

    doFetch();
    const ms = getInterval();
    const interval = ms > 0 ? setInterval(doFetch, ms) : null;

    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [flightNum, date]);

  return { data, loading };
}

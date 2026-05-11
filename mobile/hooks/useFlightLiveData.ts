import { useEffect, useState } from "react";

const API_BASE = "https://dalefy.vercel.app/api";

interface FlightLiveData {
  gate: string;
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

    setLoading(true);
    fetch(`${API_BASE}/flight-number?number=${clean}&date=${dateStr}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled || !json?.flights?.length) return;
        const f = json.flights[0];
        setData({
          gate: f.gate || "",
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

    return () => { cancelled = true; };
  }, [flightNum, date]);

  return { data, loading };
}

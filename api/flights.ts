import { validateIata, validateDate, requireRapidApi } from "./_validate";

export default async function handler(req: any, res: any) {
  const { from, to, date } = req.query as Record<string, string>;

  const err = validateIata(from, "from") || validateIata(to, "to") || validateDate(date, "date");
  if (err) return res.status(400).json({ error: err });

  const key = requireRapidApi(res);
  if (!key) return;

  const headers = {
    "x-rapidapi-key": key,
    "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
  };

  try {
    // AeroDataBox limits to 12hr windows, so fetch two halves of the day
    const [r1, r2] = await Promise.all([
      fetch(`https://aerodatabox.p.rapidapi.com/flights/airports/iata/${from}/${date}T00:00/${date}T11:59?direction=Departure`, { headers }),
      fetch(`https://aerodatabox.p.rapidapi.com/flights/airports/iata/${from}/${date}T12:00/${date}T23:59?direction=Departure`, { headers }),
    ]);

    const d1 = r1.ok ? await r1.json() : {};
    const d2 = r2.ok ? await r2.json() : {};

    const allDepartures = [...(d1.departures ?? []), ...(d2.departures ?? [])];

    // Filter to flights heading to the destination, skip codeshares
    const toUpper = to.toUpperCase();
    const matched = allDepartures
      .filter((f: any) => f.movement?.airport?.iata?.toUpperCase() === toUpper && f.codeshareStatus !== "IsCodeshared" && !f.isCargo)
      .slice(0, 8);

    const flights = matched.map((f: any) => {
      const mov = f.movement ?? {};
      const depTime = mov.scheduledTime?.local ?? "";
      return {
        airline: f.airline?.name ?? "",
        flightNum: f.number ?? "",
        from: from,
        fromCode: from,
        to: mov.airport?.name ?? "",
        toCode: mov.airport?.iata ?? to,
        departTime: formatTime(depTime),
        arriveTime: "",
        durationMins: 0,
        price: 0,
        stops: 0,
        logo: "",
        status: f.status ?? "",
        terminal: mov.terminal ?? "",
      };
    });

    res.json({ flights });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch from AeroDataBox" });
  }
}

/** Extract HH:mm from an ISO-ish local time string like "2026-04-22 14:30+01:00" or "2026-04-22T14:30" */
function formatTime(t: string): string {
  const match = t.match(/(\d{2}:\d{2})/);
  return match ? match[1] : t;
}

function timeToMins(t: string): number {
  const match = t.match(/(\d{2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

import { validateFlightNum, validateDate, requireRapidApi } from "./_validate.js";

export default async function handler(req: any, res: any) {
  const { number, date } = req.query as Record<string, string>;

  const err = validateFlightNum(number) || validateDate(date, "date");
  if (err) return res.status(400).json({ error: err });

  const key = requireRapidApi(res);
  if (!key) return;

  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${number}/${date}`;

  try {
    const resp = await fetch(url, {
      headers: {
        "x-rapidapi-key": key,
        "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
      },
    });
    const data = await resp.json();

    const raw = (Array.isArray(data) ? data : [])
      .filter((f: any) => f.codeshareStatus !== "IsCodeshared")
      .slice(0, 8);

    const flights = raw.map((f: any) => {
      const dep = f.departure ?? {};
      const arr = f.arrival ?? {};
      const depTime = dep.scheduledTime?.local ?? "";
      const arrTime = arr.scheduledTime?.local ?? "";
      const depMins = timeToMins(depTime);
      const arrMins = timeToMins(arrTime);
      const duration = arrMins >= depMins ? arrMins - depMins : arrMins + 1440 - depMins;

      return {
        airline: f.airline?.name ?? "",
        flightNum: f.number ?? "",
        from: dep.airport?.name ?? "",
        fromCode: dep.airport?.iata ?? "",
        to: arr.airport?.name ?? "",
        toCode: arr.airport?.iata ?? "",
        departTime: formatTime(depTime),
        arriveTime: formatTime(arrTime),
        durationMins: duration,
        price: 0,
        stops: 0,
        logo: "",
        status: f.status ?? "",
        terminal: dep.terminal ?? "",
        arrTerminal: arr.terminal ?? "",
      };
    });

    res.json({ flights });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch from AeroDataBox" });
  }
}

function formatTime(t: string): string {
  const match = t.match(/(\d{2}:\d{2})/);
  return match ? match[1] : t;
}

function timeToMins(t: string): number {
  const match = t.match(/(\d{2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

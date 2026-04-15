export default async function handler(req: any, res: any) {
  const { from, to, date, adults = "1" } = req.query as Record<string, string>;

  if (!from || !to || !date) {
    return res.status(400).json({ error: "Missing params: from, to, date" });
  }

  const key = process.env.SERPAPI_KEY;
  if (!key) return res.status(500).json({ error: "SERPAPI_KEY not configured" });

  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: from,
    arrival_id: to,
    outbound_date: date,
    adults,
    currency: "USD",
    api_key: key,
  });

  try {
    const resp = await fetch(`https://serpapi.com/search?${params}`);
    const data = await resp.json();

    const raw = [...(data.best_flights ?? []), ...(data.other_flights ?? [])].slice(0, 8);

    const flights = raw.map((f: any) => {
      const first = f.flights?.[0];
      const last = f.flights?.[f.flights.length - 1];
      return {
        airline: first?.airline ?? "",
        flightNum: first?.flight_number ?? "",
        from: first?.departure_airport?.name ?? "",
        fromCode: first?.departure_airport?.id ?? from,
        to: last?.arrival_airport?.name ?? "",
        toCode: last?.arrival_airport?.id ?? to,
        departTime: first?.departure_time ?? "",
        arriveTime: last?.arrival_time ?? "",
        durationMins: f.total_duration ?? 0,
        price: f.price ?? 0,
        stops: (f.flights?.length ?? 1) - 1,
        logo: f.airline_logo ?? "",
      };
    });

    res.json({ flights });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch from SerpApi" });
  }
}

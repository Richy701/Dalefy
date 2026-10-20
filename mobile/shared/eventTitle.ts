/** One separator style for event titles everywhere: "PG215 - Arrival" / "Hotel: 14 rooms" / "A — B" all read "A – B". */
export function tidyTitleSeparators(title: string): string {
  return title
    .replace(/\s*\([A-Z]{3}\)\s*$/, "") // "Arrival into Chiang Mai (CNX)": the location line already names the airport
    .replace(/\s+[-–—·]\s+|:\s+/g, " – ").replace(/\s+/g, " ").trim();
}

/** Route-style locations read as words: "Airport → Hotel" / "Airport -> Hotel" become "Airport to Hotel". */
export function tidyLocation(location: string): string {
  return location.replace(/\s*(→|->|⟶|➔)\s*/g, " to ").replace(/\s+/g, " ").trim();
}

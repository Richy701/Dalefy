/**
 * One-time fix: clear destination field on trips where it contains
 * a person's first name instead of a real place.
 *
 * Run: npx tsx scripts/fix-owen-destination.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_ANON_KEY!;

if (!url || !key) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: trips, error } = await supabase
    .from("trips")
    .select("id, name, destination")
    .order("start", { ascending: false });

  if (error) { console.error("Fetch failed:", error); process.exit(1); }

  const PERSON_NAMES = new Set([
    "adam", "alex", "alice", "andrew", "anna", "ben", "brian", "caroline",
    "catherine", "charles", "chris", "claire", "colin", "daniel", "david",
    "diana", "edward", "elizabeth", "emily", "emma", "frances", "frank",
    "gary", "george", "grace", "hannah", "harry", "helen", "henry", "hugh",
    "ian", "jack", "james", "jamie", "jane", "jean", "jennifer", "jessica",
    "jim", "joan", "john", "jonathan", "joseph", "julia", "karen", "kate",
    "keith", "kevin", "kim", "laura", "lauren", "lee", "linda", "lisa",
    "louise", "lucy", "luke", "margaret", "maria", "mark", "martin", "mary",
    "matthew", "michael", "michelle", "mike", "nancy", "nicholas", "oliver",
    "owen", "patricia", "patrick", "paul", "peter", "philip", "rachel",
    "rebecca", "richard", "robert", "roger", "rose", "ruth", "ryan", "sam",
    "sandra", "sarah", "scott", "sharon", "simon", "sophie", "stephen",
    "steven", "stuart", "susan", "thomas", "tim", "tom", "victoria", "william", "zoe",
  ]);

  const toFix = (trips ?? []).filter(t => {
    if (!t.destination) return false;
    const firstWord = t.destination.trim().split(/\s+/)[0].toLowerCase();
    return PERSON_NAMES.has(firstWord);
  });

  if (toFix.length === 0) {
    console.log("No trips with person-name destinations found.");
    return;
  }

  console.log(`Found ${toFix.length} trip(s) to fix:`);
  for (const t of toFix) {
    console.log(`  - "${t.name}" has destination="${t.destination}"`);
  }

  for (const t of toFix) {
    const { error: updateErr } = await supabase
      .from("trips")
      .update({ destination: null })
      .eq("id", t.id);

    if (updateErr) {
      console.error(`  ✗ Failed to fix "${t.name}":`, updateErr.message);
    } else {
      console.log(`  ✓ Cleared destination on "${t.name}"`);
    }
  }

  console.log("Done.");
}

main();

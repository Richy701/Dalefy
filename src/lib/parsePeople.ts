/**
 * Turns pasted text or a CSV into people. Handles the shapes that come out of spreadsheets, email
 * clients and booking forms: "Name, email", "Name <email>", "First, Last, Email" columns with or
 * without a header row, tab-separated, and bare emails.
 */
export interface ParsedPerson {
  name: string;
  email: string;
  /** 1-based line in the pasted text, for pointing at problems */
  line: number;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i;
const HEADER_WORDS = /^(first\s*name|last\s*name|surname|full\s*name|name|e-?mail|email\s*address|phone|mobile|role|notes?|title|company)$/i;

function clean(cell: string): string {
  return cell.trim().replace(/^["']+|["']+$/g, "").replace(/^<|>$/g, "").trim();
}

function splitCells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  // CSV with quoted cells that may themselves contain commas
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

/** A line made only of column labels, such as the first row of a spreadsheet export */
function isHeader(cells: string[]): boolean {
  const named = cells.map(clean).filter(Boolean);
  return named.length > 0 && named.every(c => HEADER_WORDS.test(c));
}

export function parsePeople(text: string): ParsedPerson[] {
  const people: ParsedPerson[] = [];
  const lines = text.split(/\r?\n/);
  let firstLastColumns = false;
  let columns: string[] | null = null;

  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = splitCells(raw);
    if (!people.length && !columns && (isHeader(cells) || cells.some(c => /^(e-?mail|email address)$/i.test(clean(c))))) {
      const labels = cells.map(c => clean(c).toLowerCase());
      columns = labels;
      firstLastColumns = labels.some(l => /^first/.test(l)) && labels.some(l => /^(last|surname)/.test(l));
      return;
    }

    if (columns) {
      const field = (pattern: RegExp) => clean(cells[columns!.findIndex(label => pattern.test(label))] || "");
      const email = field(/^(e-?mail|email address)$/).toLowerCase();
      const full = field(/^(full\s*name|name)$/);
      const first = field(/^(first\s*name|given\s*name)$/);
      const last = field(/^(last\s*name|surname|family\s*name)$/);
      const name = (full || [first, last].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim();
      if (name || email) people.push({ name, email, line: i + 1 });
      return;
    }
    // Outlook recipient lists often contain several Name <email> entries on one line.
    const recipients = [...raw.matchAll(/([^;<>]*?)<([^<>]+)>\s*(?:;|,|$)/g)];
    if (recipients.length > 1) {
      for (const recipient of recipients) people.push({ name: clean(recipient[1]), email: clean(recipient[2]).toLowerCase(), line: i + 1 });
      return;
    }
    const bareEmails = cells.map(clean).filter(Boolean);
    if (bareEmails.length > 1 && bareEmails.every(cell => /^[^\s@]+@[^\s@]+$/.test(cell))) {
      bareEmails.forEach(email => people.push({ name: "", email: email.toLowerCase(), line: i + 1 }));
      return;
    }
    let email = "";
    const words: string[] = [];
    for (const cell of cells) {
      const c = clean(cell);
      if (!c) continue;
      const m = c.match(EMAIL_RE);
      if (m && !email) {
        email = m[0].toLowerCase();
        const rest = clean(c.replace(m[0], "").replace(/[<>()]/g, " "));
        if (rest) words.push(rest);
      } else if (!m && c.includes("@") && !email) {
        email = c.toLowerCase();
      } else if (!m) {
        words.push(c);
      }
    }

    // "First, Last" as two cells reads as one name; anything else keeps the first cell as the name
    let name = "";
    if (words.length >= 2 && (firstLastColumns || (!words[0].includes(" ") && !words[1].includes(" ")))) {
      name = `${words[0]} ${words[1]}`;
    } else if (words.length >= 1) {
      name = words[0];
    }
    name = name.replace(/\s+/g, " ").trim();
    // "Mensah, Ama" from a Last, First column
    const lastFirst = name.match(/^([^,]+),\s*([^,]+)$/);
    if (lastFirst) name = `${lastFirst[2].trim()} ${lastFirst[1].trim()}`;
    if (!name && !email) return;
    people.push({ name, email, line: i + 1 });
  });

  return people;
}

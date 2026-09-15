// Scope simulated time to mobile source; browser animation clocks stay untouched.
let today: string | null = null;
export function setPreviewDate(value: string | null) { today = value; }
export class PreviewDate extends Date {
  constructor(...args: any[]) {
    if (args.length) super(...args as [string]);
    else super(today ? `${today}T12:00:00` : Date.now());
  }
  static now() { return today ? new Date(`${today}T12:00:00`).getTime() : Date.now(); }
}

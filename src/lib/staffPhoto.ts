type Person = { name?: string; email?: string; avatar?: string };

const comparable = (s: string) => s.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");

/**
 * A teammate's photo from the traveller directory (staff travel too): the entry with their email, else
 * the one entry whose name is theirs. An account named after its email, like "laura.davies", counts as
 * "Laura Davies". Single words and names shared by different photos never match.
 */
export function directoryPhoto(directory: Person[], email: string, name: string): string {
  const e = email.trim().toLowerCase();
  if (e) {
    const byEmail = directory.find(p => (p.email ?? "").trim().toLowerCase() === e && p.avatar);
    if (byEmail?.avatar) return byEmail.avatar;
  }
  const names = new Set([comparable(name), e ? comparable(e.split("@")[0]) : ""].filter(n => n.includes(" ")));
  if (!names.size) return "";
  const photos = new Set(directory.filter(p => p.avatar && names.has(comparable(p.name ?? ""))).map(p => p.avatar));
  return photos.size === 1 ? [...photos][0] ?? "" : "";
}

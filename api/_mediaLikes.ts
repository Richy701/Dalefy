import { record } from "./_tripView.js";

export type PhotoLike = { uid: string; name: string; avatar?: string };
const avatarUrl = (value: unknown) => typeof value === "string" && /^https:\/\//.test(value) && value.length <= 1000 ? value : undefined;
export function photoLikes(value: unknown): PhotoLike[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : []).flatMap(value => {
    const item = record(value);
    if (typeof item.uid !== "string" || !item.uid || seen.has(item.uid)) return [];
    seen.add(item.uid);
    const avatar = avatarUrl(item.avatar);
    return [{ uid: item.uid, name: typeof item.name === "string" ? item.name.slice(0, 80) : "Traveller", ...(avatar ? { avatar } : {}) }];
  });
}

/** An explicit desired state makes retries idempotent; only the caller's like changes. */
export function applyPhotoLike(media: unknown, mediaId: string, uid: string, name: string, liked: boolean, avatar?: string) {
  if (!Array.isArray(media)) throw new Error("Photo not found");
  const photo = media.map(record).find(item => item.id === mediaId);
  if (!photo) throw new Error("Photo not found");
  const before = photoLikes(photo.likes);
  const hadLike = before.some(like => like.uid === uid);
  const likes = before.filter(like => like.uid !== uid);
  const picture = avatarUrl(avatar);
  if (liked) likes.push({ uid, name: name.trim().slice(0, 80) || "Traveller", ...(picture ? { avatar: picture } : {}) });
  return { media: media.map(item => record(item).id === mediaId ? { ...record(item), likes } : item), likes, added: liked && !hadLike, photo };
}

/**
 * Likes and uploads show the person's current profile picture. Travellers can't read each other's memberships,
 * so the server fills it in when it sends the trip: the organiser's photo of the traveller they joined as first,
 * then their own app picture, then whatever was saved with the like.
 */
export async function withPeoplePictures<T extends Record<string, unknown>>(
  view: T,
  tripId: string,
  readMember: (uid: string, tripId: string) => Promise<Record<string, unknown>>,
): Promise<T> {
  const media = Array.isArray(view.media) ? view.media.map(record) : [];
  const uids = [...new Set(media.flatMap(photo => [
    ...photoLikes(photo.likes).map(like => like.uid),
    ...(typeof photo.uploaderId === "string" && photo.uploaderId ? [photo.uploaderId] : []),
  ]))].slice(0, 200);
  if (!uids.length) return view;
  const travelers = Array.isArray(view.travelers) ? view.travelers.map(record) : [];
  // The name each person uploaded or liked under, for people who never picked themselves on the trip
  const names = new Map<string, string>();
  for (const photo of media) {
    if (typeof photo.uploaderId === "string" && typeof photo.uploadedBy === "string") names.set(photo.uploaderId, photo.uploadedBy);
    for (const like of photoLikes(photo.likes)) if (!names.has(like.uid)) names.set(like.uid, like.name);
  }
  const byName = (name: unknown) => {
    const wanted = typeof name === "string" ? name.trim().toLowerCase() : "";
    if (!wanted) return undefined;
    const full = travelers.filter(t => typeof t.name === "string" && t.name.trim().toLowerCase() === wanted);
    if (full.length === 1) return full[0];
    // Only a first name that belongs to exactly one traveller on this trip
    const first = (n: unknown) => typeof n === "string" ? n.trim().toLowerCase().split(/\s+/)[0] : "";
    const same = travelers.filter(t => first(t.name) === first(wanted));
    return same.length === 1 ? same[0] : undefined;
  };
  const pictures = new Map<string, string>();
  await Promise.all(uids.map(async uid => {
    const member = await readMember(uid, tripId).catch(() => ({} as Record<string, unknown>));
    if (member.uid !== uid || member.trip_id !== tripId) return;
    const listed = (member.linked_traveler_id ? travelers.find(t => t.id === member.linked_traveler_id) : undefined)
      ?? byName(member.name) ?? byName(names.get(uid));
    // The photo the organiser set for this traveller wins, as on the app's Profile tab; their own app picture fills in without one
    const picture = avatarUrl(listed?.avatar) ?? avatarUrl(member.avatar);
    if (picture) pictures.set(uid, picture);
  }));
  return {
    ...view,
    media: media.map(photo => {
      const uploaderAvatar = typeof photo.uploaderId === "string" ? pictures.get(photo.uploaderId) : undefined;
      const likes = Array.isArray(photo.likes) ? photoLikes(photo.likes).map(like => {
        const avatar = pictures.get(like.uid) ?? like.avatar;
        return avatar ? { ...like, avatar } : { uid: like.uid, name: like.name };
      }) : undefined;
      if (!uploaderAvatar && !likes) return photo;
      return { ...photo, ...(likes ? { likes } : {}), ...(uploaderAvatar ? { uploaderAvatar } : {}) };
    }),
  };
}

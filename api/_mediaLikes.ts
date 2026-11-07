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

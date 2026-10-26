import { Platform, Linking } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { canQuickLook, quickLook } from "@/modules/dalefy-quick-look";

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/** The document as a local file, written once per URL so reopening is instant */
async function localCopy(url: string, name?: string): Promise<File> {
  const data = url.match(/^data:([^;]+);base64,(.+)$/);
  const ext = data ? MIME_EXT[data[1]] || "bin" : (url.split("?")[0].match(/\.(\w{2,4})$/)?.[1] ?? "pdf");
  const filename = (name || "").replace(/[/\\:]/g, "-").trim() || `document.${ext}`;
  const dir = new Directory(Paths.cache, "documents", hashUrl(url) + url.length);
  const file = new File(dir, /\.\w{2,4}$/.test(filename) ? filename : `${filename}.${ext}`);
  if (file.exists) return file;
  if (!dir.exists) dir.create({ intermediates: true });
  if (data) file.write(base64ToBytes(data[2]));
  else await File.downloadFileAsync(url, file, { idempotent: true });
  return file;
}

export async function openDocument(url: string, name?: string): Promise<void> {
  // iOS: the system viewer, over the trip, instead of leaving for Safari
  if (Platform.OS === "ios" && canQuickLook) {
    try {
      const file = await localCopy(url, name);
      await quickLook(file.uri, name);
      return;
    } catch (e) {
      console.warn("[openDocument] Quick Look failed, opening the link instead:", e);
    }
  }

  if (!url.startsWith("data:") || Platform.OS !== "android") {
    await Linking.openURL(url);
    return;
  }

  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    await Linking.openURL(url);
    return;
  }

  const mimeType = match[1];
  const base64 = match[2];
  const ext = MIME_EXT[mimeType] || "bin";
  const filename = name || `document.${ext}`;

  const file = new File(Paths.cache, filename);
  file.write(base64ToBytes(base64));

  await Sharing.shareAsync(file.uri, { mimeType, UTI: mimeType });
}

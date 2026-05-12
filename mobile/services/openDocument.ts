import { Platform, Linking } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

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

export async function openDocument(url: string, name?: string): Promise<void> {
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

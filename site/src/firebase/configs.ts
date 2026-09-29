import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Saved configurations live at `users/{uid}/configs/{configId}`, so each one belongs to the
 * signed-in user and `firestore.rules` only lets that user read or change it.
 */
export interface SavedConfig {
  id: string;
  name: string;
  weekId: string;
  /** The week's settings, serialized. Stored as a string because Firestore rejects `undefined`
   *  values and arrays nested directly inside arrays, both of which week state can contain. */
  dataJson: string;
  /** Small JPEG data URL of the 3D view at save time, or "" if none could be captured. */
  thumbnail: string;
  createdAt: Timestamp | null;
}

function configsOf(uid: string) {
  if (!db) throw new Error("Firebase is not configured.");
  return collection(db, "users", uid, "configs");
}

/** Streams the user's saved configurations for one week, newest first. Returns an unsubscribe. */
export function watchConfigs(
  uid: string,
  weekId: string,
  onChange: (configs: SavedConfig[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(configsOf(uid), where("weekId", "==", weekId)),
    (snapshot) => {
      // "estimate" fills in a just-saved item's pending server time with the local clock.
      const configs = snapshot.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }) as SavedConfig);
      // Sorted here rather than with orderBy, which would need a composite Firestore index.
      configs.sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()));
      onChange(configs);
    },
    onError,
  );
}

export async function saveConfig(uid: string, weekId: string, name: string, data: unknown, thumbnail: string): Promise<void> {
  await addDoc(configsOf(uid), {
    name,
    weekId,
    dataJson: JSON.stringify(data),
    thumbnail,
    createdAt: serverTimestamp(),
  });
}

export async function deleteConfig(uid: string, configId: string): Promise<void> {
  await deleteDoc(doc(configsOf(uid), configId));
}

const THUMBNAIL_WIDTH = 240;

/**
 * Captures the largest canvas on the stage as a small JPEG data URL.
 *
 * WebGL clears its drawing buffer once a frame is shown, so reading the canvas at a random
 * moment returns a blank image. Reading it inside a requestAnimationFrame callback, which runs
 * right after the week's own render loop in the same frame, gets the rendered picture.
 */
export function captureThumbnail(root: HTMLElement | null): Promise<string> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const canvases = [...(root?.querySelectorAll("canvas") ?? [])];
      const source = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (!source || source.width === 0) return resolve("");
      const scaled = document.createElement("canvas");
      scaled.width = THUMBNAIL_WIDTH;
      scaled.height = Math.round((THUMBNAIL_WIDTH * source.height) / source.width);
      const ctx = scaled.getContext("2d");
      if (!ctx) return resolve("");
      ctx.drawImage(source, 0, 0, scaled.width, scaled.height);
      resolve(scaled.toDataURL("image/jpeg", 0.75));
    });
  });
}

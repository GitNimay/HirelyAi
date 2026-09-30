/** Upload rules shared by the composer (UX) and the server (enforcement). */
export const MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024; // Workers request bodies cap at 100 MB
export const MAX_IMAGES = 4;
export const MAX_POST_CHARS = 3000;
export const MAX_COMMENT_CHARS = 1250;
export const MAX_ALT_CHARS = 1000; // image descriptions for screen readers, same cap as X

export const isVideo = (type: string) => type.startsWith("video/");
export const maxBytes = (type: string) => (isVideo(type) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);

/** R2 layout: `<folder>/<userId>/<uuid>.<ext>`, one top-level folder per kind of file. */
export type Folder = "posts" | "profiles" | "resumes";
export const newKey = (folder: Folder, userId: string, ext: string) => `${folder}/${userId}/${crypto.randomUUID()}.${ext}`;

// ponytail: keys uploaded before folders are `<userId>/<uuid>.<ext>` (profile images `<userId>/pf-…`). They are still
// accepted as post media / resumes so older posts stay editable; drop the legacy branch after moving those objects.
const legacy = (key: string, userId: string) => key.startsWith(`${userId}/`) && !key.startsWith(`${userId}/pf-`);

/** Whether `key` is `userId`'s file in `folder`. The server still checks the object's owner metadata. */
export const inFolder = (key: string, folder: Folder, userId: string) =>
  key.startsWith(`${folder}/${userId}/`) || (folder !== "profiles" && legacy(key, userId));

/** Who uploaded `key`, from its path. */
export const keyOwner = (key: string) => {
  const parts = key.split("/");
  return parts.length === 3 ? parts[1] : parts[0];
};

/**
 * Center-crop `file` to exactly w×h (cover fit) and re-encode as JPEG, so avatars and covers are small, uniformly
 * sized and stripped of metadata (EXIF location) before they leave the browser.
 * ponytail: fixed center crop, no drag/zoom cropper. Add one if members need to choose the framing.
 */
export async function cropImage(file: File, w: number, h: number): Promise<Blob> {
  const bmp = await createImageBitmap(file); // applies EXIF orientation
  const scale = Math.max(w / bmp.width, h / bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#161616"; // transparent PNGs flatten onto the app background instead of black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, (w - bmp.width * scale) / 2, (h - bmp.height * scale) / 2, bmp.width * scale, bmp.height * scale);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image"))), "image/jpeg", 0.88));
}

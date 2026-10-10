// Screenshot + numbered boxes (Set-of-Marks). docs/ARCHITECTURE.md section 8.
const MAX_W = 1280;
const COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#008080", "#9a6324", "#800000"];
let lastCapture = 0;

export async function captureWithMarks(windowId, page, elements) {
  const wait = 600 - (Date.now() - lastCapture); // captureVisibleTab: max 2 calls/s
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCapture = Date.now();

  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 80 });
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());

  const outW = Math.min(MAX_W, bitmap.width);
  const outH = Math.round(bitmap.height * (outW / bitmap.width));
  const s = outW / page.viewport.width; // CSS px -> output px

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, outW, outH);
  ctx.lineWidth = 2;
  ctx.font = "bold 13px sans-serif";
  ctx.textBaseline = "top";

  for (const el of elements) {
    const c = COLORS[el.id % COLORS.length];
    const x = el.rect.x * s, y = el.rect.y * s, w = el.rect.w * s, h = el.rect.h * s;
    ctx.strokeStyle = c;
    ctx.strokeRect(x, y, w, h);
    // TODO(Milestone 3): smarter tag placement so tags never cover a neighbour (see Pointr section 8).
    const label = String(el.id);
    const tw = ctx.measureText(label).width + 6;
    const ty = y >= 16 ? y - 16 : y;
    ctx.fillStyle = c;
    ctx.fillRect(x, ty, tw, 16);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + 3, ty + 2);
  }

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

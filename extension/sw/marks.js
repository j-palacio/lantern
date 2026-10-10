// Screenshot + numbered boxes (Set-of-Marks). docs/ARCHITECTURE.md section 8.
const MAX_W = 1280;
const COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#008080", "#9a6324", "#800000"];
const TAG_H = 18;
const FONT = "bold 13px sans-serif";
const DEBUG = false; // true: log how many tags ended up on top of something

// How bad it is for a tag to cover one output pixel of...
const NEIGHBOUR = 3; // ...another element: the model would read the tag as that one's number
const OTHER_TAG = 5; // ...a tag we already drew: two unreadable numbers instead of one
const SELF = 1;      // ...its own element: acceptable, the text is in the element list too

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
  ctx.font = FONT;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // Every element's box up front, so a tag can be placed where it hides no neighbour.
  const boxes = elements.map((el) => ({
    x: el.rect.x * s, y: el.rect.y * s, w: el.rect.w * s, h: el.rect.h * s,
  }));
  const placed = [];
  let dirty = 0;

  elements.forEach((el, i) => {
    const c = COLORS[el.id % COLORS.length];
    const box = boxes[i];
    ctx.lineWidth = 2;
    ctx.strokeStyle = c;
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    const label = String(el.id);
    const tag = placeTag(box, Math.round(ctx.measureText(label).width) + 10, boxes, placed, i, outW, outH);
    placed.push(tag);
    if (tag.cost) dirty++;

    ctx.fillStyle = c;
    ctx.fillRect(tag.x, tag.y, tag.w, tag.h);
    ctx.lineWidth = 1; // thin white edge: the tag stays readable on a busy page
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(tag.x + 0.5, tag.y + 0.5, tag.w - 1, tag.h - 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1);
  });

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (DEBUG) console.log(`[Lantern:sw] marks ${outW}x${outH} ${(bytes.length / 1024) | 0} KB, ${elements.length} elements, ${dirty} crowded tags`);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Overlapping area of two {x,y,w,h} boxes, 0 if they do not touch. */
function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Where to draw element `self`'s number tag: the first spot that covers nothing at all,
 * otherwise the cheapest one. Outside corners are tried before inside ones, so a tag only
 * sits on top of its own element when there is no room beside it.
 */
function placeTag(box, w, boxes, placed, self, maxW, maxH) {
  const h = TAG_H;
  const right = box.x + box.w, bottom = box.y + box.h;
  const spots = [
    { x: box.x, y: box.y - h }, { x: right - w, y: box.y - h },   // above
    { x: box.x - w, y: box.y }, { x: right, y: box.y },           // beside, top
    { x: box.x, y: bottom }, { x: right - w, y: bottom },         // below
    { x: box.x - w, y: bottom - h }, { x: right, y: bottom - h }, // beside, bottom
    { x: box.x, y: box.y }, { x: right - w, y: box.y },           // inside, top
    { x: box.x, y: bottom - h }, { x: right - w, y: bottom - h }, // inside, bottom
  ];

  let best = null, bestCost = Infinity;
  for (const spot of spots) {
    const tag = { x: spot.x, y: spot.y, w, h };
    if (tag.x < 0 || tag.y < 0 || tag.x + w > maxW || tag.y + h > maxH) continue;
    let cost = 0;
    for (let i = 0; i < boxes.length && cost < bestCost; i++) {
      cost += overlap(tag, boxes[i]) * (i === self ? SELF : NEIGHBOUR);
    }
    for (let i = 0; i < placed.length && cost < bestCost; i++) cost += overlap(tag, placed[i]) * OTHER_TAG;
    if (cost === 0) return { ...tag, cost };
    if (cost < bestCost) { bestCost = cost; best = { ...tag, cost }; }
  }
  // Every spot falls off the image (an element right at the edge): clamp it back inside.
  return best || { x: Math.max(0, Math.min(box.x, maxW - w)), y: Math.max(0, Math.min(box.y, maxH - h)), w, h, cost: 0 };
}

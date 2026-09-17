// Renders one map thumbnail per prebuilt analysis into public/thumbs/<id>.svg,
// so the dashboard cards show the actual answer rather than a generic map.
//
//   npx tsx scripts/build-thumbnails.mts [id ...]
//
// Offline and manual, like the query matrix: it runs the real pipeline against
// the live endpoints, which takes minutes. Re-run it when a prebuilt question
// changes shape. The output is committed, so the dashboard costs one static
// file per card and no queries at all.
//
// The basemap is Esri's ocean canvas, requested in EPSG:4326 (imageSR=4326) so
// that plotting a point is a linear map from degrees to pixels. Ask for it in
// the service's native Mercator and every latitude lands slightly wrong.
//
// It is inlined as a JPEG rather than a PNG: the same 440x300 tile is ~25KB
// against ~90KB, and the marks are drawn as SVG on top, so the compression
// artefacts land on terrain nobody is reading.
import { mkdirSync, writeFileSync } from 'node:fs';
import { PREBUILT_QUERIES } from '../src/constants/prebuiltQueries';
import { planPipeline } from '../src/engine/planner';
import { executePipeline } from '../src/engine/executor';
import { questionThumbnailUrl, boundsForQuestion } from '../src/constants/regionBounds';

const W = 440;
const H = 300;
const OUT = 'public/thumbs';
// A thumbnail is 110px wide on screen. Past a few hundred marks it is a solid
// blob that costs bytes to no effect.
const MAX_POINTS = 400;
const MAX_LINES = 150;

type Pt = [number, number];

const COLORS: Record<string, string> = {
  sp: '#f1a340', // samples
  fac: '#cb181d', // facilities
  wb: '#2b8cbe', // water bodies
  well: '#045a8d', // wells
};

function coordsIn(wkt: string): Pt[] {
  const out: Pt[] = [];
  const re = /(-?\d+\.\d+)\s+(-?\d+\.\d+)/g;
  let m;
  while ((m = re.exec(wkt))) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

interface Marks {
  points: { at: Pt; color: string }[];
  lines: Pt[][];
}

function collect(data: Record<string, any[]>): Marks {
  const points: Marks['points'] = [];
  const lines: Marks['lines'] = [];
  for (const [key, rows] of Object.entries(data)) {
    if (key === 'GET_REGION_BOUNDARIES') continue; // county outlines are noise at this size
    for (const row of rows ?? []) {
      for (const [field, value] of Object.entries(row)) {
        if (typeof value !== 'string' || !/^\s*(POINT|LINESTRING|MULTILINESTRING|POLYGON|MULTIPOLYGON)/i.test(value)) continue;
        const pts = coordsIn(value);
        if (pts.length === 0) continue;
        if (/^POINT/i.test(value.trim())) {
          const prefix = field.replace(/WKT$/i, '').toLowerCase();
          points.push({ at: pts[0], color: COLORS[prefix] ?? COLORS.sp });
        } else {
          lines.push(pts);
        }
      }
    }
  }
  return { points, lines };
}

/** Grow a bbox to the image aspect ratio, so Esri does not adjust it on us. */
function toAspect(b: [number, number, number, number]): [number, number, number, number] {
  const [w, s, e, n] = b;
  const want = W / H;
  let width = e - w;
  let height = n - s;
  if (width / height > want) height = width / want;
  else width = height * want;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  return [cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2];
}

async function basemap(bbox: number[]): Promise<string> {
  const url =
    'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/export' +
    `?bbox=${bbox.join(',')}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=jpg&f=image`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`basemap ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}

function everyNth<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  return items.filter((_, i) => i % step === 0);
}

async function render(id: string, marks: Marks, fallback: [number, number, number, number]) {
  // Walked rather than spread: a statewide trace carries a few hundred thousand
  // coordinates, and Math.min(...arr) blows the call stack well before that.
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  let seen = 0;
  const see = ([lon, lat]: Pt) => {
    seen++;
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  };
  for (const p of marks.points) see(p.at);
  for (const line of marks.lines) for (const p of line) see(p);

  let box = fallback;
  if (seen > 0) {
    const pad = 0.08;
    // A single point has no extent; give it a ~5km window to sit in.
    const dx = Math.max((e - w) * pad, 0.05);
    const dy = Math.max((n - s) * pad, 0.05);
    box = [w - dx, s - dy, e + dx, n + dy];
  }
  const bbox = toAspect(box);
  const x = (lon: number) => ((lon - bbox[0]) / (bbox[2] - bbox[0])) * W;
  const y = (lat: number) => H - ((lat - bbox[1]) / (bbox[3] - bbox[1])) * H;

  const png = await basemap(bbox);
  const paths = everyNth(marks.lines, MAX_LINES)
    .map((line) => {
      const d = everyNth(line, 60).map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('');
      return `<path d="${d}" fill="none" stroke="#1b6d9e" stroke-width="1.2" stroke-opacity="0.75"/>`;
    })
    .join('');
  const dots = everyNth(marks.points, MAX_POINTS)
    .map((p) => `<circle cx="${x(p.at[0]).toFixed(1)}" cy="${y(p.at[1]).toFixed(1)}" r="4" fill="${p.color}" fill-opacity="0.85" stroke="#fff" stroke-width="1"/>`)
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<image href="data:image/jpeg;base64,${png}" xlink:href="data:image/jpeg;base64,${png}" width="${W}" height="${H}"/>` +
    paths +
    dots +
    '</svg>';
  writeFileSync(`${OUT}/${id}.svg`, svg);
  return { points: marks.points.length, lines: marks.lines.length, bytes: svg.length };
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const queries = wanted.length ? PREBUILT_QUERIES.filter((q) => wanted.includes(q.id)) : PREBUILT_QUERIES;

mkdirSync(OUT, { recursive: true });
let failures = 0;
for (const q of queries) {
  const started = Date.now();
  try {
    const result = await executePipeline(planPipeline(q.question), q.question, () => {});
    if (result.status !== 'success') throw new Error(result.status);
    const marks = collect(result.data);
    const stats = await render(q.id, marks, boundsForQuestion(q.question));
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`ok   ${q.id} ${stats.points}pts ${stats.lines}lines ${(stats.bytes / 1024).toFixed(0)}KB ${secs}s`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${q.id} ${(err as Error).message} (card falls back to ${questionThumbnailUrl(q.question).slice(0, 60)}...)`);
  }
}
process.exit(failures === queries.length ? 1 : 0);

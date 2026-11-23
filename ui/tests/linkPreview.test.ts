// Link previews and the tab icon come from static tags in index.html. If one
// points at a file that is not in public/, nothing fails: the SPA fallback
// (public/_redirects) answers that URL with index.html and a 200, and the
// preview card shows a blank placeholder.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

/** The content of the meta tag whose `property` or `name` is `key`. */
function meta(key: string): string | undefined {
  const tag = new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]+)"`);
  return html.match(tag)?.[1];
}

/** Width and height from a PNG's IHDR chunk, or undefined if it is not a PNG. */
function pngSize(path: string): { width: number; height: number } | undefined {
  const buf = readFileSync(path);
  if (buf.toString('latin1', 1, 4) !== 'PNG') return undefined;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('link preview tags', () => {
  const image = meta('og:image');

  it('og:image is an absolute URL to a 1200x630 PNG in public/', () => {
    expect(image).toMatch(/^https:\/\/explorer\.sawgraph\.com\//);
    const file = join(root, 'public', new URL(image!).pathname);
    expect(existsSync(file)).toBe(true);
    expect(pngSize(file)).toEqual({ width: 1200, height: 630 });
  });

  it('declares the size it ships', () => {
    expect(meta('og:image:width')).toBe('1200');
    expect(meta('og:image:height')).toBe('630');
  });

  it('has a title, description and large card', () => {
    expect(meta('og:title')).toBe('SAWGraph Explorer');
    expect(meta('og:description')).toBeTruthy();
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  it('sets no og:url, so a shared /q/ link is not previewed as the homepage', () => {
    expect(meta('og:url')).toBeUndefined();
  });
});

describe('tab icon', () => {
  it('points at a PNG in public/', () => {
    const href = html.match(/<link rel="icon"[^>]*href="([^"]+)"/)?.[1];
    expect(href).toBe('/favicon.png');
    expect(pngSize(join(root, 'public', href!))).toBeDefined();
  });
});

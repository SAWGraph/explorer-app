import { domToJpeg } from 'modern-screenshot';

export async function exportMapAsJpg() {
  const container = document.querySelector('.leaflet-container') as HTMLElement | null;
  if (!container) return;

  const dataUrl = await domToJpeg(container, {
    quality: 0.95,
    backgroundColor: '#ffffff',
    fetch: { requestInit: { mode: 'cors' } },
  });

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = 'sawgraph-map.jpg';
  link.click();
}

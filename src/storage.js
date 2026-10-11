// Images live in the `media` table and are served by the app at BASE_URL/m/<id>.<ext>.
import { q } from './pg.js';
import { need } from './util.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const mediaUrl = (id, mime = 'image/jpeg') => `${need('BASE_URL').replace(/\/$/, '')}/m/${id}.${EXT[mime]}`;

export async function saveMedia(data, mime = 'image/jpeg') {
  return (await q('insert into media (mime, data) values ($1, $2) returning id', [mime, data]))[0].id;
}

export async function saveJpegs(jpegs) {
  const urls = [];
  for (const buf of jpegs) urls.push(mediaUrl(await saveMedia(buf, 'image/jpeg')));
  return urls;
}

export async function getMedia(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await q('select mime, data from media where id = $1', [id]))[0] ?? null;
}

export const pruneMedia = (days = 60) => q("delete from media where created_at < now() - ($1 || ' days')::interval", [String(days)]);

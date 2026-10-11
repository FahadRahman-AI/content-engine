// Connection check: database rows + write test, and Storage buckets.
import 'dotenv/config';
import { closePool, q } from '../src/pg.js';

try {
  for (const t of ['settings', 'reference_posts', 'posts', 'raw_notes']) {
    const [{ n }] = await q(`select count(*)::int as n from ${t}`);
    console.log(`${t.padEnd(16)} rows: ${n}`);
  }
  const ins = await q("insert into raw_notes (text) values ('dbcheck probe') returning id");
  await q('delete from raw_notes where id = $1', [ins[0].id]);
  console.log('Database write test         : saved OK');
} catch (e) {
  console.log('DATABASE ERROR              :', e.message);
}
try {
  const id = (await q("insert into media (mime, data) values ('image/jpeg', 'x') returning id"))[0].id;
  await q('delete from media where id = $1', [id]);
  console.log('Image storage (media table) : OK');
} catch (e) {
  console.log('IMAGE STORAGE ERROR         :', e.message);
}
await closePool();

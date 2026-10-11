// Inserts seed.json into reference_posts as approved examples. Safe to re-run.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { addReference } from '../src/data.js';
import { closePool, q } from '../src/pg.js';

const seeds = JSON.parse(await readFile(new URL('../seed.json', import.meta.url), 'utf8'));
const have = new Set((await q('select hook from reference_posts')).map((r) => r.hook));
const todo = seeds.filter((s) => !have.has(s.hook));
for (const s of todo) await addReference({ pillar: s.pillar, hook: s.hook, slides: s, status: 'approved', note: 'seed' });
const [{ n }] = await q('select count(*)::int as n from reference_posts');
console.log(`seed: inserted ${todo.length}, table now has ${n} reference posts`);
await closePool();

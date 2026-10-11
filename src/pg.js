import pg from 'pg';
import { need } from './util.js';

// Parsed by hand so passwords containing / @ # ? still work (they break the URL format).
export function parseDatabaseUrl(url) {
  const m = url.trim().match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@/]+?)(?::(\d+))?\/([^?]+)(?:\?.*)?$/);
  if (!m) throw new Error('DATABASE_URL must look like postgresql://user:password@host:5432/postgres');
  const [, user, password, host, port, database] = m;
  const local = /^(localhost|127\.0\.0\.1)$/.test(host);
  return { user: decodeURIComponentSafe(user), password: decodeURIComponentSafe(password), host, port: port ? Number(port) : 5432, database, ssl: local ? false : { rejectUnauthorized: false } };
}
const decodeURIComponentSafe = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

let pool;
export function pool_() {
  if (!pool) {
    pool = new pg.Pool({ ...parseDatabaseUrl(need('DATABASE_URL')), max: 4 });
  }
  return pool;
}
export const q = (text, params = []) => pool_().query(text, params).then((r) => r.rows);
export const closePool = () => pool?.end();

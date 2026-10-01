// Acceso a Supabase desde el servidor con la llave de servicio.
// Esta llave nunca viaja al navegador.

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

function must() {
  if (!URL || !SERVICE) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.');
  }
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  must();
  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const db = {
  select: (table, query = '') => rest(`${table}?${query}`),
  insert: (table, row) => rest(table, { method: 'POST', body: row, prefer: 'return=representation' }),
  update: (table, query, patch) =>
    rest(`${table}?${query}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }),
  remove: (table, query) => rest(`${table}?${query}`, { method: 'DELETE' })
};

// Verifica el token de sesion del autor contra Supabase Auth.
async function requireOwner(req) {
  const auth = req.headers.authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!jwt) throw new Error('Sesion no encontrada. Vuelve a entrar.');
  const res = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` }
  });
  if (!res.ok) throw new Error('Sesion expirada. Vuelve a entrar.');
  const user = await res.json();
  return user.id;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function fail(res, err, code = 400) {
  res.status(code).json({ error: err.message || String(err) });
}

module.exports = { db, rest, requireOwner, readBody, fail };

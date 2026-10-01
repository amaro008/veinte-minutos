// Utilidades compartidas de Veinte Minutos.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _sb = null;

export async function sb() {
  if (_sb) return _sb;
  const cfg = await (await fetch('/api/config')).json();
  if (cfg.error) throw new Error(cfg.error);
  _sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return _sb;
}

export async function sesion() {
  const c = await sb();
  const { data } = await c.auth.getSession();
  return data.session;
}

export async function exigirSesion() {
  const s = await sesion();
  if (!s) { location.href = '/index.html'; throw new Error('sin sesion'); }
  return s;
}

// Llamada a las funciones del servidor, firmada con la sesion del autor.
export async function api(ruta, cuerpo, conSesion = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (conSesion) {
    const s = await sesion();
    if (s) headers.Authorization = `Bearer ${s.access_token}`;
  }
  const res = await fetch(`/api/${ruta}`, { method: 'POST', headers, body: JSON.stringify(cuerpo) });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export const esc = t => String(t ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const SECCIONES = {
  pr: 'Comunicado de prensa',
  faq_ext: 'Preguntas del usuario',
  faq_int: 'Preguntas del comite'
};

export const ETAPAS = {
  idea: 'Idea',
  desarrollo: 'En desarrollo',
  produccion: 'En produccion'
};

export function aviso(el, texto, esError = false) {
  if (!texto) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="banner${esError ? ' err' : ''}">${esc(texto)}</div>`;
}

// Dibuja un bloque del documento en modo lectura.
export function pintarBloque(b, extraClase = '') {
  const flag = b.flag && b.status !== 'resolved' ? ' flagged' : (b.flag ? ' flagged resolved' : '');
  const cls = `blk ${b.type}${flag} ${extraClase}`;
  let dentro = '';
  if (b.heading) dentro += `<span class="bh">${esc(b.heading)}</span>`;
  if (b.type === 'quote') dentro += `<blockquote>${esc(b.text)}</blockquote>`;
  else dentro += esc(b.text);
  if (b.flag) {
    const resuelto = b.status === 'resolved';
    const etiqueta = resuelto
      ? `Resuelto: ${b.evidence || ''}`
      : (b.flag === 'supuesto' ? 'Supuesto sin validar' : 'Pregunta abierta');
    dentro += `<span class="flag-note${resuelto ? ' resolved' : ''}">${esc(etiqueta)}</span>`;
  }
  return `<div class="${cls}" data-block="${esc(b.id)}">${dentro}</div>`;
}

// Envuelve en <mark> la primera aparicion del texto citado.
export function resaltar(html, cita) {
  if (!cita) return html;
  const c = esc(cita);
  const i = html.indexOf(c);
  if (i === -1) return html;
  return html.slice(0, i) + '<mark>' + c + '</mark>' + html.slice(i + c.length);
}

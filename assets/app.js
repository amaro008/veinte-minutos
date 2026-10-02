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
  faq_int: 'Preguntas del comité'
};

export const ETAPAS = { idea: 'Idea', desarrollo: 'En desarrollo', produccion: 'En producción' };

export const PREGUNTAS = [
  'Quién es el cliente',
  'Cuál es su problema u oportunidad',
  'Cuál es el beneficio más importante',
  'Cómo sabes que lo necesita',
  'Cómo se ve su experiencia'
];

export function aviso(el, texto, mal = false) {
  el.innerHTML = texto ? `<div class="aviso${mal ? ' mal' : ''}">${esc(texto)}</div>` : '';
}

// Dibuja un bloque del documento en modo lectura.
export function pintarBloque(b, extra = '') {
  const abierto = b.flag && b.status !== 'resolved';
  const resuelto = b.flag && b.status === 'resolved';
  const cls = `blk ${b.type}${b.flag ? ' hueco' : ''}${resuelto ? ' resuelto' : ''} ${extra}`;
  let dentro = '';
  if (b.heading) dentro += `<span class="bh">${esc(b.heading)}</span>`;
  dentro += b.type === 'quote' ? `<blockquote>${esc(b.text)}</blockquote>` : esc(b.text);
  if (b.flag) {
    const etiqueta = resuelto
      ? `Resuelto: ${b.evidence || ''}`
      : (b.flag === 'supuesto' ? 'Supuesto sin validar' : 'Pregunta abierta');
    dentro += `<span class="marca${resuelto ? ' resuelta' : ''}">${esc(etiqueta)}</span>`;
  }
  return `<div class="${cls}" data-block="${esc(b.id)}">${dentro}</div>`;
}

// Envuelve en <mark> la primera aparición del texto citado.
export function resaltar(html, cita) {
  if (!cita) return html;
  const c = esc(cita);
  const i = html.indexOf(c);
  return i === -1 ? html : html.slice(0, i) + '<mark>' + c + '</mark>' + html.slice(i + c.length);
}

export const FUENTES = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap" rel="stylesheet">';

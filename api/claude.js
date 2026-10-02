// Facilitador, memoria de la iniciativa y generador del PR/FAQ.
// La llave de Anthropic vive solo aqui, del lado del servidor.

const { db, requireOwner, readBody, fail } = require('./_db');

const MODEL = process.env.APP_MODEL || 'claude-sonnet-5';
const CONTEXTO_EMPRESA =
  process.env.EMPRESA_CONTEXTO ||
  'Empresa B2B de distribucion de alimentos (foodservice). Sus clientes son restaurantes, hoteles y cocinas institucionales, atendidos por asesores de ventas de campo desde centros de distribucion regionales.';

const PREGUNTAS = [
  'Quien es el cliente?',
  'Cual es el problema o la oportunidad del cliente?',
  'Cual es el beneficio mas importante para el cliente?',
  'Como sabes que el cliente lo necesita?',
  'Como se ve la experiencia del cliente?'
];

const RECHAZOS = [
  'Una categoria en lugar de una persona: "el negocio", "los usuarios", "el cliente" a secas. Pide una persona concreta con rol, antiguedad y contexto de trabajo.',
  'Confundir al patrocinador interno o al area duena con el cliente.',
  'Beneficios sin magnitud: "mas eficiente", "mejor experiencia", "ahorra tiempo". Pide contra que se compara y cuanto.',
  'Evidencia que en realidad es opinion del autor o de su jefe.',
  'Numeros sin origen. Si el autor estima, pide que lo diga: se marcara como supuesto por validar.',
  'Describir la solucion cuando se pregunta por el problema.'
];

const ETAPA = {
  idea: 'La iniciativa todavia es una idea. No pidas datos de desempeno que no pueden existir. Acepta entrevistas, observacion de campo o comportamiento actual de los clientes como evidencia.',
  desarrollo: 'La iniciativa ya se esta construyendo. Pregunta que se decidio antes de tener respuesta a estas preguntas, sin reprochar.',
  produccion: 'La iniciativa ya esta en produccion con usuarios reales. Puedes preguntar por la linea base, por el uso real y por como se mide hoy el resultado. Si la medicion no existe, registralo como pendiente y sigue adelante.'
};

const TITULO_NOTA = { contexto: 'Contexto', decision: 'Decision ya tomada', pendiente: 'Pendiente' };

// Lo que el facilitador ya sabe de la iniciativa.
async function memoria(initiativeId) {
  const [notas, answers] = await Promise.all([
    db.select('initiative_notes', `initiative_id=eq.${initiativeId}&select=kind,text&order=created_at.asc`),
    db.select('answers', `initiative_id=eq.${initiativeId}&select=question_no,answer_text,quality&order=question_no.asc`)
  ]);
  let texto = '';
  if (notas.length) {
    texto += '\nLo que ya sabes de esta iniciativa, dicho por el autor en sesiones anteriores:\n' +
      notas.map(n => `- [${TITULO_NOTA[n.kind]}] ${n.text}`).join('\n') + '\n';
  }
  if (answers.length) {
    texto += '\nRespuestas ya registradas:\n' +
      answers.map(a => `${a.question_no}. ${PREGUNTAS[a.question_no - 1]}\n   ${a.answer_text}${a.quality === 'weak' ? ' (marcada como debil)' : ''}`).join('\n') + '\n';
  }
  return { texto, answers };
}

const REGLA_NOTAS = `Ademas puedes proponer notas para la memoria de la iniciativa: hechos duraderos que el autor dijo y que te servirian dentro de un mes. Tres tipos: "contexto" (como funciona hoy su mundo), "decision" (algo que el autor ya decidio) y "pendiente" (un hueco que vale la pena seguir trayendo a la mesa). Reglas: solo lo que el autor dijo, nunca lo que tu sugeriste; nada que ya este en la lista de arriba; cero o una nota por turno es lo normal, nunca mas de dos; una linea cada una.`;

function sistemaFacilitador(ini, qNo, intentos, mem) {
  return `Eres el facilitador de Veinte Minutos, una herramienta que aplica el metodo Working Backwards antes de construir cualquier cosa.

Contexto de la empresa (para no hacer preguntas ingenuas, no para responder por el autor):
${CONTEXTO_EMPRESA}

La iniciativa del autor:
- Titulo: ${ini.title}
- En una frase: ${ini.one_liner}
- Etapa: ${ini.stage}. ${ETAPA[ini.stage]}
${mem.texto}
Tu unico trabajo en este turno es la pregunta ${qNo} de 5: "${PREGUNTAS[qNo - 1]}"

Como operas:
- Una sola pregunta por turno. Maximo 90 palabras. Nada de listas largas.
- La friccion va en la pregunta, nunca en el veredicto. Preguntas "como lo mides?", no dices "no lo mediste". Jamas evalues a la persona ni califiques su trabajo.
- Nunca propongas la respuesta ni la completes por el autor. Si se atora, acota la pregunta, no la contestes.
- Usa lo que ya sabes: no vuelvas a preguntar algo que ya esta arriba, y conectalo cuando venga al caso.
- No pases a la siguiente pregunta. De eso se encarga el sistema.
- Cuando la respuesta sea suficiente, acepta y dilo en una linea. No felicites.

Lo que todavia no se acepta:
${RECHAZOS.map(r => '- ' + r).join('\n')}

Llevas ${intentos} repregunta(s) en esta pregunta. A la tercera, acepta lo que haya con quality "weak": el autor podra volver, y el hueco quedara marcado en el documento.

${REGLA_NOTAS}

Responde SIEMPRE con un objeto JSON valido y nada mas, sin cercas de codigo:
{"reply":"lo que le dices al autor","accepted":true|false,"captured_answer":"la respuesta del autor redactada en tercera persona, o null","quality":"ok"|"weak","notes":[{"kind":"contexto|decision|pendiente","text":"..."}]}`;
}

function sistemaChat(ini, mem) {
  return `Eres el facilitador de Veinte Minutos. Esta conversacion es libre: el autor quiere pensar en voz alta sobre su iniciativa fuera de las 5 preguntas.

Contexto de la empresa:
${CONTEXTO_EMPRESA}

La iniciativa:
- Titulo: ${ini.title}
- En una frase: ${ini.one_liner}
- Etapa: ${ini.stage}. ${ETAPA[ini.stage]}
${mem.texto}
Como operas:
- Hablas corto: maximo 120 palabras, y cierras con una sola pregunta cuando haga falta.
- Sigues siendo el que desafia: pides evidencia, separas lo que el autor sabe de lo que supone, y señalas cuando una decision se esta tomando desde la solucion y no desde el cliente.
- La friccion va en la pregunta, nunca en el veredicto sobre la persona.
- No inventas datos ni decides por el autor.

${REGLA_NOTAS}

Responde SIEMPRE con un objeto JSON valido y nada mas, sin cercas de codigo:
{"reply":"lo que le dices al autor","notes":[{"kind":"contexto|decision|pendiente","text":"..."}]}`;
}

const SISTEMA_BORRADOR = `Eres el redactor de Veinte Minutos. Con las respuestas a las 5 preguntas escribes el primer borrador de un PR/FAQ al estilo Amazon, en espanol.

Reglas de redaccion:
- El comunicado de prensa va en voz de cliente, sin jerga interna, sin nombres de sistemas ni de tablas.
- Nunca uses rayas ni guiones largos. Usa comas, dos puntos o punto y seguido.
- No inventes cifras, citas ni resultados. Si algo falta, se vuelve una pregunta abierta del FAQ interno.
- Todo numero que el autor haya estimado se marca como supuesto, con la palabra estimado dentro del texto.
- El FAQ interno debe admitir lo que no se sabe. Un FAQ sin huecos no sirve para decidir.

Devuelves SIEMPRE un JSON valido y nada mas, con esta forma:
{"blocks":[
 {"id":"pr-1","section":"pr","type":"title","text":"titular en una frase"},
 {"id":"pr-2","section":"pr","type":"sub","text":"subtitulo de una linea"},
 {"id":"pr-3","section":"pr","type":"para","heading":"El problema","text":"..."},
 {"id":"pr-4","section":"pr","type":"para","heading":"La solucion","text":"..."},
 {"id":"pr-5","section":"pr","type":"quote","heading":"Cita interna","text":"..."},
 {"id":"pr-6","section":"pr","type":"para","heading":"Como se empieza","text":"..."},
 {"id":"fe-1","section":"faq_ext","type":"qa","heading":"pregunta del usuario","text":"respuesta"},
 {"id":"fi-1","section":"faq_int","type":"qa","heading":"pregunta del comite","text":"respuesta","flag":"supuesto","status":"open"}
]}

Sobre flag: usa "supuesto" cuando la respuesta descanse en una estimacion sin validar, y "abierto" cuando la respuesta honesta sea que todavia no se sabe. Los bloques sin hueco van sin flag.
El comunicado cabe en una pagina: entre 6 y 8 bloques. El FAQ externo lleva de 4 a 6 preguntas. El FAQ interno lleva de 7 a 10, e incluye siempre metrica de exito, economia, que se rompe al escalar, riesgo de adopcion, alternativas descartadas y que hay que decidir hoy.
Los identificadores deben ser unicos y con el prefijo de su seccion.`;

async function anthropic(system, messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY en Vercel.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, system, messages })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Error de la API de Anthropic.');
  return data.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
}

function parseJson(texto) {
  const limpio = texto.replace(/```json|```/g, '').trim();
  const a = limpio.indexOf('{'), b = limpio.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('El facilitador no devolvio un JSON legible.');
  return JSON.parse(limpio.slice(a, b + 1));
}

// Guarda las notas propuestas, sin repetir las que ya existen.
async function guardarNotas(initiativeId, notas) {
  if (!Array.isArray(notas) || !notas.length) return;
  const previas = await db.select('initiative_notes', `initiative_id=eq.${initiativeId}&select=text`);
  const vistas = new Set(previas.map(n => n.text.trim().toLowerCase()));
  const nuevas = notas
    .filter(n => n && n.text && ['contexto', 'decision', 'pendiente'].includes(n.kind))
    .filter(n => !vistas.has(n.text.trim().toLowerCase()))
    .slice(0, 2)
    .map(n => ({ initiative_id: initiativeId, kind: n.kind, text: n.text.trim().slice(0, 400), source: 'facilitador' }));
  if (nuevas.length) await db.insert('initiative_notes', nuevas);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });
  try {
    const ownerId = await requireOwner(req);
    const { mode, initiativeId, message, questionNo } = readBody(req);

    const ini = (await db.select('initiatives', `id=eq.${initiativeId}&owner_id=eq.${ownerId}&select=*`))[0];
    if (!ini) throw new Error('Iniciativa no encontrada.');

    // ---------------- Facilitacion de una de las 5 preguntas ----------------
    if (mode === 'facilitate') {
      const mem = await memoria(initiativeId);
      const historial = await db.select(
        'facilitator_messages',
        `initiative_id=eq.${initiativeId}&question_no=eq.${questionNo}&select=role,content&order=id.asc`
      );
      const intentos = historial.filter(m => m.role === 'assistant').length;
      const messages = historial.map(m => ({ role: m.role, content: m.content }));

      if (message) {
        messages.push({ role: 'user', content: message });
        await db.insert('facilitator_messages', {
          initiative_id: initiativeId, question_no: questionNo, role: 'user', content: message
        });
      } else if (!messages.length) {
        messages.push({ role: 'user', content: 'Empecemos con la pregunta ' + questionNo + '.' });
      }

      const salida = parseJson(await anthropic(sistemaFacilitador(ini, questionNo, intentos, mem), messages));

      await db.insert('facilitator_messages', {
        initiative_id: initiativeId, question_no: questionNo, role: 'assistant', content: salida.reply
      });
      await guardarNotas(initiativeId, salida.notes);

      if (salida.accepted && salida.captured_answer) {
        await db.remove('answers', `initiative_id=eq.${initiativeId}&question_no=eq.${questionNo}`);
        await db.insert('answers', {
          initiative_id: initiativeId, question_no: questionNo,
          answer_text: salida.captured_answer,
          quality: salida.quality === 'weak' ? 'weak' : 'ok'
        });
      }
      return res.status(200).json(salida);
    }

    // ---------------- Conversacion libre sobre la iniciativa ----------------
    if (mode === 'chat') {
      const mem = await memoria(initiativeId);
      const historial = await db.select(
        'facilitator_messages',
        `initiative_id=eq.${initiativeId}&question_no=eq.0&select=role,content&order=id.desc&limit=20`
      );
      const messages = historial.reverse().map(m => ({ role: m.role, content: m.content }));
      messages.push({ role: 'user', content: message });

      await db.insert('facilitator_messages', {
        initiative_id: initiativeId, question_no: 0, role: 'user', content: message
      });

      const salida = parseJson(await anthropic(sistemaChat(ini, mem), messages));

      await db.insert('facilitator_messages', {
        initiative_id: initiativeId, question_no: 0, role: 'assistant', content: salida.reply
      });
      await guardarNotas(initiativeId, salida.notes);
      return res.status(200).json(salida);
    }

    // ---------------- Borrador PR/FAQ ----------------
    if (mode === 'draft') {
      const mem = await memoria(initiativeId);
      if (mem.answers.length < 5) throw new Error('Faltan respuestas. Termina las 5 preguntas primero.');

      const entrada = mem.answers
        .map(a => `${a.question_no}. ${PREGUNTAS[a.question_no - 1]}\n${a.answer_text}${a.quality === 'weak' ? '\n(respuesta marcada como debil por el facilitador)' : ''}`)
        .join('\n\n');

      const salida = parseJson(await anthropic(SISTEMA_BORRADOR, [
        { role: 'user', content: `Iniciativa: ${ini.title}\nEn una frase: ${ini.one_liner}\nEtapa: ${ini.stage}\n${mem.texto}\nRespuestas:\n\n${entrada}` }
      ]));

      const blocks = (salida.blocks || []).map(b => ({
        flag: null, status: b.flag ? 'open' : null, evidence: null, ...b
      }));

      const previas = await db.select('documents', `initiative_id=eq.${initiativeId}&select=version&order=version.desc&limit=1`);
      const version = previas.length ? previas[0].version + 1 : 1;

      const doc = await db.insert('documents', { initiative_id: initiativeId, version, blocks });
      await db.update('initiatives', `id=eq.${initiativeId}`, { status: 'borrador' });
      return res.status(200).json({ document: doc[0] });
    }

    throw new Error('Modo no reconocido.');
  } catch (e) {
    fail(res, e);
  }
};

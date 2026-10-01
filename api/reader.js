// Lector anonimo. Sin correo y sin nombre: solo el codigo de la ronda.
// Aqui vive la regla del ciego: nadie lee anotaciones ajenas mientras la
// ronda este abierta, ni siquiera el autor.

const { db, readBody, fail } = require('./_db');

const ADJ = ['Atento','Sereno','Curioso','Paciente','Agudo','Sobrio','Terco','Lucido','Discreto','Rapido','Frontal','Silencioso'];
const ANIMAL = ['Tejon','Garza','Lince','Cuervo','Zorro','Alce','Tapir','Halcon','Nutria','Bisonte','Coyote','Venado','Jaguar','Buho','Erizo','Mapache'];

async function aliasLibre(roundId) {
  const usados = new Set((await db.select('participants', `round_id=eq.${roundId}&select=alias`)).map(p => p.alias));
  for (let i = 0; i < 200; i++) {
    const a = `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${ANIMAL[Math.floor(Math.random() * ANIMAL.length)]}`;
    if (!usados.has(a)) return a;
  }
  return `Lector ${usados.size + 1}`;
}

async function rondaPorCodigo(code) {
  const r = await db.select('rounds', `code=eq.${String(code || '').trim().toUpperCase()}&select=*`);
  if (!r.length) throw new Error('Ese codigo no existe. Revisalo con quien te invito.');
  return r[0];
}

async function participante(roundId, token) {
  const p = await db.select('participants', `round_id=eq.${roundId}&token=eq.${token}&select=*`);
  if (!p.length) throw new Error('Tu sesion de lectura ya no es valida. Vuelve a entrar con el codigo.');
  return p[0];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });
  try {
    const { action, code, token, blockId, quote, comment, annotationId } = readBody(req);

    // Entrar a la ronda
    if (action === 'join') {
      const round = await rondaPorCodigo(code);
      const doc = (await db.select('documents', `id=eq.${round.document_id}&select=blocks,version`))[0];

      let p;
      if (token) {
        const previo = await db.select('participants', `round_id=eq.${round.id}&token=eq.${token}&select=*`);
        p = previo[0];
      }
      if (!p) {
        p = (await db.insert('participants', { round_id: round.id, alias: await aliasLibre(round.id) }))[0];
      }

      const mias = await db.select(
        'annotations', `round_id=eq.${round.id}&participant_id=eq.${p.id}&select=*&order=created_at.asc`
      );

      return res.status(200).json({
        round: { id: round.id, code: round.code, label: round.label, minutes: round.minutes, status: round.status },
        blocks: doc ? doc.blocks : [],
        version: doc ? doc.version : 1,
        me: { token: p.token, alias: p.alias, started_at: p.started_at, submitted_at: p.submitted_at },
        annotations: mias
      });
    }

    // Guardar una anotacion
    if (action === 'annotate') {
      const round = await rondaPorCodigo(code);
      if (round.status !== 'abierta') throw new Error('La ronda ya cerro. Ya no se pueden agregar notas.');
      const p = await participante(round.id, token);
      const fin = new Date(p.started_at).getTime() + round.minutes * 60000 + 60000; // un minuto de gracia
      if (Date.now() > fin) throw new Error('Se acabo tu tiempo de lectura.');

      const fila = (await db.insert('annotations', {
        round_id: round.id, participant_id: p.id, block_id: blockId,
        quote: (quote || '').slice(0, 400), comment: (comment || '').slice(0, 2000)
      }))[0];
      return res.status(200).json({ annotation: fila });
    }

    // Borrar una nota propia
    if (action === 'delete') {
      const round = await rondaPorCodigo(code);
      const p = await participante(round.id, token);
      await db.remove('annotations', `id=eq.${annotationId}&participant_id=eq.${p.id}`);
      return res.status(200).json({ ok: true });
    }

    // Terminar de leer
    if (action === 'submit') {
      const round = await rondaPorCodigo(code);
      const p = await participante(round.id, token);
      await db.update('participants', `id=eq.${p.id}`, { submitted_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    // Revelado: solo cuando el autor cerro la ronda
    if (action === 'revealed') {
      const round = await rondaPorCodigo(code);
      if (round.status !== 'cerrada') {
        return res.status(200).json({ revealed: false, annotations: [] });
      }
      const filas = await db.select(
        'annotations', `round_id=eq.${round.id}&select=id,block_id,quote,comment,created_at,participants(alias)&order=created_at.asc`
      );
      return res.status(200).json({
        revealed: true,
        annotations: filas.map(a => ({
          id: a.id, block_id: a.block_id, quote: a.quote, comment: a.comment,
          alias: a.participants ? a.participants.alias : 'Lector'
        }))
      });
    }

    throw new Error('Accion no reconocida.');
  } catch (e) {
    fail(res, e);
  }
};

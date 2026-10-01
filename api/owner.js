// Lado del autor. Mientras la ronda este abierta solo puede ver cuanta
// gente entro y cuanta termino. El contenido de las notas aparece hasta
// que cierra la ronda.

const { db, requireOwner, readBody, fail } = require('./_db');

async function rondaDelAutor(roundId, ownerId) {
  const filas = await db.select(
    'rounds',
    `id=eq.${roundId}&select=*,documents!inner(id,version,blocks,initiatives!inner(id,owner_id,title))`
  );
  const r = filas[0];
  if (!r || r.documents.initiatives.owner_id !== ownerId) throw new Error('Ronda no encontrada.');
  return r;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });
  try {
    const ownerId = await requireOwner(req);
    const { action, roundId } = readBody(req);
    const round = await rondaDelAutor(roundId, ownerId);

    if (action === 'status') {
      const p = await db.select('participants', `round_id=eq.${roundId}&select=submitted_at`);
      return res.status(200).json({
        status: round.status,
        entraron: p.length,
        terminaron: p.filter(x => x.submitted_at).length
      });
    }

    if (action === 'close') {
      await db.update('rounds', `id=eq.${roundId}`, {
        status: 'cerrada', closed_at: new Date().toISOString()
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'review') {
      if (round.status !== 'cerrada') {
        return res.status(200).json({ revealed: false, annotations: [], heat: {} });
      }
      const filas = await db.select(
        'annotations',
        `round_id=eq.${roundId}&select=id,block_id,quote,comment,created_at,participants(alias)&order=block_id.asc,created_at.asc`
      );
      const heat = {};
      filas.forEach(a => { heat[a.block_id] = (heat[a.block_id] || 0) + 1; });

      return res.status(200).json({
        revealed: true,
        blocks: round.documents.blocks,
        version: round.documents.version,
        heat,
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

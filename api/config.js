// Entrega al navegador solo los valores publicos de Supabase.
// Asi no hay llaves escritas dentro del codigo del repositorio.

module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return res.status(500).json({
      error: 'Faltan SUPABASE_URL o SUPABASE_ANON_KEY en Vercel.'
    });
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ supabaseUrl: url, supabaseAnonKey: anon });
};

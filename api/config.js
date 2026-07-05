module.exports = function handler(req, res) {
  const modelName = process.env.MODEL_NAME || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const modelConfigured = Boolean(process.env.MODEL_API_KEY || process.env.OPENAI_API_KEY);

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    modelConfigured,
    modelName
  });
};

const { supabase, supabaseAdmin } = require('../config/supabase');
const dbClient = supabaseAdmin || supabase;

async function registrarAuditoria(req, acao, tabela, detalhes) {
  try {
    const empresa = req.user?.empresa;
    const usuarioId = req.user?.id;

    if (!empresa) return;

    await dbClient.from('audit_logs').insert([{
      empresa,
      usuario_id: usuarioId || null,
      acao,
      tabela,
      detalhes: typeof detalhes === 'object' ? JSON.stringify(detalhes) : String(detalhes || '')
    }]);
  } catch (err) {
    console.error('Erro ao registar log de auditoria:', err);
  }
}

module.exports = { registrarAuditoria };
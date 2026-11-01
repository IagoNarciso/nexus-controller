const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error('⚠️ Atenção: Verifique as variáveis de ambiente do Supabase no ficheiro .env');
}

// Cliente padrão (respeita as políticas de RLS)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente administrativo (Contorna o RLS - Uso estrito no backend para rotas protegidas)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

module.exports = {
  supabase,
  supabaseAdmin
};
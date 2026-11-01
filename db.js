import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => {
  console.log('✅ Conectado com sucesso ao banco de dados Supabase!');
});

pool.on('error', (err) => {
  console.error('❌ Erro de conexão com o Supabase:', err.message);
});
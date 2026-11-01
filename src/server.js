const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Sobe um nível a partir de 'src' para servir os ficheiros estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, '../public')));

// --- ESPIÃO DE ROTAS PARA DIAGNÓSTICO (Com caminhos absolutos seguros para a Vercel) ---
const inspecionarRota = (nomeSubpasta) => {
  try {
    const caminhoCompleto = path.join(__dirname, 'routes', nomeSubpasta);
    const modulo = require(caminhoCompleto);
    console.log(`🕵️ [Espião] Rota '${nomeSubpasta}' carregada com sucesso. Tipo:`, typeof modulo);
    return modulo;
  } catch (err) {
    console.error(`❌ [Espião] Erro crítico ao carregar a rota '${nomeSubpasta}':`, err.message);
    throw err;
  }
};

const authRoutes = inspecionarRota('auth');
const produtosRoutes = inspecionarRota('produtos');
const movimentacoesRoutes = inspecionarRota('movimentacoes');
const solicitacoesRoutes = inspecionarRota('solicitacoes');
const utilizadoresRoutes = inspecionarRota('utilizadores');
const dashboardRoutes = inspecionarRota('dashboard');
const fornecedoresRoutes = inspecionarRota('fornecedores');
const relatoriosRoutes = inspecionarRota('relatorios'); // 👈 Nova rota de relatórios por chat

app.use('/api/auth', authRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/movimentacoes', movimentacoesRoutes);
app.use('/api/solicitacoes', solicitacoesRoutes);
app.use('/api/fornecedores', fornecedoresRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/relatorios', relatoriosRoutes); // 👈 Registo do endpoint do chatbot de relatórios

// Suporte para ambas as variações de endpoint (/api/utilizadores e /api/utilizador)
app.use('/api/utilizadores', utilizadoresRoutes);
app.use('/api/utilizador', utilizadoresRoutes); 

// Rota principal direciona para a tela de login correta (login.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Rotas explícitas para as páginas principais na pasta public
app.get('/produtos.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/produtos.html'));
});

app.get('/movimentacoes.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/movimentacoes.html'));
});

app.get('/relatorios.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/relatorios.html'));
});

// Inicialização local opcional e exportação obrigatória para a Vercel
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor Nexus Controller rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
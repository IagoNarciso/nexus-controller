const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Sobe um nível a partir de 'src' para servir os ficheiros estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, '../public')));

// --- ESPIÃO DE ROTAS PARA DIAGNÓSTICO ---
const inspecionarRota = (nome, caminho) => {
  try {
    const modulo = require(caminho);
    console.log(`🕵️ [Espião] Rota '${nome}' carregada com sucesso. Tipo:`, typeof modulo);
    return modulo;
  } catch (err) {
    console.error(`❌ [Espião] Erro crítico ao carregar a rota '${nome}' do caminho '${caminho}':`, err.message);
    throw err;
  }
};

const authRoutes = inspecionarRota('auth', './routes/auth');
const produtosRoutes = inspecionarRota('produtos', './routes/produtos');
const movimentacoesRoutes = inspecionarRota('movimentacoes', './routes/movimentacoes');
const solicitacoesRoutes = inspecionarRota('solicitacoes', './routes/solicitacoes');
const utilizadoresRoutes = inspecionarRota('utilizadores', './routes/utilizadores');
const dashboardRoutes = inspecionarRota('dashboard', './routes/dashboard');
const fornecedoresRoutes = inspecionarRota('fornecedores', './routes/fornecedores');
const relatoriosRoutes = inspecionarRota('relatorios', './routes/relatorios'); // 👈 Nova rota de relatórios por chat

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Nexus Controller rodando em http://localhost:${PORT}`);
});
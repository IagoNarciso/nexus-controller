const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const auth = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas consultas filtradas por empresa
const dbClient = supabaseAdmin || supabase;

// Função auxiliar segura e resiliente para descobrir a empresa do utilizador autenticado
async function obterEmpresaUsuario(req) {
  if (req.user?.empresa) {
    return req.user.empresa;
  }
  if (req.user?.user_metadata?.empresa) {
    return req.user.user_metadata.empresa;
  }

  const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;
  const usuarioEmail = req.user?.email;

  if (!usuarioId && !usuarioEmail) {
    return null;
  }

  if (usuarioId) {
    const { data: usuarioPorId } = await dbClient
      .from('usuarios')
      .select('empresa')
      .eq('id', usuarioId)
      .maybeSingle();

    if (usuarioPorId && usuarioPorId.empresa) {
      return usuarioPorId.empresa;
    }
  }

  if (usuarioEmail) {
    const { data: usuarioPorEmail } = await dbClient
      .from('usuarios')
      .select('empresa')
      .ilike('email', usuarioEmail.trim())
      .maybeSingle();

    if (usuarioPorEmail && usuarioPorEmail.empresa) {
      return usuarioPorEmail.empresa;
    }
  }

  if (usuarioEmail && usuarioEmail.toLowerCase() === 'admin@nexusdemo.com') {
    return 'Nexus Demo';
  }

  return null;
}

// ROTA: GET /api/dashboard/estatisticas?mes=YYYY-MM&periodo=7
router.get('/estatisticas', auth, async (req, res) => {
  try {
    const empresaUsuario = await obterEmpresaUsuario(req);

    if (!empresaUsuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const dataAtual = new Date();
    const mesParam = req.query.mes; // Ex: '2026-10' ou 'todos'

    // Captura o período do gráfico enviado pelo frontend (padrão para 7 se inválido)
    const periodoParam = parseInt(req.query.periodo || 7, 10);
    const qtdMeses = [1, 3, 7, 12].includes(periodoParam) ? periodoParam : 7;

    let inicioPeriodo = null;
    let fimPeriodo = null;
    let diasDecorridos = dataAtual.getDate() || 1;

    if (mesParam && mesParam !== 'todos') {
      const [ano, mes] = mesParam.split('-').map(Number);

      inicioPeriodo = new Date(ano, mes - 1, 1).toISOString();
      fimPeriodo = new Date(ano, mes, 1).toISOString();

      const mesAtualReal = dataAtual.getFullYear() === ano && (dataAtual.getMonth() + 1) === mes;
      if (!mesAtualReal) {
        diasDecorridos = new Date(ano, mes, 0).getDate();
      }
    }

    let queryMovimentacoes = dbClient
      .from('movimentacoes')
      .select('*')
      .eq('empresa', empresaUsuario);

    if (inicioPeriodo && fimPeriodo) {
      queryMovimentacoes = queryMovimentacoes
        .gte('created_at', inicioPeriodo)
        .lt('created_at', fimPeriodo);
    }

    const [resProdutos, resMovimentacoes, resSolicitacoes, resTodasMovimentacoes] = await Promise.all([
      dbClient
        .from('produtos')
        .select('*')
        .eq('empresa', empresaUsuario)
        .eq('ativo', true)
        .neq('status', 'pendente')
        .neq('status', 'rejeitado'),
      queryMovimentacoes,
      dbClient
        .from('solicitacoes')
        .select('*')
        .eq('empresa', empresaUsuario)
        .eq('status', 'pendente'),
      dbClient
        .from('movimentacoes')
        .select('*')
        .eq('empresa', empresaUsuario)
    ]);

    if (resProdutos.error) throw resProdutos.error;
    if (resMovimentacoes.error) throw resMovimentacoes.error;
    if (resSolicitacoes.error) throw resSolicitacoes.error;
    if (resTodasMovimentacoes.error) throw resTodasMovimentacoes.error;

    const produtosBrutos = resProdutos.data || [];
    const produtos = produtosBrutos.filter(p => p.status !== 'pendente' && p.status !== 'rejeitado');

    const movimentacoes = resMovimentacoes.data || [];
    const solicitacoes = resSolicitacoes.data || [];
    const todasMovimentacoes = resTodasMovimentacoes.data || [];

    let totalEstoque = 0;
    let qtdEstoqueBaixo = 0;
    let valorTotalEstoque = 0;
    const categoriasMap = {};
    const mapaNomesProdutos = {};

    produtos.forEach(p => {
      mapaNomesProdutos[p.id] = p.nome;
      const qtd = p.estoque ?? p.quantidade ?? 0;
      const min = p.quantidade_minima ?? 12;
      const preco = parseFloat(p.preco_venda || p.preco || 0);

      totalEstoque += qtd;
      valorTotalEstoque += (qtd * preco);
      
      if (qtd <= min) qtdEstoqueBaixo++;

      const cat = p.categoria || 'Geral';
      if (!categoriasMap[cat]) categoriasMap[cat] = 0;
      categoriasMap[cat] += (qtd * preco);
    });

    const itensZerados = produtos.filter(p => (p.estoque ?? p.quantidade ?? 0) <= 0).length;
    const itensSaudaveis = produtos.length - qtdEstoqueBaixo;
    const itensAlertaComEstoque = Math.max(0, qtdEstoqueBaixo - itensZerados);

    const saudeEstoque = produtos.length > 0 
      ? Math.round(((itensSaudaveis * 1) + (itensAlertaComEstoque * 0.5)) / produtos.length * 100) 
      : 0;

    const taxaRuptura = produtos.length > 0 ? ((itensZerados / produtos.length) * 100).toFixed(1) : 0;

    let totalVendasMes = 0;
    let totalGastosMes = 0;
    let totalUnidadesVendidas = 0;
    const vendasPorProduto = {};

    movimentacoes.forEach(m => {
      const tipoOperacao = (m.tipo || '').toLowerCase();
      const quantidadeOperacao = parseInt(m.quantidade || 0);
      const valorUnitario = parseFloat(m.valor_unitario || 0);
      const valorDaOperacao = valorUnitario * quantidadeOperacao;

      if (tipoOperacao === 'venda' || tipoOperacao === 'saida') {
        totalVendasMes += valorDaOperacao;
        totalUnidadesVendidas += quantidadeOperacao;

        if (m.produto_id) {
          vendasPorProduto[m.produto_id] = (vendasPorProduto[m.produto_id] || 0) + quantidadeOperacao;
        }
      } 
      else if (tipoOperacao === 'compra' || tipoOperacao === 'entrada') {
        totalGastosMes += valorDaOperacao;
      } 
      else if (tipoOperacao === 'retirada') {
        totalUnidadesVendidas += quantidadeOperacao; 
      }
    });

    const giroEstoque = totalEstoque > 0 ? (totalUnidadesVendidas / totalEstoque).toFixed(1) : 0;
    const vendasPorDia = totalUnidadesVendidas / diasDecorridos; 
    const coberturaMedia = vendasPorDia > 0 ? Math.round(totalEstoque / vendasPorDia) : 0;

    const mesesLabels = [];
    const entradasValores = [];
    const saidasValores = [];

    // Geração dinâmica dos meses com base no período selecionado (1, 3, 7 ou 12 meses)
    const anoAtualBase = dataAtual.getFullYear();
    const mesAtualBase = dataAtual.getMonth();

    for (let i = qtdMeses - 1; i >= 0; i--) {
      const d = new Date(anoAtualBase, mesAtualBase - i, 1);
      const anoM = d.getFullYear();
      const mesM = d.getMonth() + 1;
      
      const nomeMesStr = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      mesesLabels.push(nomeMesStr.charAt(0).toUpperCase() + nomeMesStr.slice(1));

      let entMes = 0;
      let saiMes = 0;

      todasMovimentacoes.forEach(m => {
        const dataMov = new Date(m.created_at);
        if (dataMov.getFullYear() === anoM && (dataMov.getMonth() + 1) === mesM) {
          const t = (m.tipo || '').toLowerCase();
          const qtd = parseInt(m.quantidade || 0);
          if (t === 'compra' || t === 'entrada') entMes += qtd;
          if (t === 'venda' || t === 'saida' || t === 'retirada') saiMes += qtd;
        }
      });

      entradasValores.push(entMes);
      saidasValores.push(saiMes);
    }

    // Retorna a chave dinâmica correspondente ao período solicitado pelo frontend
    const movimentacaoReal = {
      [qtdMeses]: {
        labels: mesesLabels,
        entradas: entradasValores,
        saidas: saidasValores
      }
    };

    const categoriasLabels = Object.keys(categoriasMap);
    const categoriasValues = Object.values(categoriasMap);
    
    const categoriasFormatadas = categoriasLabels.map((nome, i) => ({
      nome,
      valor: categoriasValues[i],
      percentual: valorTotalEstoque > 0 ? Math.round((categoriasValues[i] / valorTotalEstoque) * 100) : 0
    })).sort((a, b) => b.percentual - a.percentual);

    const maisCaros = [...produtos]
      .sort((a, b) => parseFloat(b.preco_venda || b.preco || 0) - parseFloat(a.preco_venda || a.preco || 0))
      .slice(0, 5);

    const maisVendidos = Object.entries(vendasPorProduto)
      .map(([produtoId, totalVendido]) => ({
        nome: mapaNomesProdutos[produtoId] || 'Produto removido',
        totalVendido
      }))
      .sort((a, b) => b.totalVendido - a.totalVendido)
      .slice(0, 3);

    return res.json({
      empresa: empresaUsuario,
      totalProdutos: produtos.length,
      itensSaudaveis,
      itensZerados,
      totalSaidasMes: totalUnidadesVendidas,
      totalVendasMes,
      totalGastosMes,
      qtdEstoqueBaixo,
      pedidosPendentes: solicitacoes.length,
      giroEstoque,
      coberturaMedia,
      saudeEstoque,
      taxaRuptura,
      valorTotalEstoque,
      movimentacao: movimentacaoReal,
      categorias: {
        labels: categoriasFormatadas.map(c => c.nome),
        values: categoriasFormatadas.map(c => c.valor),
        percentuais: categoriasFormatadas.slice(0, 3) 
      },
      maisCaros,
      maisVendidos
    });

  } catch (error) {
    console.error('Erro na rota do dashboard:', error);
    return res.status(500).json({ error: 'Erro interno ao carregar estatísticas.' });
  }
});

module.exports = router;
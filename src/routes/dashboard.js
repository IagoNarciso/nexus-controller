const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const auth = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas consultas filtradas por empresa
const dbClient = supabaseAdmin || supabase;

// Helper para extrair o preço de custo/aquisição do produto
function obterPrecoCustoProduto(p) {
  if (!p) return 0;
  const possiveisCustos = [
    p.preco_custo,
    p.custo,
    p.preco_compra,
    p.valor_custo,
    p.valor_compra,
    p.custo_unitario
  ];

  for (const val of possiveisCustos) {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) return num;
  }

  return parseFloat(p.preco_venda || p.preco || 0);
}

// ROTA: GET /api/dashboard/estatisticas?mes=YYYY-MM&periodo=7
router.get('/estatisticas', auth, async (req, res) => {
  try {
    const empresaUsuario = req.user?.empresa;

    if (!empresaUsuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const dataAtual = new Date();
    const mesParam = req.query.mes; // Ex: '2026-11' ou 'todos'

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

    const dataLimiteGrafico = new Date(dataAtual.getFullYear(), dataAtual.getMonth() - qtdMeses + 1, 1).toISOString();

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
        .gte('created_at', dataLimiteGrafico)
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
    const mapaProdutosPorId = {};
    const mapaProdutosPorNome = {};

    produtos.forEach(p => {
      mapaNomesProdutos[p.id] = p.nome;
      mapaProdutosPorId[String(p.id)] = p;
      if (p.nome) {
        mapaProdutosPorNome[p.nome.trim().toLowerCase()] = p;
      }

      const qtd = Number(p.estoque ?? p.quantidade ?? 0);
      const min = Number(p.quantidade_minima ?? 12);
      const precoVenda = parseFloat(p.preco_venda || p.preco || 0);

      totalEstoque += qtd;
      valorTotalEstoque += (qtd * precoVenda);
      
      if (qtd <= min) qtdEstoqueBaixo++;

      const cat = p.categoria || 'Geral';
      if (!categoriasMap[cat]) categoriasMap[cat] = 0;
      categoriasMap[cat] += (qtd * precoVenda);
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

    const entradasPorProdutoHistorico = {};
    const saidasPorProdutoHistorico = {};

    todasMovimentacoes.forEach(m => {
      const prodId = m.produto_id ? String(m.produto_id) : null;
      const tipo = (m.tipo || '').toLowerCase();
      const qtd = parseInt(m.quantidade || 0, 10);
      if (!prodId || qtd <= 0) return;

      if (tipo === 'compra' || tipo === 'entrada') {
        entradasPorProdutoHistorico[prodId] = (entradasPorProdutoHistorico[prodId] || 0) + qtd;
      } else if (tipo === 'venda' || tipo === 'saida' || tipo === 'retirada') {
        saidasPorProdutoHistorico[prodId] = (saidasPorProdutoHistorico[prodId] || 0) + qtd;
      }
    });

    movimentacoes.forEach(m => {
      const tipoOperacao = (m.tipo || '').toLowerCase();
      const quantidadeOperacao = parseInt(m.quantidade || 0, 10);
      const valorUnitarioMov = parseFloat(m.valor_unitario || 0);

      const prodAssociado =
        (m.produto_id && mapaProdutosPorId[String(m.produto_id)]) ||
        (m.produto_nome && mapaProdutosPorNome[String(m.produto_nome).trim().toLowerCase()]) ||
        (m.nome_produto && mapaProdutosPorNome[String(m.nome_produto).trim().toLowerCase()]) ||
        null;

      if (tipoOperacao === 'venda' || tipoOperacao === 'saida') {
        const precoVendaUnit = valorUnitarioMov > 0
          ? valorUnitarioMov
          : parseFloat(prodAssociado?.preco_venda || prodAssociado?.preco || 0);

        totalVendasMes += (precoVendaUnit * quantidadeOperacao);
        totalUnidadesVendidas += quantidadeOperacao;

        if (m.produto_id) {
          vendasPorProduto[m.produto_id] = (vendasPorProduto[m.produto_id] || 0) + quantidadeOperacao;
        }
      } 
      else if (tipoOperacao === 'compra' || tipoOperacao === 'entrada') {
        const custoNoMovimento = parseFloat(m.preco_custo ?? m.custo ?? m.valor_custo ?? 0);
        const custoNoProduto = obterPrecoCustoProduto(prodAssociado);

        const custoUnitarioReal = custoNoMovimento > 0
          ? custoNoMovimento
          : (custoNoProduto > 0 ? custoNoProduto : valorUnitarioMov);

        totalGastosMes += (custoUnitarioReal * quantidadeOperacao);
      } 
      else if (tipoOperacao === 'retirada') {
        totalUnidadesVendidas += quantidadeOperacao; 
      }
    });

    produtos.forEach(p => {
      const prodId = String(p.id);
      const qtdAtual = Number(p.estoque ?? p.quantidade ?? 0);
      const entHist = entradasPorProdutoHistorico[prodId] || 0;
      const saiHist = saidasPorProdutoHistorico[prodId] || 0;

      const estoqueInicialDireto = Math.max(0, qtdAtual + saiHist - entHist);

      if (estoqueInicialDireto > 0) {
        const dataCriacaoStr = p.data_cadastro || p.created_at;
        let pertenceAoPeriodo = true;

        if (inicioPeriodo && fimPeriodo && dataCriacaoStr) {
          const dataCriacaoISO = new Date(dataCriacaoStr).toISOString();
          pertenceAoPeriodo = dataCriacaoISO >= inicioPeriodo && dataCriacaoISO < fimPeriodo;
        }

        if (pertenceAoPeriodo) {
          const custoUnitario = obterPrecoCustoProduto(p);
          totalGastosMes += (estoqueInicialDireto * custoUnitario);
        }
      }
    });

    const giroEstoque = totalEstoque > 0 ? (totalUnidadesVendidas / totalEstoque).toFixed(1) : 0;
    const vendasPorDia = totalUnidadesVendidas / diasDecorridos; 
    const coberturaMedia = vendasPorDia > 0 ? Math.round(totalEstoque / vendasPorDia) : 0;

    const mesesLabels = [];
    const entradasValores = [];
    const saidasValores = [];

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
          const qtd = parseInt(m.quantidade || 0, 10);
          if (t === 'compra' || t === 'entrada') entMes += qtd;
          if (t === 'venda' || t === 'saida' || t === 'retirada') saiMes += qtd;
        }
      });

      entradasValores.push(entMes);
      saidasValores.push(saiMes);
    }

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
      cobertruraMedia: coberturaMedia,
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
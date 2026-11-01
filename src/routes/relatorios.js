const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const autenticarToken = require('../middlewares/auth');
const PDFDocument = require('pdfkit');

// Rota de Chat / Consultas Inteligentes para Relatórios
router.post('/chat-analise', autenticarToken, async (req, res) => {
  const { mensagem } = req.body;
  const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;

  if (!mensagem || !mensagem.trim()) {
    return res.status(400).json({ resposta: 'Por favor, digite uma pergunta ou comando para análise.' });
  }

  try {
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('empresa')
      .eq('id', usuarioId)
      .maybeSingle();

    const empresaNome = usuario?.empresa || 'Nexus Controller';
    const textoQuery = mensagem.toLowerCase();

    if (textoQuery.includes('estoque baixo') || textoQuery.includes('critico') || textoQuery.includes('crítico')) {
      const { data: produtos, error } = await supabaseAdmin
        .from('produtos')
        .select('*')
        .eq('empresa', empresaNome);

      if (error) throw error;

      const criticos = produtos.filter(p => p.estoque <= (p.quantidade_minima || 12));

      if (criticos.length === 0) {
        return res.json({ resposta: 'Excelente notícia! Atualmente não existem produtos com estoque crítico na empresa.' });
      }

      let respostaHtml = `📊 **Encontrei ${criticos.length} produto(s) com estoque crítico:**\n\n`;
      criticos.forEach(p => {
        respostaHtml += `• **${p.nome}** (SKU: ${p.sku || 'N/D'}): **${p.estoque} unidades** em estoque (Mínimo: ${p.quantidade_minima || 12})\n`;
      });

      return res.json({ resposta: respostaHtml });
    }

    if (textoQuery.includes('movimentacao') || textoQuery.includes('movimentações') || textoQuery.includes('historico') || textoQuery.includes('histórico')) {
      const { data: movimentacoes, error } = await supabaseAdmin
        .from('movimentacoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      if (!movimentacoes || movimentacoes.length === 0) {
        return res.json({ resposta: 'Ainda não existem registos de movimentações no sistema.' });
      }

      let respostaHtml = `📋 **Aqui estão as 5 movimentações mais recentes:**\n\n`;
      movimentacoes.forEach(m => {
        const tipoFormatado = (m.tipo || '').toUpperCase();
        respostaHtml += `• [${tipoFormatado}] **${m.produto_nome || 'Produto'}** — Qtd: **${m.quantidade}** (${new Date(m.created_at).toLocaleDateString('pt-BR')})\n`;
      });

      return res.json({ resposta: respostaHtml });
    }

    if (textoQuery.includes('resumo') || textoQuery.includes('geral') || textoQuery.includes('total') || textoQuery.includes('balanço') || textoQuery.includes('relatório')) {
      const { data: produtos } = await supabaseAdmin
        .from('produtos')
        .select('estoque, preco_venda')
        .eq('empresa', empresaNome);

      const totalProdutos = produtos?.length || 0;
      const estoqueTotal = produtos?.reduce((acc, p) => acc + (p.estoque || 0), 0) || 0;
      const valorTotalEstoque = produtos?.reduce((acc, p) => acc + ((p.estoque || 0) * (p.preco_venda || 0)), 0) || 0;

      let respostaHtml = `📈 **Resumo Geral do Inventário (${empresaNome}):**\n\n` +
        `• Total de Itens Cadastrados: **${totalProdutos}**\n` +
        `• Estoque Total Físico: **${estoqueTotal} unidades**\n` +
        `• Valor Estimado em Estoque: **R$ ${valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**\n\n` +
        `📥 *Pode descarregar o relatório completo em PDF clicando no botão abaixo.*`;

      return res.json({ 
        resposta: respostaHtml, 
        permitirPdf: true 
      });
    }

    return res.json({ 
      resposta: `Olá, Boss! Compreendi a sua pergunta, mas para relatórios precisos tente usar comandos como:\n` +
        `1. *"Quais produtos estão com estoque crítico?"*\n` +
        `2. *"Mostrar movimentações recentes"*\n` +
        `3. *"Resumo geral do inventário"*` 
    });

  } catch (err) {
    console.error('Erro no chatbot de relatórios:', err);
    return res.status(500).json({ resposta: 'Ocorreu um erro ao processar a consulta analítica no banco de dados.' });
  }
});

// Rota para Gerar e Descarregar o Relatório em PDF (Com Logótipo Vetorial e Resumo Executivo)
router.get('/exportar-pdf', autenticarToken, async (req, res) => {
  const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;

  try {
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('empresa')
      .eq('id', usuarioId)
      .maybeSingle();

    const empresaNome = usuario?.empresa || 'Nexus Controller';

    // 1. Busca produtos
    const { data: produtos } = await supabaseAdmin
      .from('produtos')
      .select('*')
      .eq('empresa', empresaNome);

    // 2. Busca movimentações para totalizar entradas e saídas
    const { data: movimentacoes } = await supabaseAdmin
      .from('movimentacoes')
      .select('*');

    // Cálculos estatísticos globais
    const totalProdutos = produtos?.length || 0;
    const estoqueTotalFisico = produtos?.reduce((acc, p) => acc + (p.estoque || 0), 0) || 0;
    const valorTotalInventario = produtos?.reduce((acc, p) => acc + ((p.estoque || 0) * (p.preco_venda || 0)), 0) || 0;
    
    let totalEntradas = 0;
    let totalSaidas = 0;
    if (movimentacoes) {
      movimentacoes.forEach(m => {
        const tipo = (m.tipo || '').toLowerCase();
        if (tipo === 'entrada') totalEntradas += (m.quantidade || 0);
        if (tipo === 'saida' || tipo === 'saída') totalSaidas += (m.quantidade || 0);
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Relatorio_Gerencial_Inventario_${Date.now()}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // --- CABEÇALHO COM LOGÓTIPO VETORIAL ---
    const startY = doc.y;

    // Desenha o Cubo Conectado no canto superior direito (Centro: X=515, Y=startY+18)
    const cx = 515;
    const cy = startY + 18;
    const r = 18;
    const dx = r * 0.866; // ~15.6
    const dy = r * 0.5;   // 9

    doc.save();
    doc.lineWidth(2).strokeColor('#0F392B').lineJoin('round').lineCap('round');
    
    // Hexágono externo do cubo
    doc.polygon(
      [cx, cy - r],
      [cx + dx, cy - dy],
      [cx + dx, cy + dy],
      [cx, cy + r],
      [cx - dx, cy + dy],
      [cx - dx, cy - dy]
    ).stroke();

    // Arestas internas (Eixo Y)
    doc.moveTo(cx - dx, cy - dy).lineTo(cx, cy).lineTo(cx + dx, cy - dy).stroke();
    doc.moveTo(cx, cy).lineTo(cx, cy + r).stroke();

    // Nó central (Nexus) em verde esmeralda
    doc.circle(cx, cy, 3.2).fill('#10B981');
    doc.restore();

    // Textos do Cabeçalho (Alinhados à esquerda)
    doc.fontSize(20).fillColor('#0F392B').font('Helvetica-Bold').text('Nexus Controller', 50, startY, { align: 'left' });
    doc.fontSize(10).fillColor('#4B5563').font('Helvetica').text(`Relatório Analítico Completo de Inventário — ${empresaNome}`, { align: 'left' });
    doc.fontSize(8).fillColor('#9CA3AF').text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, { align: 'left' });
    doc.moveDown(1);

    // Linha divisória superior
    doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // --- RESUMO EXECUTIVO ---
    doc.fontSize(12).fillColor('#1F2937').font('Helvetica-Bold').text('Resumo Executivo & Consolidado');
    doc.moveDown(0.5);

    doc.fontSize(9).font('Helvetica').fillColor('#374151');
    doc.text(`• Total de Produtos Cadastrados: ${totalProdutos}`);
    doc.text(`• Estoque Físico Total: ${estoqueTotalFisico} unidades`);
    doc.text(`• Valor Total do Inventário (Venda): R$ ${valorTotalInventario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    doc.text(`• Total de Entradas Registradas: ${totalEntradas} un.  |  Total de Saídas Registradas: ${totalSaidas} un.`);
    doc.moveDown(1.5);

    // --- LISTAGEM DETALHADA POR PRODUTO ---
    doc.fontSize(12).fillColor('#1F2937').font('Helvetica-Bold').text('Detalhamento de Produtos, Valores e Custos');
    doc.moveDown(1);

    if (produtos && produtos.length > 0) {
      produtos.forEach((p, index) => {
        const isCritico = p.estoque <= (p.quantidade_minima || 12);
        const statusTexto = isCritico ? ' [CRÍTICO]' : ' [OK]';
        const precoVenda = p.preco_venda || 0;
        const precoCusto = p.preco_custo || 0;
        const valorTotalItem = (p.estoque || 0) * precoVenda;

        // Nome do produto e SKU
        doc.fontSize(9).fillColor('#111827').font('Helvetica-Bold').text(`${index + 1}. ${p.nome}`, { continued: true });
        doc.font('Helvetica').fillColor('#4B5563').text(` (SKU: ${p.sku || 'N/D'})`, { continued: false });
        
        // Detalhes de estoque, custos e valores
        doc.text(`    Estoque: ${p.estoque} un. (Mín: ${p.quantidade_minima || 12}) | Custo: R$ ${precoCusto.toFixed(2)} | Venda: R$ ${precoVenda.toFixed(2)}`, { continued: false });
        doc.text(`    Valor Total do Item: R$ ${valorTotalItem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — Estado: `, { continued: true });

        // Status colorido
        doc.font('Helvetica-Bold').fillColor(isCritico ? '#DC2626' : '#059669').text(statusTexto);
        doc.moveDown(0.6);
      });
    } else {
      doc.fontSize(9).fillColor('#6B7280').font('Helvetica').text('Nenhum produto registado no sistema.');
    }

    doc.moveDown(2);
    doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // --- RODAPÉ ---
    doc.fontSize(8).fillColor('#9CA3AF').font('Helvetica-Oblique').text('Gerado automaticamente pelo Nexus Analyst Bot', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    return res.status(500).json({ error: 'Erro ao gerar o documento PDF.' });
  }
});

module.exports = router;
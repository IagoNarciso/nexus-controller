const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas operações do backend
const dbClient = supabaseAdmin || supabase;

// Proteger todas as rotas de produtos
router.use(authMiddleware);

// Helper para gerar SKU automático baseado na categoria
function gerarSKU(categoria) {
  const prefixo = (categoria && categoria.trim().length >= 3)
    ? categoria.trim().substring(0, 3).toUpperCase()
    : 'PROD';
  const numeroAleatorio = Math.floor(10000 + Math.random() * 90000);
  return `${prefixo}-${numeroAleatorio}`;
}

// Helper para extrair o preço de custo real do produto
function obterCustoUnitario(produto) {
  if (!produto) return 0;
  const custo = parseFloat(
    produto.preco_custo ??
    produto.custo ??
    produto.preco_compra ??
    produto.valor_custo ??
    0
  );
  if (!isNaN(custo) && custo > 0) {
    return custo;
  }
  return parseFloat(produto.preco_venda || produto.preco || 0);
}

// 1. GET /api/produtos - Listar produtos da empresa do utilizador logado
router.get('/', async (req, res) => {
  try {
    const empresa = req.user?.empresa;
    if (!empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .select('*')
      .eq('empresa', empresa) // <-- ISOLAMENTO MULTI-EMPRESA
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro ao buscar produtos:', err);
    return res.status(500).json({ error: 'Erro ao carregar produtos do banco de dados.' });
  }
});

// 1.1. GET /api/produtos/pendentes - Listar produtos que aguardam moderação
router.get('/pendentes', async (req, res) => {
  try {
    const empresa = req.user?.empresa;
    if (!empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .select('*')
      .eq('empresa', empresa)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro ao carregar produtos pendentes:', err);
    return res.status(500).json({ error: 'Erro ao carregar produtos pendentes.' });
  }
});

// 1.2. GET /api/produtos/estoque-baixo - Listar produtos com estoque crítico (<= 12)
router.get('/estoque-baixo', async (req, res) => {
  try {
    const empresa = req.user?.empresa;
    if (!empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .select('*')
      .eq('empresa', empresa)
      .lte('estoque', 12)
      .order('estoque', { ascending: true });

    if (error) throw error;

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro ao buscar estoque baixo:', err);
    return res.status(500).json({ error: 'Erro ao carregar produtos com estoque baixo.' });
  }
});

// 2. POST /api/produtos - Criar novo produto vinculado à empresa
router.post('/', async (req, res) => {
  const { 
    nome, 
    sku, 
    categoria, 
    preco_venda, 
    estoque, 
    preco_custo,
    custo,
    quantidade_minima, 
    fornecedor 
  } = req.body;

  if (!nome || preco_venda === undefined) {
    return res.status(400).json({ error: 'Campos obrigatórios: Nome e Preço de Venda.' });
  }

  const skuFinal = (sku && sku.trim() !== '') ? sku.trim() : gerarSKU(categoria);
  const precoCustoFinal = parseFloat(preco_custo ?? custo ?? 0) || 0;
  const precoVendaFinal = parseFloat(preco_venda) || 0;
  const estoqueFinal = parseInt(estoque, 10) || 0;
  const qtdMinimaFinal = parseInt(quantidade_minima, 10) || 12;

  try {
    const usuario = req.user;
    if (!usuario || !usuario.empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const novoProdutoPayload = {
      nome: nome.trim(),
      sku: skuFinal,
      categoria: categoria || 'Geral',
      preco_venda: precoVendaFinal,
      estoque: estoqueFinal,
      preco_custo: precoCustoFinal,
      quantidade_minima: qtdMinimaFinal,
      fornecedor: fornecedor ? fornecedor.trim() : null,
      usuario_id: usuario.id,
      empresa: usuario.empresa,
      cnpj: usuario.cnpj || null,
      ativo: true,
      status: 'pendente' 
    };

    const { data, error } = await dbClient
      .from('produtos')
      .insert([novoProdutoPayload])
      .select();

    if (error) throw error;

    return res.status(201).json({
      ...data[0],
      preco_custo: data[0]?.preco_custo ?? precoCustoFinal
    });
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar produto no banco de dados.' });
  }
});

// 3. PUT /api/produtos/:id - Editar produto existente
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    nome, 
    sku, 
    categoria, 
    preco_venda, 
    estoque, 
    ativo, 
    preco_custo,
    custo,
    quantidade_minima, 
    fornecedor 
  } = req.body;

  try {
    const empresa = req.user?.empresa;
    if (!empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const updatePayload = {};
    if (nome !== undefined) updatePayload.nome = nome.trim();
    if (sku !== undefined) updatePayload.sku = sku;
    if (categoria !== undefined) updatePayload.categoria = categoria;
    if (preco_venda !== undefined) updatePayload.preco_venda = parseFloat(preco_venda);
    if (estoque !== undefined) updatePayload.estoque = parseInt(estoque, 10);
    if (ativo !== undefined) updatePayload.ativo = ativo;
    if (preco_custo !== undefined || custo !== undefined) {
      updatePayload.preco_custo = parseFloat(preco_custo ?? custo) || 0;
    }
    if (quantidade_minima !== undefined) updatePayload.quantidade_minima = parseInt(quantidade_minima, 10) || 12;
    if (fornecedor !== undefined) updatePayload.fornecedor = fornecedor ? fornecedor.trim() : null;
    
    updatePayload.ultima_atualizacao = new Date().toISOString();

    const { data, error } = await dbClient
      .from('produtos')
      .update(updatePayload)
      .eq('id', id)
      .eq('empresa', empresa)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado na sua empresa ou não autorizado.' });
    }

    const produtoEditado = data[0];

    if (updatePayload.preco_custo !== undefined && updatePayload.preco_custo > 0) {
      await dbClient
        .from('movimentacoes')
        .update({ valor_unitario: updatePayload.preco_custo })
        .eq('produto_id', id)
        .eq('empresa', empresa)
        .in('tipo', ['compra', 'entrada']);
    }

    return res.status(200).json(produtoEditado);
  } catch (err) {
    console.error('Erro ao atualizar produto:', err);
    return res.status(500).json({ error: 'Erro ao atualizar produto no banco de dados.' });
  }
});

// 4. PATCH /api/produtos/:id/status - Aprovar ou Rejeitar produto
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['aprovado', 'rejeitado'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido. Utilize "aprovado" ou "rejeitado".' });
  }

  try {
    const usuario = req.user;
    if (!usuario || !usuario.empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .update({ status, ultima_atualizacao: new Date().toISOString() })
      .eq('id', id)
      .eq('empresa', usuario.empresa)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado na sua empresa ou não autorizado.' });
    }

    const produtoAtualizado = data[0];

    if (status === 'aprovado') {
      const quantidadeEstoque = parseInt(produtoAtualizado.estoque || produtoAtualizado.quantidade || 0, 10);
      const custoUnitarioCompra = obterCustoUnitario(produtoAtualizado);

      if (quantidadeEstoque > 0 && custoUnitarioCompra > 0) {
        const { error: erroMov } = await dbClient
          .from('movimentacoes')
          .insert([
            {
              usuario_id: usuario.id,
              empresa: usuario.empresa,
              produto_id: produtoAtualizado.id,
              tipo: 'compra',
              quantidade: quantidadeEstoque,
              valor_unitario: custoUnitarioCompra,
              observacao: `Aprovação automática de entrada do produto: ${produtoAtualizado.nome}`,
              lida: false
            }
          ]);

        if (erroMov) {
          console.error('Erro ao gerar movimentação financeira na aprovação:', erroMov);
        }
      }
    }

    return res.status(200).json({ message: `Produto ${status} com sucesso!`, produto: produtoAtualizado });
  } catch (err) {
    console.error('Erro ao atualizar status do produto:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status no banco de dados.' });
  }
});

// 5. PATCH /api/produtos/:id/ativo - Alternar ativo/inativo
router.patch('/:id/ativo', async (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;

  try {
    const empresa = req.user?.empresa;
    if (!empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .update({ ativo, ultima_atualizacao: new Date().toISOString() })
      .eq('id', id)
      .eq('empresa', empresa)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado na sua empresa ou não autorizado.' });
    }

    return res.status(200).json({ message: 'Status alterado com sucesso!', produto: data[0] });
  } catch (err) {
    console.error('Erro ao alterar status:', err);
    return res.status(500).json({ error: 'Erro ao alterar status no banco de dados.' });
  }
});

// 6. DELETE /api/produtos/:id - Remover produto
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const empresa = req.user?.empresa;
    if (!empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .delete()
      .eq('id', id)
      .eq('empresa', empresa)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado na sua empresa ou não autorizado.' });
    }

    return res.status(200).json({ message: 'Produto removido com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir produto:', err);
    return res.status(500).json({ error: 'Erro ao excluir produto no banco de dados.' });
  }
});

module.exports = router;
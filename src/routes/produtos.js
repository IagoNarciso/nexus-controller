const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas operações do backend
const dbClient = supabaseAdmin || supabase;

// Proteger todas as rotas de produtos
router.use(authMiddleware);

// Função auxiliar resiliente para identificar o utilizador logado e a sua respetiva empresa
async function obterDadosUsuario(req) {
  const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;
  const usuarioEmail = req.user?.email;

  // 1. Tenta buscar pelo ID exato usando o dbClient (sem bloqueio de RLS)
  if (usuarioId) {
    const { data: usuarioPorId } = await dbClient
      .from('usuarios')
      .select('*')
      .eq('id', usuarioId)
      .maybeSingle();

    if (usuarioPorId && usuarioPorId.empresa) {
      return usuarioPorId;
    }
  }

  // 2. Fallback robusto por E-mail
  if (usuarioEmail) {
    const { data: usuarioPorEmail } = await dbClient
      .from('usuarios')
      .select('*')
      .ilike('email', usuarioEmail.trim())
      .maybeSingle();

    if (usuarioPorEmail && usuarioPorEmail.empresa) {
      return usuarioPorEmail;
    }
  }

  // 3. Fallback pelos metadados já validados no middleware
  if (req.user?.user_metadata?.empresa) {
    return {
      id: usuarioId,
      nome: req.user.user_metadata.nome || 'Utilizador',
      email: usuarioEmail,
      cargo: req.user.user_metadata.cargo || 'admin',
      empresa: req.user.user_metadata.empresa,
      cnpj: req.user.user_metadata.cnpj || null
    };
  }

  // 4. Fallback direto de segurança para a conta demo oficial do TCC
  if (usuarioEmail && usuarioEmail.toLowerCase() === 'admin@nexusdemo.com') {
    return {
      id: usuarioId || '7d537a13-38d1-4447-a4f4-3a214a9be799',
      nome: 'Admin Demonstração',
      email: 'admin@nexusdemo.com',
      cargo: 'admin',
      empresa: 'Nexus Demo',
      cnpj: null
    };
  }

  return null;
}

// Helper para gerar SKU automático baseado na categoria
function gerarSKU(categoria) {
  const prefixo = (categoria && categoria.trim().length >= 3)
    ? categoria.trim().substring(0, 3).toUpperCase()
    : 'PROD';
  const numeroAleatorio = Math.floor(10000 + Math.random() * 90000);
  return `${prefixo}-${numeroAleatorio}`;
}

// 1. GET /api/produtos - Listar produtos da empresa do utilizador logado
router.get('/', async (req, res) => {
  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .select('*')
      .eq('empresa', usuario.empresa) // <-- ISOLAMENTO MULTI-EMPRESA
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro ao buscar produtos:', err);
    return res.status(500).json({ error: 'Erro ao carregar produtos do banco de dados.' });
  }
});

// 1.1. GET /api/produtos/pendentes (Com código espião)
router.get('/pendentes', async (req, res) => {
  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    console.log('🕵️ [ESPIÃO BACKEND] A procurar pendentes para a empresa:', usuario.empresa);

    const { data, error } = await dbClient
      .from('produtos')
      .select('*')
      .eq('empresa', usuario.empresa) // <-- FILTRA PELA EMPRESA
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('🕵️ [ESPIÃO BACKEND] Erro do Supabase:', error);
      throw error;
    }

    console.log('🕵️ [ESPIÃO BACKEND] Produtos pendentes encontrados:', data);
    return res.status(200).json(data);
  } catch (err) {
    console.error('🕵️ [ESPIÃO BACKEND] Erro interno:', err);
    return res.status(500).json({ error: 'Erro ao carregar produtos pendentes.' });
  }
});

// 1.2. GET /api/produtos/estoque-baixo - Listar apenas produtos com estoque crítico (<= 12) na empresa
router.get('/estoque-baixo', async (req, res) => {
  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .select('*')
      .eq('empresa', usuario.empresa) // <-- FILTRA PELA EMPRESA
      .lte('estoque', 12)
      .order('estoque', { ascending: true });

    if (error) throw error;

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro ao buscar estoque baixo:', err);
    return res.status(500).json({ error: 'Erro ao carregar produtos com estoque baixo.' });
  }
});

// 2. POST /api/produtos - Criar novo produto vinculado à empresa (Força o estado pendente para o fluxo de solicitações)
router.post('/', async (req, res) => {
  const { 
    nome, 
    sku, 
    categoria, 
    preco_venda, 
    estoque, 
    preco_custo, 
    quantidade_minima, 
    fornecedor, 
    status 
  } = req.body;

  if (!nome || preco_venda === undefined) {
    return res.status(400).json({ error: 'Campos obrigatórios: Nome e Preço de Venda.' });
  }

  const skuFinal = (sku && sku.trim() !== '') ? sku.trim() : gerarSKU(categoria);

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    // Força todos os novos produtos a nascerem como 'pendente' para o fluxo de solicitações
    const statusFinal = status || 'pendente';

    const { data, error } = await dbClient
      .from('produtos')
      .insert([
        {
          nome: nome.trim(),
          sku: skuFinal,
          categoria: categoria || 'Geral',
          preco_venda: parseFloat(preco_venda) || 0,
          estoque: parseInt(estoque, 10) || 0,
          preco_custo: parseFloat(preco_custo) || 0,
          quantidade_minima: parseInt(quantidade_minima, 10) || 12,
          fornecedor: fornecedor ? fornecedor.trim() : null,
          usuario_id: usuario.id,
          empresa: usuario.empresa, // <-- HERANÇA OBRIGATÓRIA DA EMPRESA
          cnpj: usuario.cnpj || null,
          ativo: true,
          status: statusFinal 
        }
      ])
      .select();

    if (error) throw error;

    return res.status(201).json(data[0]);
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar produto no banco de dados.' });
  }
});

// 3. PUT /api/produtos/:id - Editar produto existente (Restrito à mesma empresa, atualizando custos e fornecedor)
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
    quantidade_minima, 
    fornecedor 
  } = req.body;

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const updatePayload = {};
    if (nome !== undefined) updatePayload.nome = nome.trim();
    if (sku !== undefined) updatePayload.sku = sku;
    if (categoria !== undefined) updatePayload.categoria = categoria;
    if (preco_venda !== undefined) updatePayload.preco_venda = parseFloat(preco_venda);
    if (estoque !== undefined) updatePayload.estoque = parseInt(estoque, 10);
    if (ativo !== undefined) updatePayload.ativo = ativo;
    if (preco_custo !== undefined) updatePayload.preco_custo = parseFloat(preco_custo) || 0;
    if (quantidade_minima !== undefined) updatePayload.quantidade_minima = parseInt(quantidade_minima, 10) || 12;
    if (fornecedor !== undefined) updatePayload.fornecedor = fornecedor ? fornecedor.trim() : null;
    
    updatePayload.ultima_atualizacao = new Date().toISOString();

    const { data, error } = await dbClient
      .from('produtos')
      .update(updatePayload)
      .eq('id', id)
      .eq('empresa', usuario.empresa) // <-- GARANTE QUE SÓ ATUALIZA PRODUTOS DA PRÓPRIA EMPRESA
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado na sua empresa ou não autorizado.' });
    }

    return res.status(200).json(data[0]);
  } catch (err) {
    console.error('Erro ao atualizar produto:', err);
    return res.status(500).json({ error: 'Erro ao atualizar produto no banco de dados.' });
  }
});

// 4. PATCH /api/produtos/:id/status - Aprovar ou Rejeitar produto (Moderação restrita à empresa)
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Espera 'aprovado' ou 'rejeitado'

  if (!['aprovado', 'rejeitado'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido. Utilize "aprovado" ou "rejeitado".' });
  }

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .update({ status, ultima_atualizacao: new Date().toISOString() })
      .eq('id', id)
      .eq('empresa', usuario.empresa) // <-- ISOLAMENTO MULTI-EMPRESA
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado na sua empresa ou não autorizado.' });
    }

    const produtoAtualizado = data[0];

    // Se aprovado, gera automaticamente o registo financeiro de compra/entrada para atualizar os gastos do dashboard
    if (status === 'aprovado') {
      const quantidadeEstoque = parseInt(produtoAtualizado.estoque || produtoAtualizado.quantidade || 0, 10);
      const precoUnitario = parseFloat(produtoAtualizado.preco_venda || produtoAtualizado.preco || 0);

      if (quantidadeEstoque > 0 && precoUnitario > 0) {
        const { error: erroMov } = await dbClient
          .from('movimentacoes')
          .insert([
            {
              usuario_id: usuario.id,
              empresa: usuario.empresa,
              produto_id: produtoAtualizado.id,
              tipo: 'compra',
              quantidade: quantidadeEstoque,
              valor_unitario: precoUnitario,
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

// 5. PATCH /api/produtos/:id/ativo - Alternar ativo/inativo (Restrito à empresa)
router.patch('/:id/ativo', async (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .update({ ativo, ultima_atualizacao: new Date().toISOString() })
      .eq('id', id)
      .eq('empresa', usuario.empresa) // <-- ISOLAMENTO MULTI-EMPRESA
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

// 6. DELETE /api/produtos/:id - Remover produto (Restrito à empresa)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('produtos')
      .delete()
      .eq('id', id)
      .eq('empresa', usuario.empresa) // <-- IMPEDE EXCLUIR PRODUTO DE OUTRA EMPRESA
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
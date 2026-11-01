const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas operações do backend
const dbClient = supabaseAdmin || supabase;

router.use(authMiddleware);

// Função auxiliar para identificar o utilizador logado e a sua respetiva empresa
async function obterDadosUsuario(req) {
  const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;
  const usuarioEmail = req.user?.email;

  // 1. Tenta buscar na tabela pública de utilizadores usando o dbClient (sem bloqueio de RLS)
  if (usuarioId) {
    const { data: porId } = await dbClient
      .from('usuarios')
      .select('id, nome, email, cargo, empresa, cnpj')
      .eq('id', usuarioId)
      .maybeSingle();

    if (porId && porId.empresa) {
      return porId;
    }
  }

  if (usuarioEmail) {
    const { data: porEmail } = await dbClient
      .from('usuarios')
      .select('id, nome, email, cargo, empresa, cnpj')
      .ilike('email', usuarioEmail.trim())
      .maybeSingle();

    if (porEmail && porEmail.empresa) {
      return porEmail;
    }
  }

  // 2. Fallback seguro: aproveita os dados já sincronizados pelo authMiddleware em req.user
  const empresaToken = req.user?.empresa || req.user?.user_metadata?.empresa;
  if (usuarioId && empresaToken) {
    return {
      id: usuarioId,
      nome: req.user?.user_metadata?.nome || 'Utilizador Nexus',
      email: usuarioEmail,
      cargo: req.user?.cargo || req.user?.user_metadata?.cargo || 'Administrador',
      empresa: empresaToken,
      cnpj: req.user?.user_metadata?.cnpj || null
    };
  }

  // 3. Fallback para a conta de demonstração
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

// 1. GET /api/solicitacoes - Listar solicitações da empresa
router.get('/', async (req, res) => {
  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('solicitacoes')
      .select(`
        id,
        usuario_id,
        empresa,
        quantidade,
        prioridade,
        solicitante,
        status,
        observacao,
        created_at,
        produtos (
          id,
          nome,
          sku,
          estoque,
          preco_venda
        )
      `)
      .eq('empresa', usuario.empresa) // <-- ISOLAMENTO MULTI-EMPRESA
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro ao buscar solicitações:', err);
    return res.status(500).json({ error: 'Erro ao carregar solicitações.' });
  }
});

// 2. POST /api/solicitacoes - Criar nova solicitação vinculada à empresa
router.post('/', async (req, res) => {
  const { produto_id, quantidade, prioridade, solicitante, observacao } = req.body;

  if (!produto_id || !quantidade || quantidade <= 0) {
    return res.status(400).json({ error: 'Produto e quantidade válida são obrigatórios.' });
  }

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    // Valida se o produto pertence à mesma empresa antes de permitir a solicitação
    const { data: produtoValido, error: erroProd } = await dbClient
      .from('produtos')
      .select('id')
      .eq('id', produto_id)
      .eq('empresa', usuario.empresa)
      .maybeSingle();

    if (erroProd || !produtoValido) {
      return res.status(404).json({ error: 'Produto não encontrado no catálogo da sua empresa.' });
    }

    const { data, error } = await dbClient
      .from('solicitacoes')
      .insert([{
        usuario_id: usuario.id,
        empresa: usuario.empresa, // <-- CARIMBA A EMPRESA AUTOMATICAMENTE
        cnpj: usuario.cnpj || null,
        produto_id,
        quantidade: parseInt(quantidade, 10),
        prioridade: prioridade || 'media',
        solicitante: solicitante || usuario.nome || 'Não informado',
        observacao: observacao || '',
        status: 'pendente'
      }])
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ message: 'Solicitação criada com sucesso!', solicitacao: data });
  } catch (err) {
    console.error('Erro ao criar solicitação:', err);
    return res.status(500).json({ error: 'Erro ao registrar solicitação.' });
  }
});

// 3. PATCH /api/solicitacoes/:id/status - Alterar status (Aprovar / Cancelar) com trava de empresa
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'aprovada' ou 'cancelada'

  if (!['aprovada', 'cancelada'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    // Buscar solicitação garantindo que pertence à empresa
    const { data: sol, error: errSol } = await dbClient
      .from('solicitacoes')
      .select('*, produtos(id, estoque, preco_venda, empresa)')
      .eq('id', id)
      .eq('empresa', usuario.empresa) // <-- ISOLAMENTO MULTI-EMPRESA
      .maybeSingle();

    if (errSol || !sol) {
      return res.status(404).json({ error: 'Solicitação não encontrada na sua empresa.' });
    }

    if (sol.status !== 'pendente') {
      return res.status(400).json({ error: 'Esta solicitação já foi finalizada.' });
    }

    // Se aprovada, gera entrada de estoque e regista movimentação de reposição na mesma empresa
    if (status === 'aprovada') {
      const novoEstoque = (sol.produtos?.estoque || 0) + sol.quantidade;

      // 1. Atualizar estoque do produto na empresa
      await dbClient
        .from('produtos')
        .update({ estoque: novoEstoque })
        .eq('id', sol.produto_id)
        .eq('empresa', usuario.empresa);

      // 2. Registrar movimentação como 'reposicao' vinculada à empresa
      await dbClient
        .from('movimentacoes')
        .insert([{
          usuario_id: usuario.id,
          empresa: usuario.empresa,
          cnpj: usuario.cnpj || null,
          produto_id: sol.produto_id,
          tipo: 'reposicao',
          quantidade: sol.quantidade,
          valor_unitario: sol.produtos?.preco_venda || 0,
          observacao: `Aprovação de solicitação de reposição (#${sol.id.slice(0, 8)})`,
          lida: false
        }]);
    }

    // Atualiza status da solicitação
    const { data: solAtualizada, error: errUpd } = await dbClient
      .from('solicitacoes')
      .update({ status })
      .eq('id', id)
      .eq('empresa', usuario.empresa)
      .select()
      .single();

    if (errUpd) throw errUpd;

    return res.status(200).json({
      message: `Solicitação ${status === 'aprovada' ? 'aprovada com reposição no estoque' : 'cancelada'}.`,
      solicitacao: solAtualizada
    });

  } catch (err) {
    console.error('Erro ao atualizar solicitação:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status da solicitação.' });
  }
});

module.exports = router;
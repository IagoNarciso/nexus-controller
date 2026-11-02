const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas operações validadas pelo backend
const dbClient = supabaseAdmin || supabase;

// Proteger todas as rotas de movimentações
router.use(authMiddleware);

// Cache em memória para evitar consultar a tabela 'usuarios' em todas as requisições
const cacheUsuarios = new Map();
const TEMPO_CACHE_MS = 5 * 60 * 1000; // 5 minutos de validade

// Função auxiliar otimizada para identificar o utilizador logado e a sua respetiva empresa
async function obterDadosUsuario(req) {
  const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;
  const usuarioEmail = req.user?.email;
  const chaveCache = usuarioId || (usuarioEmail ? usuarioEmail.toLowerCase().trim() : null);

  // 1. Retorno instantâneo (0ms): Verifica se o utilizador já está na memória do servidor
  if (chaveCache && cacheUsuarios.has(chaveCache)) {
    const itemCache = cacheUsuarios.get(chaveCache);
    if (Date.now() - itemCache.timestamp < TEMPO_CACHE_MS) {
      return itemCache.dados;
    }
    cacheUsuarios.delete(chaveCache);
  }

  // 2. Retorno sem consulta ao banco: Usa os metadados já validados no Token JWT
  if (req.user?.user_metadata?.empresa || req.user?.empresa) {
    const empresaToken = req.user?.user_metadata?.empresa || req.user?.empresa;
    const usuarioJwt = {
      id: usuarioId,
      nome: req.user?.user_metadata?.nome || 'Utilizador Nexus',
      email: usuarioEmail,
      cargo: req.user?.user_metadata?.cargo || req.user?.cargo || 'admin',
      empresa: empresaToken,
      cnpj: req.user?.user_metadata?.cnpj || null
    };
    if (chaveCache) {
      cacheUsuarios.set(chaveCache, { dados: usuarioJwt, timestamp: Date.now() });
    }
    return usuarioJwt;
  }

  // 3. Busca no banco pelo ID exato (apenas se não estiver em cache nem no JWT)
  if (usuarioId) {
    const { data: porId } = await dbClient
      .from('usuarios')
      .select('id, nome, email, cargo, empresa, cnpj')
      .eq('id', usuarioId)
      .maybeSingle();

    if (porId && porId.empresa) {
      cacheUsuarios.set(chaveCache, { dados: porId, timestamp: Date.now() });
      return porId;
    }
  }

  // 4. Fallback por E-mail
  if (usuarioEmail) {
    const { data: porEmail } = await dbClient
      .from('usuarios')
      .select('id, nome, email, cargo, empresa, cnpj')
      .ilike('email', usuarioEmail.trim())
      .maybeSingle();

    if (porEmail && porEmail.empresa) {
      cacheUsuarios.set(chaveCache, { dados: porEmail, timestamp: Date.now() });
      return porEmail;
    }
  }

  // 5. Fallback para a conta de demonstração
  if (usuarioEmail && usuarioEmail.toLowerCase() === 'admin@nexusdemo.com') {
    const usuarioDemo = {
      id: usuarioId || '7d537a13-38d1-4447-a4f4-3a214a9be799',
      nome: 'Admin Demonstração',
      email: 'admin@nexusdemo.com',
      cargo: 'admin',
      empresa: 'Nexus Demo',
      cnpj: null
    };
    if (chaveCache) {
      cacheUsuarios.set(chaveCache, { dados: usuarioDemo, timestamp: Date.now() });
    }
    return usuarioDemo;
  }

  return null;
}

// 1. GET /api/movimentacoes - Listar histórico com garantia de responsável em todas as linhas
router.get('/', async (req, res) => {
  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('movimentacoes')
      .select(`
        id,
        usuario_id,
        empresa,
        tipo,
        quantidade,
        valor_unitario,
        observacao,
        lida,
        created_at,
        produtos (
          id,
          nome,
          sku,
          categoria,
          preco_venda,
          estoque
        ),
        usuarios:usuario_id (
          id,
          nome,
          email,
          cargo
        )
      `)
      .eq('empresa', usuario.empresa)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Garante que se houver algum registo sem utilizador ligado, assume o nome do admin/utilizador atual da sessão
    const dadosCompletos = (data || []).map(m => {
      if (!m.usuarios || !m.usuarios.nome) {
        m.usuarios = {
          nome: usuario.nome || 'Iago Narciso', // Fallback garantido para o responsável principal
          cargo: usuario.cargo || 'Administrador'
        };
      }
      return m;
    });

    return res.status(200).json(dadosCompletos);
  } catch (err) {
    console.error('Erro ao buscar movimentações:', err);
    return res.status(500).json({ error: 'Erro ao carregar histórico de movimentações.' });
  }
});

// 2. GET /api/movimentacoes/nao-lidas - Contagem para a badge da empresa
router.get('/nao-lidas', async (req, res) => {
  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ totalNaoLidas: 0 });
    }

    const { count, error } = await dbClient
      .from('movimentacoes')
      .select('id', { count: 'exact', head: true })
      .eq('empresa', usuario.empresa) // <-- CONTA APENAS AS NÃO LIDAS DA MESMA EMPRESA
      .eq('lida', false);

    if (error) throw error;

    return res.status(200).json({ totalNaoLidas: count || 0 });
  } catch (err) {
    console.error('Erro ao contar movimentações não lidas:', err);
    return res.status(500).json({ totalNaoLidas: 0 });
  }
});

// 3. PATCH /api/movimentacoes/:id/visualizar - Marcar como lida (Restrito à empresa)
router.patch('/:id/visualizar', async (req, res) => {
  const { id } = req.params;

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('movimentacoes')
      .update({ lida: true })
      .eq('id', id)
      .eq('empresa', usuario.empresa) // <-- GARANTE QUE PERTENCE À MESMA EMPRESA
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Movimentação não encontrada na sua empresa.' });
    }

    return res.status(200).json({ message: 'Movimentação marcada como vista.', movimentacao: data });
  } catch (err) {
    console.error('Erro ao marcar movimentação como vista:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status de visualização.' });
  }
});

// 4. POST /api/movimentacoes - Registrar nova movimentação vinculada à empresa
router.post('/', async (req, res) => {
  const { produto_id, tipo, quantidade, valor_unitario, desconto, observacao } = req.body;

  if (!produto_id || !tipo || !quantidade || quantidade <= 0) {
    return res.status(400).json({ error: 'Produto, tipo e quantidade válida são obrigatórios.' });
  }

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    // Busca o produto garantindo que ele pertence à empresa do utilizador logado
    const { data: produto, error: errorProduto } = await dbClient
      .from('produtos')
      .select('id, estoque, preco_venda, empresa')
      .eq('id', produto_id)
      .eq('empresa', usuario.empresa) // <-- PERMITE MOVIMENTAR PRODUTOS DA EMPRESA
      .maybeSingle();

    if (errorProduto || !produto) {
      return res.status(404).json({ error: 'Produto não encontrado no catálogo da sua empresa.' });
    }

    const qtd = parseInt(quantidade, 10);
    const estoqueAtual = Number(produto.estoque || 0);
    let novoEstoque = estoqueAtual;

    const tipoNorm = tipo.toLowerCase();
    if (tipoNorm === 'compra' || tipoNorm === 'entrada') {
      novoEstoque += qtd;
    } else {
      if (estoqueAtual < qtd) {
        return res.status(400).json({ error: `Estoque insuficiente. Saldo atual: ${estoqueAtual}` });
      }
      novoEstoque -= qtd;
    }

    let precoUnitario = valor_unitario ? parseFloat(valor_unitario) : parseFloat(produto.preco_venda || 0);
    const valorDesconto = (tipoNorm === 'venda' && desconto) ? parseFloat(desconto) : 0;
    if (valorDesconto > 0) {
      precoUnitario = Math.max(0, precoUnitario - (valorDesconto / qtd));
    }

    let obsFinal = observacao || '';
    if (valorDesconto > 0) {
      const descFmt = valorDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      obsFinal = obsFinal ? `${obsFinal} (Desconto: R$ ${descFmt})` : `Desconto aplicado: R$ ${descFmt}`;
    }

    // Regista a movimentação carimbando o ID do operador que executou e a Empresa
    const { data: movData, error: errorMov } = await dbClient
      .from('movimentacoes')
      .insert([{
        usuario_id: usuario.id,
        empresa: usuario.empresa, // <-- CARIMBA A EMPRESA AUTOMATICAMENTE
        cnpj: usuario.cnpj || null,
        produto_id,
        tipo,
        quantidade: qtd,
        valor_unitario: precoUnitario,
        observacao: obsFinal,
        lida: false
      }])
      .select()
      .single();

    if (errorMov) throw errorMov;

    // Atualiza o saldo do produto dentro da empresa
    const { error: errorUpdateProd } = await dbClient
      .from('produtos')
      .update({ estoque: novoEstoque })
      .eq('id', produto_id)
      .eq('empresa', usuario.empresa);

    if (errorUpdateProd) throw errorUpdateProd;

    return res.status(201).json({ message: 'Movimentação registrada com sucesso!', movimentacao: movData });

  } catch (err) {
    console.error('Erro ao registrar movimentação:', err);
    return res.status(500).json({ error: 'Erro ao registrar movimentação.' });
  }
});

module.exports = router;
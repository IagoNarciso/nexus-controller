const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas operações validadas pelo backend
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

// GET /api/fornecedores - Listar fornecedores apenas da empresa do utilizador logado
router.get('/', async (req, res) => {
  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('fornecedores')
      .select('*')
      .eq('empresa', usuario.empresa) // <-- ISOLAMENTO MULTI-EMPRESA
      .order('nome', { ascending: true });

    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro ao buscar fornecedores:', err);
    return res.status(500).json({ error: 'Erro ao carregar fornecedores.' });
  }
});

// POST /api/fornecedores - Cadastrar fornecedor vinculado automaticamente à empresa
router.post('/', async (req, res) => {
  const { 
    nome, 
    categoria, 
    cnpj, 
    responsavel, 
    telefone, 
    email, 
    cidade_estado, 
    produtos_vinculados, 
    prazo_medio, 
    pedido_minimo 
  } = req.body;

  if (!nome) {
    return res.status(400).json({ error: 'O campo Razão Social / Nome é obrigatório.' });
  }

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('fornecedores')
      .insert([{
        usuario_id: usuario.id, // Regista quem cadastrou para auditoria
        empresa: usuario.empresa, // <-- CARIMBA AUTOMATICAMENTE A EMPRESA DO UTILIZADOR LOGADO
        nome: nome.trim(),
        categoria: categoria || null,
        cnpj: cnpj || null, // CNPJ do próprio fornecedor cadastrado no formulário
        responsavel: responsavel || null,
        telefone: telefone || null,
        email: email || null,
        cidade_estado: cidade_estado || null,
        produtos_vinculados: parseInt(produtos_vinculados, 10) || 0,
        prazo_medio: parseInt(prazo_medio, 10) || 1,
        pedido_minimo: parseFloat(pedido_minimo) || 0,
        ativo: true
      }])
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ message: 'Fornecedor cadastrado com sucesso!', fornecedor: data });
  } catch (err) {
    console.error('Erro ao cadastrar fornecedor:', err);
    return res.status(500).json({ error: 'Erro ao salvar fornecedor.' });
  }
});

// PUT /api/fornecedores/:id - Atualizar fornecedor (Restrito à mesma empresa)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    nome, 
    categoria, 
    cnpj, 
    responsavel, 
    telefone, 
    email, 
    cidade_estado, 
    produtos_vinculados, 
    prazo_medio, 
    pedido_minimo,
    ativo 
  } = req.body;

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    // Monta o objeto de atualização dinamicamente apenas com o que vier preenchido
    const camposAtualizados = {};
    if (nome !== undefined) camposAtualizados.nome = nome;
    if (categoria !== undefined) camposAtualizados.categoria = categoria || null;
    if (cnpj !== undefined) camposAtualizados.cnpj = cnpj || null;
    if (responsavel !== undefined) camposAtualizados.responsavel = responsavel || null;
    if (telefone !== undefined) camposAtualizados.telefone = telefone || null;
    if (email !== undefined) camposAtualizados.email = email || null;
    if (cidade_estado !== undefined) camposAtualizados.cidade_estado = cidade_estado || null;
    if (produtos_vinculados !== undefined) camposAtualizados.produtos_vinculados = parseInt(produtos_vinculados, 10) || 0;
    if (prazo_medio !== undefined) camposAtualizados.prazo_medio = parseInt(prazo_medio, 10) || 1;
    if (pedido_minimo !== undefined) camposAtualizados.pedido_minimo = parseFloat(pedido_minimo) || 0;
    if (ativo !== undefined) camposAtualizados.ativo = ativo;

    const { data, error } = await dbClient
      .from('fornecedores')
      .update(camposAtualizados)
      .eq('id', id)
      .eq('empresa', usuario.empresa) // <-- GARANTE QUE SÓ ATUALIZA FORNECEDORES DA PRÓPRIA EMPRESA
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Fornecedor não encontrado na sua empresa.' });
    }

    return res.status(200).json({ message: 'Fornecedor atualizado com sucesso!', fornecedor: data });
  } catch (err) {
    console.error('Erro ao atualizar fornecedor:', err);
    return res.status(500).json({ error: 'Erro ao atualizar fornecedor.' });
  }
});

// DELETE /api/fornecedores/:id - Excluir fornecedor (Restrito à mesma empresa)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('fornecedores')
      .delete()
      .eq('id', id)
      .eq('empresa', usuario.empresa) // <-- IMPEDE EXCLUIR FORNECEDOR DE OUTRA EMPRESA
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Fornecedor não encontrado na sua empresa.' });
    }

    return res.status(200).json({ message: 'Fornecedor excluído com sucesso!' });
  } catch (err) {
    console.error('Erro ao excluir fornecedor:', err);
    return res.status(500).json({ error: 'Erro ao excluir fornecedor.' });
  }
});

module.exports = router;
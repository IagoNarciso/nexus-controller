const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas operações validadas pelo backend
const dbClient = supabaseAdmin || supabase;

// Proteger todas as rotas de fornecedores
router.use(authMiddleware);

// GET /api/fornecedores - Listar fornecedores apenas da empresa do utilizador logado
router.get('/', async (req, res) => {
  try {
    const empresa = req.user?.empresa;

    if (!empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('fornecedores')
      .select('*')
      .eq('empresa', empresa) // <-- ISOLAMENTO MULTI-EMPRESA INSTANTÂNEO
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

  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: 'O campo Razão Social / Nome é obrigatório.' });
  }

  try {
    const usuario = req.user;

    if (!usuario || !usuario.empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    // Objeto de inserção limpo e blindado para evitar Erro 500 por colunas ausentes
    const novoFornecedor = {
      empresa: usuario.empresa, // <-- Obrigatório para multi-tenant
      nome: nome.trim(),
      categoria: categoria || null,
      cnpj: cnpj || null,
      responsavel: responsavel || null,
      telefone: telefone || null,
      email: email || null,
      cidade_estado: cidade_estado || null,
      produtos_vinculados: parseInt(produtos_vinculados, 10) || 0,
      prazo_medio: parseInt(prazo_medio, 10) || 1,
      pedido_minimo: parseFloat(pedido_minimo) || 0,
      ativo: true
    };

    // Adiciona o usuario_id apenas se houver propriedade válida no req.user
    if (usuario.id) {
      novoFornecedor.usuario_id = usuario.id;
    }

    const { data, error } = await dbClient
      .from('fornecedores')
      .insert([novoFornecedor])
      .select()
      .single();

    if (error) {
      console.error('Erro detalhado do Supabase ao inserir fornecedor:', error);
      throw error;
    }

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
    const empresa = req.user?.empresa;

    if (!empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const camposAtualizados = {};
    if (nome !== undefined) camposAtualizados.nome = nome.trim();
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
      .eq('empresa', empresa) // <-- GARANTE O ISOLAMENTO MULTI-EMPRESA
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
    const empresa = req.user?.empresa;

    if (!empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    const { data, error } = await dbClient
      .from('fornecedores')
      .delete()
      .eq('id', id)
      .eq('empresa', empresa) // <-- IMPEDE EXCLUIR FORNECEDOR DE OUTRA EMPRESA
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
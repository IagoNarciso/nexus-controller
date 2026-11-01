const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase'); 
const autenticarToken = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas operações do backend
const dbClient = supabaseAdmin || supabase;

// Rota para buscar o perfil do utilizador logado de forma flexível
router.get('/perfil', autenticarToken, async (req, res) => {
  try {
    const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;
    const usuarioEmail = req.user?.email;

    let query = dbClient.from('usuarios').select('*');

    if (usuarioId) {
      query = query.eq('id', usuarioId);
    } else if (usuarioEmail) {
      query = query.eq('email', usuarioEmail);
    } else {
      return res.status(400).json({ error: 'Nenhum identificador válido encontrado no token.' });
    }

    const { data: usuario, error } = await query.maybeSingle();

    if (error || !usuario) {
      return res.status(404).json({ error: 'Utilizador não encontrado na base de dados.' });
    }

    return res.json({
      id: usuario.id,
      nome: usuario.nome || 'Utilizador Nexus',
      email: usuario.email,
      cargo: usuario.cargo || usuario.role || 'Administrador',
      empresa: usuario.empresa || 'Nexus Controller',
      cnpj: usuario.cnpj || '12.345.678/0001-99',
      regiao: usuario.regiao || 'Nacional / PR',
      data_cadastro: usuario.data_cadastro || usuario.created_at
    });
  } catch (err) {
    console.error('Erro interno ao buscar perfil:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Rota para listar apenas os funcionários que pertencem à mesma empresa do utilizador logado
router.get('/equipe', autenticarToken, async (req, res) => {
  try {
    const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;

    // 1. Descobre a qual empresa pertence quem está a fazer a consulta usando o dbClient
    const { data: usuarioLogado, error: erroUsuario } = await dbClient
      .from('usuarios')
      .select('empresa')
      .eq('id', usuarioId)
      .maybeSingle();

    if (erroUsuario || !usuarioLogado || !usuarioLogado.empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    // 2. Busca APENAS os utilizadores da mesma empresa (Isolamento Multi-Tenant)
    const { data: equipe, error: erroEquipe } = await dbClient
      .from('usuarios')
      .select('id, nome, email, cargo, cpf, data_nascimento, empresa, regiao, data_cadastro')
      .eq('empresa', usuarioLogado.empresa)
      .order('nome', { ascending: true });

    if (erroEquipe) {
      return res.status(400).json({ error: erroEquipe.message });
    }

    return res.status(200).json(equipe);
  } catch (err) {
    console.error('Erro interno ao listar equipa:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Rota protegida para cadastrar novo funcionário com Herança Obrigatória de Empresa (Exclusiva para Administradores)
router.post('/cadastrar', autenticarToken, async (req, res) => {
  const { nome, regiao, cpf, data_nascimento, email, cargo, senha } = req.body;
  const adminId = req.user?.id || req.user?.sub || req.user?.userId;

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios (nome, email e senha).' });
  }

  try {
    // 1. Valida se quem está a fazer o pedido é Administrador e recupera os dados da empresa dele
    const { data: admin, error: erroAdmin } = await dbClient
      .from('usuarios')
      .select('*')
      .eq('id', adminId)
      .maybeSingle();

    if (erroAdmin || !admin) {
      return res.status(401).json({ error: 'Sessão de administrador inválida.' });
    }

    const cargoAdmin = (admin.cargo || admin.role || '').toLowerCase();
    if (cargoAdmin !== 'administrador' && cargoAdmin !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: apenas administradores podem cadastrar funcionários.' });
    }

    if (!admin.empresa) {
      return res.status(400).json({ error: 'A conta de administrador não possui uma empresa associada.' });
    }

    // Dados corporativos herdados estritamente do Administrador logado
    const empresaHerdada = admin.empresa;
    const cnpjHerdado = admin.cnpj || '12.345.678/0001-99';
    const regiaoHerdada = regiao || admin.regiao || 'Nacional / PR';
    const cargoDefinido = cargo || 'operador';

    let novoId;

    // 2. Tenta criar o funcionário no Supabase Auth já com os metadados da empresa do Admin
    const { data: authData, error: authError } = await dbClient.auth.admin.createUser({
      email: email.trim(),
      password: senha,
      email_confirm: true,
      user_metadata: {
        nome,
        empresa: empresaHerdada,
        cnpj: cnpjHerdado,
        regiao: regiaoHerdada,
        cargo: cargoDefinido
      }
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        const { data: existingUsers } = await dbClient.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
        
        if (existingUser) {
          // Verifica na tabela pública se este e-mail já pertence a OUTRA empresa antes de sobrescrever
          const { data: usuarioExistente } = await dbClient
            .from('usuarios')
            .select('empresa')
            .eq('id', existingUser.id)
            .maybeSingle();

          if (usuarioExistente && usuarioExistente.empresa && usuarioExistente.empresa !== empresaHerdada) {
            return res.status(403).json({ 
              error: 'Este e-mail já está vinculado a outra empresa no sistema.' 
            });
          }

          novoId = existingUser.id;
        } else {
          return res.status(400).json({ error: 'Este e-mail já está registado, mas não foi possível localizar o ID de acesso.' });
        }
      } else {
        return res.status(400).json({ error: 'Erro ao criar credenciais de acesso: ' + authError.message });
      }
    } else {
      novoId = authData.user.id;
    }

    // 3. Insere ou atualiza os dados detalhados na tabela `usuarios` forçando a empresa herdada
    const { data, error: dbError } = await dbClient
      .from('usuarios')
      .upsert([
        {
          id: novoId,
          nome,
          empresa: empresaHerdada,
          cnpj: cnpjHerdado,
          regiao: regiaoHerdada,
          cpf: cpf || null,
          data_nascimento: data_nascimento || null,
          email: email.trim(),
          cargo: cargoDefinido,
          senha, 
          data_cadastro: new Date().toISOString()
        }
      ], { onConflict: 'id' })
      .select();

    if (dbError) {
      console.error('Erro ao inserir na tabela usuarios:', dbError);
      return res.status(400).json({ error: dbError.message });
    }

    return res.status(201).json({ 
      message: `Funcionário cadastrado com sucesso na empresa ${empresaHerdada}!`, 
      data 
    });
  } catch (err) {
    console.error('Erro interno no servidor:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Rota para Exclusão Segura de Funcionário com trava Multi-Empresa (Exclusiva para Administradores)
router.delete('/excluir', autenticarToken, async (req, res) => {
  const { nome, cpf, email, senha_admin } = req.body;
  const adminId = req.user?.id || req.user?.sub || req.user?.userId;

  if (!nome || !cpf || !email || !senha_admin) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios para confirmar a exclusão.' });
  }

  try {
    const { data: admin, error: erroAdmin } = await dbClient
      .from('usuarios')
      .select('*')
      .eq('id', adminId)
      .maybeSingle();

    if (erroAdmin || !admin) {
      return res.status(401).json({ error: 'Sessão de administrador inválida.' });
    }

    const cargoAdmin = (admin.cargo || admin.role || '').toLowerCase();
    if (cargoAdmin !== 'administrador' && cargoAdmin !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: apenas administradores podem excluir funcionários.' });
    }

    if (admin.senha && admin.senha !== senha_admin) {
      return res.status(401).json({ error: 'Senha de administrador incorreta.' });
    } else if (!admin.senha) {
      const { error: authCheckError } = await supabase.auth.signInWithPassword({
        email: admin.email,
        password: senha_admin
      });
      if (authCheckError) {
        return res.status(401).json({ error: 'Senha de administrador incorreta.' });
      }
    }

    if (admin.email.toLowerCase() === email.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Não é permitido excluir a própria conta de administrador ativa.' });
    }

    // Busca o funcionário garantindo que pertence estritamente à MESMA empresa do Admin
    const { data: funcionario, error: erroBusca } = await dbClient
      .from('usuarios')
      .select('*')
      .ilike('nome', nome.trim())
      .eq('cpf', cpf.trim())
      .ilike('email', email.trim())
      .eq('empresa', admin.empresa)
      .maybeSingle();

    if (erroBusca || !funcionario) {
      return res.status(404).json({ 
        error: 'Funcionário não encontrado na sua empresa. Verifique se Nome, CPF e E-mail estão corretos.' 
      });
    }

    // Remove o registo da tabela pública `usuarios`
    const { error: erroExclusao } = await dbClient
      .from('usuarios')
      .delete()
      .eq('id', funcionario.id)
      .eq('empresa', admin.empresa);

    if (erroExclusao) {
      return res.status(400).json({ error: erroExclusao.message });
    }

    // Remove também do Supabase Auth para libertar o e-mail
    await dbClient.auth.admin.deleteUser(funcionario.id);

    return res.status(200).json({ message: 'Funcionário excluído do sistema com sucesso!' });
  } catch (err) {
    console.error('Erro interno ao processar exclusão:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

module.exports = router;
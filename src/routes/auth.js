const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase'); 
const autenticarToken = require('../middlewares/auth');

// Rota de Login Flexível e Blindada
router.post('/login', async (req, res) => {
  console.log('Dados recebidos no login:', req.body);
  
  const { email, password, senha } = req.body;
  const userPassword = password || senha;

  if (!email || !userPassword) {
    console.error('Erro: E-mail ou senha em falta no body.');
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: email.trim(), 
      password: userPassword 
    });

    if (error) {
      console.error('Erro retornado pelo Supabase no login:', error.message);
      return res.status(400).json({ error: error.message });
    }

    const nomeUsuario = data.user?.user_metadata?.nome || data.user?.email?.split('@')[0] || 'Utilizador';

    return res.status(200).json({
      token: data.session.access_token,
      user: data.user,
      nome: nomeUsuario
    });
  } catch (err) {
    console.error('Erro interno no servidor ao fazer login:', err);
    return res.status(500).json({ error: 'Erro interno no servidor ao fazer login.' });
  }
});

// Rota de Registo de Administrador com Convite Corporativo (Tipo 'registro' ou 'convite')
router.post('/register', async (req, res) => {
  const { nome, empresa, cnpj, regiao, email, password, senha, codigoConvite } = req.body;
  const userPassword = password || senha;

  if (!email || !userPassword) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  if (!codigoConvite || !codigoConvite.trim()) {
    return res.status(403).json({ error: 'O código de convite corporativo é obrigatório.' });
  }

  // Validação rigorosa do tamanho do CNPJ padrão brasileiro (14 dígitos)
  const cnpjLimpo = cnpj ? cnpj.replace(/\D/g, '') : '';
  if (cnpjLimpo.length !== 14) {
    return res.status(400).json({ error: 'O CNPJ deve conter exatamente 14 dígitos numéricos válidos.' });
  }

  try {
    const codigoLimpo = codigoConvite.trim();

    // 1. Valida o código de convite na tabela convites_empresas usando o admin
    const { data: conviteData, error: conviteError } = await supabaseAdmin
      .from('convites_empresas')
      .select('*')
      .eq('codigo', codigoLimpo)
      .in('tipo', ['registro', 'convite'])
      .eq('ativo', true)
      .maybeSingle();

    if (conviteError || !conviteData) {
      return res.status(403).json({ error: 'Código de registo inválido, expirado ou já utilizado.' });
    }

    // Verifica se o código tem data de expiração e se já expirou
    if (conviteData.expires_at && new Date() > new Date(conviteData.expires_at)) {
      return res.status(403).json({ error: 'Este código de convite já expirou.' });
    }

    // 2. Cria o utilizador no Auth do Supabase via supabaseAdmin
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        nome: nome || 'Utilizador',
        empresa: empresa || conviteData.empresa_nome,
        cnpj: cnpj,
        regiao: regiao || 'Nacional / PR',
        cargo: 'Administrador'
      }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user?.id;

    // 3. Insere explicitamente na tabela `usuarios` via supabaseAdmin
    const payloadUsuario = {
      id: userId,
      nome: nome || 'Utilizador',
      email: email.trim(),
      empresa: empresa || conviteData.empresa_nome,
      cnpj: cnpj,
      regiao: regiao || 'Nacional / PR',
      cargo: 'Administrador',
      senha: userPassword,
      data_cadastro: new Date().toISOString()
    };

    const { error: dbError } = await supabaseAdmin
      .from('usuarios')
      .upsert([payloadUsuario], { onConflict: 'id' });

    if (dbError) {
      console.error('Erro ao inserir no Supabase:', dbError);
      return res.status(400).json({ error: 'Erro ao salvar dados do utilizador: ' + dbError.message });
    }

    // 4. Inativa o código de convite para uso único
    await supabaseAdmin
      .from('convites_empresas')
      .update({ ativo: false })
      .eq('id', conviteData.id);

    return res.status(201).json({
      message: 'Conta criada com sucesso!',
      user: authData.user
    });
  } catch (err) {
    console.error('Erro interno no registro:', err);
    return res.status(500).json({ error: 'Erro interno ao criar conta.' });
  }
});

// Rota de Redefinição Direta de Senha por Chave de Recuperação Específica (Tipo 'recuperacao')
router.post('/recuperar-senha-direta', async (req, res) => {
  const { email, novaSenha, codigoConvite } = req.body;

  if (!email || !novaSenha || !codigoConvite) {
    return res.status(400).json({ error: 'Preencha o e-mail, a nova senha e o código de recuperação.' });
  }

  try {
    // 1. Valida se a chave existe, está ativa e é estritamente do tipo 'recuperacao'
    const { data: conviteData, error: conviteError } = await supabaseAdmin
      .from('convites_empresas')
      .select('*')
      .eq('codigo', codigoConvite.trim())
      .eq('tipo', 'recuperacao')
      .eq('ativo', true)
      .maybeSingle();

    if (conviteError || !conviteData) {
      return res.status(403).json({ error: 'Código de recuperação inválido, expirado ou incorreto.' });
    }

    // Verifica se já passou das 24 horas de validade
    if (conviteData.expires_at && new Date() > new Date(conviteData.expires_at)) {
      return res.status(403).json({ error: 'Este código de recuperação expirou após 24 horas.' });
    }

    // 2. Lista os utilizadores do Supabase Auth para encontrar o ID correspondente ao e-mail
    const { data: usuariosList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) throw listError;

    const utilizadorAuth = usuariosList?.users?.find(u => u.email.toLowerCase() === email.trim().toLowerCase());

    if (!utilizadorAuth) {
      return res.status(404).json({ error: 'E-mail corporativo não encontrado no sistema.' });
    }

    // 3. Atualiza a senha diretamente no Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(utilizadorAuth.id, {
      password: novaSenha
    });

    if (updateError) throw updateError;

    // Atualiza também na tabela usuarios para manter sincronizado
    await supabaseAdmin
      .from('usuarios')
      .update({ senha: novaSenha })
      .eq('id', utilizadorAuth.id);

    // 4. Inativa o código de recuperação após o uso único por segurança
    await supabaseAdmin
      .from('convites_empresas')
      .update({ ativo: false })
      .eq('id', conviteData.id);

    return res.status(200).json({ message: 'Senha redefinida com sucesso! Já pode fazer login.' });
  } catch (err) {
    console.error('Erro ao redefinir senha diretamente:', err);
    return res.status(500).json({ error: 'Erro interno ao atualizar a senha no servidor.' });
  }
});

// Rota para o Administrador gerar uma nova Chave de Recuperação válida por 24 horas
router.post('/gerar-chave-recuperacao', autenticarToken, async (req, res) => {
  const adminId = req.user?.id || req.user?.sub || req.user?.userId;

  try {
    const { data: admin, error: erroAdmin } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('id', adminId)
      .maybeSingle();

    if (erroAdmin || !admin) {
      return res.status(401).json({ error: 'Sessão de administrador inválida.' });
    }

    const cargoAdmin = (admin.cargo || admin.role || '').toLowerCase();
    if (cargoAdmin !== 'administrador' && cargoAdmin !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: apenas administradores podem gerar chaves de recuperação.' });
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const codigoRecuperacao = `REC-${randomSuffix}`;

    // Define a data de expiração para exatamente 24 horas no futuro
    const dataExpiracao = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error: insertError } = await supabaseAdmin
      .from('convites_empresas')
      .insert([
        {
          codigo: codigoRecuperacao,
          empresa_nome: admin.empresa,
          tipo: 'recuperacao',
          ativo: true,
          expires_at: dataExpiracao,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    return res.status(201).json({ 
      message: 'Chave de recuperação gerada com sucesso (válida por 24 horas)!', 
      codigo: data.codigo 
    });
  } catch (err) {
    console.error('Erro ao gerar chave de recuperação:', err);
    return res.status(500).json({ error: 'Erro interno ao gerar a chave.' });
  }
});

// Rota para buscar o perfil do utilizador logado de forma flexível
router.get('/perfil', autenticarToken, async (req, res) => {
  try {
    const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;
    const usuarioEmail = req.user?.email;

    let query = supabaseAdmin.from('usuarios').select('*');

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

// Rota protegida para cadastrar novo funcionário de forma 100% automática (Exclusiva para Administradores)
router.post('/cadastrar', autenticarToken, async (req, res) => {
  const { nome, empresa, cnpj, regiao, cpf, data_nascimento, email, cargo, senha } = req.body;
  const adminId = req.user?.id || req.user?.sub || req.user?.userId;

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios (nome, email e senha).' });
  }

  try {
    const { data: admin, error: erroAdmin } = await supabaseAdmin
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

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: senha,
      email_confirm: true,
      user_metadata: {
        nome,
        empresa: empresa || admin.empresa,
        cnpj: cnpj || admin.cnpj,
        regiao: regiao || admin.regiao,
        cargo: cargo || 'operador'
      }
    });

    if (authError) {
      return res.status(400).json({ error: 'Erro ao criar credenciais automáticas: ' + authError.message });
    }

    const novoId = authData.user.id;

    const { data, error: dbError } = await supabaseAdmin
      .from('usuarios')
      .upsert([
        {
          id: novoId,
          nome,
          empresa: empresa || admin.empresa,
          cnpj: cnpj || admin.cnpj,
          regiao: regiao || admin.regiao,
          cpf: cpf || null,
          data_nascimento: data_nascimento || null,
          email: email.trim(),
          cargo: cargo || 'operador',
          senha, 
          data_cadastro: new Date().toISOString()
        }
      ], { onConflict: 'id' })
      .select();

    if (dbError) {
      console.error('Erro ao inserir na tabela usuarios:', dbError);
      return res.status(400).json({ error: dbError.message });
    }

    return res.status(201).json({ message: 'Funcionário cadastrado e pronto para uso automático!', data });
  } catch (err) {
    console.error('Erro interno no servidor ao cadastrar:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Rota para Exclusão Segura de Funcionário (Preserva integralmente o histórico de movimentações e produtos)
router.delete('/excluir', autenticarToken, async (req, res) => {
  const { nome, cpf, email, senha_admin } = req.body;
  const adminId = req.user?.id || req.user?.sub || req.user?.userId;

  if (!nome || !cpf || !email || !senha_admin) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios para confirmar a exclusão.' });
  }

  try {
    const { data: admin, error: erroAdmin } = await supabaseAdmin
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

    // Valida a senha do administrador na tabela ou via Supabase Auth
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

    const { data: funcionario, error: erroBusca } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .ilike('nome', nome.trim())
      .eq('cpf', cpf.trim())
      .ilike('email', email.trim())
      .maybeSingle();

    if (erroBusca || !funcionario) {
      return res.status(404).json({ 
        error: 'Funcionário não encontrado. Verifique se o Nome, CPF e E-mail coincidem exatamente com o registo.' 
      });
    }

    // Remove apenas o registo do utilizador. As tabelas de movimentações e produtos mantêm-se intactas.
    const { error: erroExclusao } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', funcionario.id);

    if (erroExclusao) {
      return res.status(400).json({ error: erroExclusao.message });
    }

    // Remove também do Supabase Auth para liberar o e-mail e revogar o acesso de login
    await supabaseAdmin.auth.admin.deleteUser(funcionario.id);

    return res.status(200).json({ message: 'Funcionário excluído com sucesso! Todo o histórico de movimentações e produtos foi preservado.' });
  } catch (err) {
    console.error('Erro interno ao processar exclusão:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

module.exports = router;
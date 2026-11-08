const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase'); 
const autenticarToken = require('../middlewares/auth');

// Cache em memória para os dados do perfil do utilizador (válido por 5 minutos)
const cachePerfil = new Map();
const TEMPO_CACHE_MS = 5 * 60 * 1000;

// Função auxiliar para validar requisitos de segurança da senha
function validarRequisitosSenha(senha) {
  const temTamanho = senha.length >= 6;
  const temMaiuscula = /[A-Z]/.test(senha);
  const temNumero = /[0-9]/.test(senha);
  const temEspecial = /[^A-Za-z0-9]/.test(senha);
  return temTamanho && temMaiuscula && temNumero && temEspecial;
}

// Função auxiliar para normalizar o cargo do utilizador
function formatarCargo(cargoBruto) {
  const cargoLower = String(cargoBruto || '').toLowerCase().trim();
  if (cargoLower === 'operador' || cargoLower === 'operator') return 'Operador';
  if (cargoLower === 'admin' || cargoLower === 'administrador') return 'Administrador';
  return cargoBruto ? String(cargoBruto).charAt(0).toUpperCase() + String(cargoBruto).slice(1) : 'Administrador';
}

// Rota de Login Flexível e Blindada
router.post('/login', async (req, res) => {
  const { email, password, senha } = req.body;
  const userPassword = password || senha;

  if (!email || !userPassword) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: email.trim(), 
      password: userPassword 
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (data.user?.id) {
      cachePerfil.delete(data.user.id);
    }

    // Busca o cargo detalhado na tabela de utilizadores para sincronização imediata
    const { data: userData } = await supabaseAdmin
      .from('usuarios')
      .select('cargo, empresa, regiao, ativo')
      .eq('id', data.user.id)
      .maybeSingle();

    if (userData && userData.ativo === false) {
      return res.status(403).json({ error: 'O acesso desta conta encontra-se desativado. Contacte o administrador.' });
    }

    const cargoFormatado = formatarCargo(userData?.cargo || data.user?.user_metadata?.cargo);
    const nomeUsuario = data.user?.user_metadata?.nome || data.user?.email?.split('@')[0] || 'Utilizador';

    return res.status(200).json({
      token: data.session.access_token,
      user: data.user,
      nome: nomeUsuario,
      cargo: cargoFormatado,
      empresa: userData?.empresa || data.user?.user_metadata?.empresa || 'Nexus Controller'
    });
  } catch (err) {
    console.error('Erro interno no servidor ao fazer login:', err);
    return res.status(500).json({ error: 'Erro interno no servidor ao fazer login.' });
  }
});

// Rota de Registo de Administrador com Convite Corporativo
router.post('/register', async (req, res) => {
  const { nome, empresa, cnpj, regiao, email, password, senha, codigoConvite } = req.body;
  const userPassword = password || senha;

  if (!email || !userPassword) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  if (!validarRequisitosSenha(userPassword)) {
    return res.status(400).json({ 
      error: 'A senha deve conter no mínimo 6 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial.' 
    });
  }

  if (!codigoConvite || !codigoConvite.trim()) {
    return res.status(403).json({ error: 'O código de convite corporativo é obrigatório.' });
  }

  const cnpjLimpo = cnpj ? cnpj.replace(/\D/g, '') : '';
  if (cnpjLimpo.length !== 14) {
    return res.status(400).json({ error: 'O CNPJ deve conter exatamente 14 dígitos numéricos válidos.' });
  }

  try {
    const codigoLimpo = codigoConvite.trim();

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

    if (conviteData.expires_at && new Date() > new Date(conviteData.expires_at)) {
      return res.status(403).json({ error: 'Este código de convite já expirou.' });
    }

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

    const payloadUsuario = {
      id: userId,
      nome: nome || 'Utilizador',
      email: email.trim(),
      empresa: empresa || conviteData.empresa_nome,
      cnpj: cnpj,
      regiao: regiao || 'Nacional / PR',
      cargo: 'Administrador',
      senha: userPassword,
      data_cadastro: new Date().toISOString(),
      ativo: true
    };

    const { error: dbError } = await supabaseAdmin
      .from('usuarios')
      .upsert([payloadUsuario], { onConflict: 'id' });

    if (dbError) {
      return res.status(400).json({ error: 'Erro ao salvar dados do utilizador: ' + dbError.message });
    }

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

// Rota de Redefinição Direta de Senha
router.post('/recuperar-senha-direta', async (req, res) => {
  const { email, novaSenha, codigoConvite } = req.body;

  if (!email || !novaSenha || !codigoConvite) {
    return res.status(400).json({ error: 'Preencha o e-mail, a nova senha e o código de recuperação.' });
  }

  if (!validarRequisitosSenha(novaSenha)) {
    return res.status(400).json({ 
      error: 'A nova senha deve conter no mínimo 6 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial.' 
    });
  }

  try {
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

    if (conviteData.expires_at && new Date() > new Date(conviteData.expires_at)) {
      return res.status(403).json({ error: 'Este código de recuperação expirou após 24 horas.' });
    }

    const { data: usuariosList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const utilizadorAuth = usuariosList?.users?.find(u => u.email.toLowerCase() === email.trim().toLowerCase());

    if (!utilizadorAuth) {
      return res.status(404).json({ error: 'E-mail corporativo não encontrado no sistema.' });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(utilizadorAuth.id, {
      password: novaSenha
    });

    if (updateError) throw updateError;

    cachePerfil.delete(utilizadorAuth.id);

    await supabaseAdmin
      .from('usuarios')
      .update({ senha: novaSenha })
      .eq('id', utilizadorAuth.id);

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

// Rota para o Administrador gerar uma nova Chave de Recuperação
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
      message: 'Chave de recuperação gerada com sucesso!', 
      codigo: data.codigo 
    });
  } catch (err) {
    console.error('Erro ao gerar chave de recuperação:', err);
    return res.status(500).json({ error: 'Erro interno ao gerar a chave.' });
  }
});

// Rota Otimizada com Cache em Memória para buscar o perfil do utilizador logado
router.get('/perfil', autenticarToken, async (req, res) => {
  try {
    const usuarioId = req.user?.id || req.user?.sub || req.user?.userId;
    const usuarioEmail = req.user?.email;
    const chaveCache = usuarioId || (usuarioEmail ? usuarioEmail.toLowerCase().trim() : null);

    if (chaveCache && cachePerfil.has(chaveCache)) {
      const itemCache = cachePerfil.get(chaveCache);
      if (Date.now() - itemCache.timestamp < TEMPO_CACHE_MS) {
        return res.json(itemCache.dados);
      }
      cachePerfil.delete(chaveCache);
    }

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

    const perfilFormatado = {
      id: usuario.id,
      nome: usuario.nome || 'Utilizador Nexus',
      email: usuario.email,
      cargo: formatarCargo(usuario.cargo || usuario.role),
      empresa: usuario.empresa || 'Nexus Controller',
      cnpj: usuario.cnpj || '12.345.678/0001-99',
      regiao: usuario.regiao || 'Nacional / PR',
      data_cadastro: usuario.data_cadastro || usuario.created_at,
      ativo: usuario.ativo !== false
    };

    if (chaveCache) {
      cachePerfil.set(chaveCache, { dados: perfilFormatado, timestamp: Date.now() });
    }

    return res.json(perfilFormatado);
  } catch (err) {
    console.error('Erro interno ao buscar perfil:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Rota para listar equipa com isolamento Multi-Tenant
async function listarEquipeDaEmpresa(req, res) {
  try {
    const usuarioId = req.user?.id || req.user?.sub;
    const { data: adminLogado } = await supabaseAdmin
      .from('usuarios')
      .select('empresa')
      .eq('id', usuarioId)
      .maybeSingle();

    if (!adminLogado || !adminLogado.empresa) {
      return res.status(401).json({ error: 'Empresa do administrador não identificada.' });
    }

    const { data: equipe, error: erroEquipe } = await supabaseAdmin
      .from('usuarios')
      .select('id, nome, email, cargo, cpf, data_nascimento, empresa, regiao, data_cadastro, ativo')
      .eq('empresa', adminLogado.empresa)
      .order('nome', { ascending: true });

    if (erroEquipe) {
      return res.status(400).json({ error: erroEquipe.message });
    }

    return res.status(200).json(equipe || []);
  } catch (err) {
    console.error('Erro interno ao listar equipa:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

router.get('/equipe', autenticarToken, listarEquipeDaEmpresa);
router.get('/', autenticarToken, listarEquipeDaEmpresa);

// Rota para Ativar ou Desativar o acesso de um funcionário
router.patch('/status/:id', autenticarToken, async (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;
  const adminId = req.user?.id || req.user?.sub;

  try {
    const { data: adminLogado } = await supabaseAdmin
      .from('usuarios')
      .select('cargo, empresa, email')
      .eq('id', adminId)
      .maybeSingle();

    if (!adminLogado) {
      return res.status(401).json({ error: 'Sessão de administrador inválida.' });
    }

    const cargoAdmin = (adminLogado.cargo || '').toLowerCase();
    if (cargoAdmin !== 'administrador' && cargoAdmin !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: apenas administradores podem alterar o status.' });
    }

    const { data: funcionario, error: erroBusca } = await supabaseAdmin
      .from('usuarios')
      .select('id, empresa, email')
      .eq('id', id)
      .eq('empresa', adminLogado.empresa)
      .maybeSingle();

    if (erroBusca || !funcionario) {
      return res.status(404).json({ error: 'Funcionário não encontrado na sua empresa.' });
    }

    if (funcionario.email.toLowerCase() === adminLogado.email.toLowerCase()) {
      return res.status(400).json({ error: 'Não é permitido desativar a sua própria conta ativa.' });
    }

    const { error: erroUpdate } = await supabaseAdmin
      .from('usuarios')
      .update({ ativo: Boolean(ativo) })
      .eq('id', id);

    if (erroUpdate) {
      return res.status(400).json({ error: erroUpdate.message });
    }

    cachePerfil.delete(id);

    return res.status(200).json({ 
      message: `Funcionário ${ativo ? 'ativado' : 'desativado'} com sucesso!` 
    });
  } catch (err) {
    console.error('Erro ao alterar status:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Rota protegida para cadastrar novo funcionário
router.post('/cadastrar', autenticarToken, async (req, res) => {
  const { nome, empresa, cnpj, regiao, cpf, data_nascimento, email, cargo, senha } = req.body;
  const adminId = req.user?.id || req.user?.sub || req.user?.userId;

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios (nome, email e senha).' });
  }

  if (!validarRequisitosSenha(senha)) {
    return res.status(400).json({ 
      error: 'A senha do funcionário deve conter no mínimo 6 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial.' 
    });
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
          data_cadastro: new Date().toISOString(),
          ativo: true
        }
      ], { onConflict: 'id' })
      .select();

    if (dbError) {
      return res.status(400).json({ error: dbError.message });
    }

    return res.status(201).json({ message: 'Funcionário cadastrado com sucesso!', data });
  } catch (err) {
    console.error('Erro interno no servidor ao cadastrar:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Rota para Exclusão Segura de Funcionário
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

    cachePerfil.delete(funcionario.id);

    const { error: erroExclusao } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', funcionario.id);

    if (erroExclusao) {
      return res.status(400).json({ error: erroExclusao.message });
    }

    await supabaseAdmin.auth.admin.deleteUser(funcionario.id);

    return res.status(200).json({ message: 'Funcionário excluído com sucesso!' });
  } catch (err) {
    console.error('Erro interno ao processar exclusão:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

module.exports = router;
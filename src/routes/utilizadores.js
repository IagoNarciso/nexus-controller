const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase'); 
const autenticarToken = require('../middlewares/auth');

// Usa o supabaseAdmin para evitar bloqueios de RLS nas operações do backend
const dbClient = supabaseAdmin || supabase;

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

// Rota para buscar o perfil do utilizador logado de forma flexível
router.get('/perfil', autenticarToken, async (req, res) => {
  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(404).json({ error: 'Utilizador não encontrado na base de dados.' });
    }

    // Busca detalhada opcional se faltarem campos na cache, ou usa o objeto direto
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
    const usuario = await obterDadosUsuario(req);

    if (!usuario || !usuario.empresa) {
      return res.status(401).json({ error: 'Empresa do utilizador não identificada.' });
    }

    // Busca APENAS os utilizadores da mesma empresa (Isolamento Multi-Tenant)
    const { data: equipe, error: erroEquipe } = await dbClient
      .from('usuarios')
      .select('id, nome, email, cargo, cpf, data_nascimento, empresa, regiao, data_cadastro')
      .eq('empresa', usuario.empresa)
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

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios (nome, email e senha).' });
  }

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Sessão de administrador inválida.' });
    }

    const cargoAdmin = (usuario.cargo || usuario.role || '').toLowerCase();
    if (cargoAdmin !== 'administrador' && cargoAdmin !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: apenas administradores podem cadastrar funcionários.' });
    }

    if (!usuario.empresa) {
      return res.status(400).json({ error: 'A conta de administrador não possui uma empresa associada.' });
    }

    // Dados corporativos herdados estritamente do Administrador logado
    const empresaHerdada = usuario.empresa;
    const cnpjHerdado = usuario.cnpj || '12.345.678/0001-99';
    const regiaoHerdada = regiao || usuario.regiao || 'Nacional / PR';
    const cargoDefinido = cargo || 'operador';

    let novoId;

    // Tenta criar o funcionário no Supabase Auth já com os metadados da empresa do Admin
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

    // Insere ou atualiza os dados detalhados na tabela `usuarios` forçando a empresa herdada
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

  if (!nome || !cpf || !email || !senha_admin) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios para confirmar a exclusão.' });
  }

  try {
    const usuario = await obterDadosUsuario(req);

    if (!usuario) {
      return res.status(401).json({ error: 'Sessão de administrador inválida.' });
    }

    const cargoAdmin = (usuario.cargo || usuario.role || '').toLowerCase();
    if (cargoAdmin !== 'administrador' && cargoAdmin !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: apenas administradores podem excluir funcionários.' });
    }

    if (usuario.senha && usuario.senha !== senha_admin) {
      return res.status(401).json({ error: 'Senha de administrador incorreta.' });
    } else if (!usuario.senha) {
      const { error: authCheckError } = await supabase.auth.signInWithPassword({
        email: usuario.email,
        password: senha_admin
      });
      if (authCheckError) {
        return res.status(401).json({ error: 'Senha de administrador incorreta.' });
      }
    }

    if (usuario.email.toLowerCase() === email.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Não é permitido excluir a própria conta de administrador ativa.' });
    }

    // Busca o funcionário garantindo que pertence estritamente à MESMA empresa do Admin
    const { data: funcionario, error: erroBusca } = await dbClient
      .from('usuarios')
      .select('*')
      .ilike('nome', nome.trim())
      .eq('cpf', cpf.trim())
      .ilike('email', email.trim())
      .eq('empresa', usuario.empresa)
      .maybeSingle();

    if (erroBusca || !funcionario) {
      return res.status(404).json({ 
        error: 'Funcionário não encontrado na sua empresa. Verifique se Nome, CPF e E-mail estão corretos.' 
      });
    }

    // Limpa o cache do funcionário excluído
    cacheUsuarios.delete(funcionario.id);

    // Remove o registo da tabela pública `usuarios`
    const { error: erroExclusao } = await dbClient
      .from('usuarios')
      .delete()
      .eq('id', funcionario.id)
      .eq('empresa', usuario.empresa);

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
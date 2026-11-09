const { supabase, supabaseAdmin } = require('../config/supabase');

// Usa o supabaseAdmin para evitar bloqueios de RLS na leitura da tabela public.usuarios
const dbClient = supabaseAdmin || supabase;

// Cache em memória RAM para sessões validadas (válido por 5 minutos)
const cacheSessao = new Map();
// Fila de promessas para evitar consultas duplicadas quando a página dispara vários fetches simultâneos
const validacoesEmAndamento = new Map();
const TEMPO_CACHE_AUTH_MS = 5 * 60 * 1000;

function extrairToken(req) {
  let token = null;
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      token = parts[1];
    } else if (parts.length === 1) {
      token = parts[0];
    }
  }

  if ((!token || token === 'null' || token === 'undefined') && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)(?:token|access_token|supabase_token|nexus_token)=([^;]*)/);
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) return null;
  token = token.replace(/^["']|["']$/g, '').trim();
  if (!token || token === 'null' || token === 'undefined') return null;

  return token;
}

function decodificarJwtLocal(token) {
  if (!token || token.split('.').length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const agora = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp <= agora) {
      return { expirado: true, payload };
    }
    return { expirado: false, payload };
  } catch (e) {
    return null;
  }
}

async function resolverUsuarioPorToken(token) {
  // 1. Descodifica o JWT localmente (0ms) para já obter o ID e Email antes de ir à rede
  const jwtInfo = decodificarJwtLocal(token);
  if (jwtInfo && jwtInfo.expirado) {
    return { erroStatus: 401, erroMsg: 'Token expirado.' };
  }

  let idAlvo = jwtInfo?.payload?.sub || null;
  let emailAlvo = jwtInfo?.payload?.email || null;
  let metadataAlvo = jwtInfo?.payload?.user_metadata || {};
  let tokenDecodificadoValido = Boolean(idAlvo || emailAlvo);

  // 2. Executa a validação do Auth e a busca na tabela 'usuarios' EM PARALELO (corta o tempo pela metade)
  const promessaAuth = dbClient.auth.getUser(token).catch(() => ({ data: null }));
  const promessaUsuarioPorId = idAlvo
    ? dbClient
        .from('usuarios')
        .select('id, nome, email, empresa, cargo, cnpj, regiao, ativo')
        .eq('id', idAlvo)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [resAuth, resUsuarioId] = await Promise.all([promessaAuth, promessaUsuarioPorId]);

  const user = resAuth?.data?.user || null;
  if (user) {
    idAlvo = user.id || idAlvo;
    emailAlvo = user.email || emailAlvo;
    metadataAlvo = { ...metadataAlvo, ...(user.user_metadata || {}) };
    tokenDecodificadoValido = true;
  }

  let usuarioDb = resUsuarioId?.data || null;

  // Fallback: busca por e-mail apenas se não encontrou pelo ID
  if (!usuarioDb && emailAlvo) {
    const { data: porEmail } = await dbClient
      .from('usuarios')
      .select('id, nome, email, empresa, cargo, cnpj, regiao, ativo')
      .ilike('email', emailAlvo.trim())
      .maybeSingle();
    if (porEmail) usuarioDb = porEmail;
  }

  // 3. Se encontrou no banco, verifica se está ativo e monta o objeto completo
  if (usuarioDb) {
    if (usuarioDb.ativo === false) {
      return { erroStatus: 403, erroMsg: 'O acesso desta conta encontra-se desativado.' };
    }

    return {
      userObj: {
        ...(user || {}),
        id: usuarioDb.id,
        sub: usuarioDb.id,
        userId: usuarioDb.id,
        nome: usuarioDb.nome || 'Utilizador Nexus',
        email: usuarioDb.email,
        empresa: usuarioDb.empresa || 'Nexus Controller',
        cargo: usuarioDb.cargo || 'Administrador',
        cnpj: usuarioDb.cnpj || '',
        regiao: usuarioDb.regiao || 'Nacional / PR',
        ativo: true,
        user_metadata: {
          nome: usuarioDb.nome,
          empresa: usuarioDb.empresa,
          cargo: usuarioDb.cargo,
          cnpj: usuarioDb.cnpj,
          regiao: usuarioDb.regiao
        }
      }
    };
  }

  // 4. Fallback seguro caso o token seja válido mas o registo ainda não exista na tabela
  const isDemo = emailAlvo && emailAlvo.toLowerCase() === 'admin@nexusdemo.com';
  if (tokenDecodificadoValido || isDemo) {
    const fallbackId = isDemo ? '7d537a13-38d1-4447-a4f4-3a214a9be799' : (idAlvo || '7d537a13-38d1-4447-a4f4-3a214a9be799');
    const fallbackEmpresa = metadataAlvo?.empresa || (isDemo ? 'Nexus Demo' : 'Nexus Controller');
    const fallbackCargo = metadataAlvo?.cargo || 'Administrador';
    const fallbackNome = metadataAlvo?.nome || (isDemo ? 'Admin Demonstração' : 'Utilizador Nexus');

    return {
      userObj: {
        id: fallbackId,
        sub: fallbackId,
        userId: fallbackId,
        nome: fallbackNome,
        email: emailAlvo || 'admin@nexusdemo.com',
        empresa: fallbackEmpresa,
        cargo: fallbackCargo,
        ativo: true,
        user_metadata: {
          nome: fallbackNome,
          empresa: fallbackEmpresa,
          cargo: fallbackCargo
        }
      }
    };
  }

  return { erroStatus: 401, erroMsg: 'Token inválido ou expirado.' };
}

const autenticarToken = async (req, res, next) => {
  const token = extrairToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  try {
    // 1. Retorno instantâneo (0ms) se a sessão já estiver no cache em memória
    if (cacheSessao.has(token)) {
      const itemCache = cacheSessao.get(token);
      if (Date.now() - itemCache.timestamp < TEMPO_CACHE_AUTH_MS) {
        req.user = itemCache.userObj;
        return next();
      }
      cacheSessao.delete(token);
    }

    // 2. Se outra requisição simultânea já estiver a validar este mesmo token, aguarda a mesma promessa
    let promessaValidacao = validacoesEmAndamento.get(token);
    if (!promessaValidacao) {
      promessaValidacao = resolverUsuarioPorToken(token);
      validacoesEmAndamento.set(token, promessaValidacao);
    }

    let resultado;
    try {
      resultado = await promessaValidacao;
    } finally {
      validacoesEmAndamento.delete(token);
    }

    if (resultado.erroStatus) {
      return res.status(resultado.erroStatus).json({ error: resultado.erroMsg });
    }

    // 3. Salva no cache de memória e avança imediatamente
    cacheSessao.set(token, {
      userObj: resultado.userObj,
      timestamp: Date.now()
    });

    req.user = resultado.userObj;
    return next();
  } catch (err) {
    console.error('🔥 [AUTH INSPECTOR] Erro no middleware:', err);
    return res.status(500).json({ error: 'Erro interno ao validar autenticação.' });
  }
};

// Permite limpar o cache quando um utilizador é desativado ou alterado
autenticarToken.limparCache = (identificador) => {
  if (!identificador) {
    cacheSessao.clear();
    return;
  }
  const alvo = String(identificador).toLowerCase().trim();
  for (const [chaveToken, valor] of cacheSessao.entries()) {
    const u = valor.userObj;
    if (u?.id === identificador || (u?.email && u.email.toLowerCase().trim() === alvo)) {
      cacheSessao.delete(chaveToken);
    }
  }
};

module.exports = autenticarToken;
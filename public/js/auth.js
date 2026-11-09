// --- INTERCEPTOR GLOBAL DE SESSÃO, TOKEN E DEDUPLICAÇÃO DE REQUISIÇÕES ---
(function () {
  // 1. Garante a recuperação rápida do token do Cookie para o LocalStorage se necessário
  let tokenInicial = localStorage.getItem('token');
  if (!tokenInicial) {
    const match = document.cookie.match(new RegExp('(^| )token=([^;]+)'));
    if (match) {
      tokenInicial = match[2];
      localStorage.setItem('token', tokenInicial);
    }
  }

  // 2. Se não houver token e não estiver na tela de login, redireciona imediatamente
  const isLoginPage = window.location.pathname.includes('login.html') || window.location.pathname === '/';
  if (!tokenInicial && !isLoginPage) {
    window.location.replace('login.html');
    return;
  }

  // Micro-cache em memória (4 segundos) e fila de requisições em andamento para evitar chamadas duplas no carregamento
  const getCache = new Map();
  const inFlightRequests = new Map();
  const CACHE_TTL_MS = 4000;

  const originalFetch = window.fetch;

  window.fetch = async function (url, options = {}) {
    const tokenAtual = localStorage.getItem('token');
    const urlStr = typeof url === 'string' ? url : url.toString();
    const isApiCall = urlStr.includes('/api/');
    const method = (options.method || 'GET').toUpperCase();

    // Injeta o token Bearer automaticamente em todas as chamadas à API
    if (isApiCall && tokenAtual) {
      options.headers = options.headers || {};
      if (options.headers instanceof Headers) {
        options.headers.set('Authorization', `Bearer ${tokenAtual}`);
      } else {
        options.headers['Authorization'] = `Bearer ${tokenAtual}`;
      }
    }

    // Se for uma mutação (POST, PUT, PATCH, DELETE), limpa o micro-cache para garantir dados 100% frescos a seguir
    if (isApiCall && method !== 'GET') {
      getCache.clear();
      inFlightRequests.clear();
    }

    // Deduplicação e Micro-Cache para chamadas GET da API (elimina pesquisas duplas no carregamento da página)
    if (isApiCall && method === 'GET' && !options.noCache) {
      const cached = getCache.get(urlStr);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return new Response(cached.bodyText, {
          status: cached.status,
          statusText: cached.statusText,
          headers: cached.headers
        });
      }

      // Se já existir uma requisição idêntica em andamento neste exato milissegundo, aguarda a mesma promessa
      if (inFlightRequests.has(urlStr)) {
        const sharedResult = await inFlightRequests.get(urlStr);
        return new Response(sharedResult.bodyText, {
          status: sharedResult.status,
          statusText: sharedResult.statusText,
          headers: sharedResult.headers
        });
      }

      const fetchPromise = (async () => {
        const response = await originalFetch(url, options);

        if (response.status === 401 && !window.location.pathname.includes('login.html')) {
          limparSessaoERedirecionar();
        }

        const bodyText = await response.text();
        const snapshot = {
          bodyText,
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
          timestamp: Date.now()
        };

        if (response.ok) {
          getCache.set(urlStr, snapshot);
        }

        return snapshot;
      })();

      inFlightRequests.set(urlStr, fetchPromise);

      try {
        const result = await fetchPromise;
        return new Response(result.bodyText, {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers
        });
      } finally {
        inFlightRequests.delete(urlStr);
      }
    }

    // Execução normal para POST/PUT/DELETE ou chamadas externas
    const response = await originalFetch(url, options);

    if (response.status === 401 && !window.location.pathname.includes('login.html')) {
      limparSessaoERedirecionar();
    }

    return response;
  };
})();

function limparSessaoERedirecionar() {
  localStorage.removeItem('token');
  localStorage.removeItem('nexus_user');
  localStorage.removeItem('nexus_user_name');
  localStorage.removeItem('nexus_user_role');
  localStorage.removeItem('nexus_user_nivel');
  localStorage.removeItem('nexus_user_empresa');
  document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
  window.location.replace('login.html');
}

function normalizarCargoUI(cargoBruto) {
  if (!cargoBruto) return 'Administrador';
  const cargoLower = String(cargoBruto).toLowerCase().trim();
  if (cargoLower === 'operador' || cargoLower === 'operator') return 'Operador';
  if (cargoLower === 'admin' || cargoLower === 'administrador') return 'Administrador';
  return String(cargoBruto).charAt(0).toUpperCase() + String(cargoBruto).slice(1);
}

function aplicarDadosUsuarioNaUI(nome, cargo, empresa) {
  const elUserName = document.getElementById('userName');
  const elUserRole = document.getElementById('userRole');
  const elUserAvatar = document.getElementById('userAvatar');
  const elWelcomeName = document.getElementById('welcomeName');
  const elEmpresaDestaque = document.getElementById('nomeEmpresaDestaque');
  const elSolSolicitante = document.getElementById('solSolicitante');

  if (nome) {
    if (elUserName) elUserName.textContent = nome;
    if (elWelcomeName) elWelcomeName.textContent = nome.split(' ')[0];
    if (elSolSolicitante && !elSolSolicitante.value) elSolSolicitante.value = nome;

    if (elUserAvatar) {
      const iniciais = nome
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      elUserAvatar.textContent = iniciais || 'NX';
    }
  }

  if (cargo && elUserRole) {
    elUserRole.textContent = normalizarCargoUI(cargo);
  }

  if (empresa && elEmpresaDestaque) {
    elEmpresaDestaque.textContent = empresa;
  }
}

// Sincronização imediata (Zero-Latency) do cabeçalho e botões globais em qualquer página
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Remove botões de tema duplicados caso o theme.js tenha injetado um extra
  const botoesTema = document.querySelectorAll('#btnThemeToggle, #themeToggleBtn');
  if (botoesTema.length > 1) {
    for (let i = 1; i < botoesTema.length; i++) {
      botoesTema[i].remove();
    }
  }

  // 2. Vincula o Logout globalmente (evita código repetido nos outros JS)
  const botoesLogout = document.querySelectorAll('#logoutBtn, #logoutBtnSidebar');
  botoesLogout.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      limparSessaoERedirecionar();
    });
  });

  // 3. Preenche o E-mail salvo na tela de Login (Lembrar de mim)
  const emailSalvo = localStorage.getItem('nexus_lembrar_email');
  if (emailSalvo) {
    const inputEmail = document.getElementById('login-email');
    const checkLembrar = document.getElementById('remember-me');
    if (inputEmail) inputEmail.value = emailSalvo;
    if (checkLembrar) checkLembrar.checked = true;
  }

  // 4. Hidrata o cabeçalho instantaneamente via LocalStorage (0ms de espera)
  const nomeSalvo = localStorage.getItem('nexus_user_name');
  const cargoSalvo = localStorage.getItem('nexus_user_role') || localStorage.getItem('nexus_user_nivel');
  const empresaSalva = localStorage.getItem('nexus_user_empresa');

  aplicarDadosUsuarioNaUI(nomeSalvo, cargoSalvo, empresaSalva);

  // 5. Apenas consulta /api/utilizadores/perfil se faltar algum dado essencial no LocalStorage
  const token = localStorage.getItem('token');
  const isLoginPage = window.location.pathname.includes('login.html') || window.location.pathname === '/';

  if (token && !isLoginPage && (!nomeSalvo || !cargoSalvo)) {
    try {
      const res = await fetch('/api/utilizadores/perfil');
      if (res.ok) {
        const perfil = await res.json();
        const cargoFmt = normalizarCargoUI(perfil.cargo);
        localStorage.setItem('nexus_user', JSON.stringify(perfil));
        localStorage.setItem('nexus_user_name', perfil.nome || 'Utilizador');
        localStorage.setItem('nexus_user_role', cargoFmt);
        localStorage.setItem('nexus_user_nivel', cargoFmt);
        localStorage.setItem('nexus_user_empresa', perfil.empresa || 'Nexus Controller');
        aplicarDadosUsuarioNaUI(perfil.nome, cargoFmt, perfil.empresa);
      }
    } catch (err) {
      // Silencioso para não bloquear a interface
    }
  }
});

// Função de Login Principal no Frontend (Redirecionamento Instantâneo sem Delay)
async function handleLoginComLembrar(event) {
  if (event) event.preventDefault();

  const emailInput = document.getElementById('login-email')?.value;
  const passwordInput = document.getElementById('login-password')?.value;
  const rememberCheck = document.getElementById('remember-me')?.checked;
  const alertMsg = document.getElementById('alert-msg');

  if (!emailInput || !passwordInput) {
    alert('Por favor, preencha o e-mail e a senha.');
    return;
  }

  if (rememberCheck) {
    localStorage.setItem('nexus_lembrar_email', emailInput);
  } else {
    localStorage.removeItem('nexus_lembrar_email');
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput, password: passwordInput })
    });

    const resultado = await response.json();

    if (response.ok && (resultado.token || resultado.session?.access_token)) {
      const tokenToSave = resultado.token || resultado.session.access_token;
      const userObj = resultado.user || resultado.usuario || {};

      const nomeFinal = resultado.nome || userObj.nome || userObj.user_metadata?.nome || emailInput.split('@')[0];
      const cargoFinal = normalizarCargoUI(
        resultado.cargo || resultado.role || userObj.cargo || userObj.role || userObj.user_metadata?.cargo
      );
      const empresaFinal = resultado.empresa || userObj.empresa || userObj.user_metadata?.empresa || 'Nexus Controller';

      localStorage.setItem('token', tokenToSave);
      localStorage.setItem('nexus_user', JSON.stringify(userObj));
      localStorage.setItem('nexus_user_name', nomeFinal);
      localStorage.setItem('nexus_user_role', cargoFinal);
      localStorage.setItem('nexus_user_nivel', cargoFinal);
      localStorage.setItem('nexus_user_empresa', empresaFinal);

      document.cookie = `token=${tokenToSave}; path=/; max-age=86400; SameSite=Lax`;

      // Redirecionamento imediato (sem setTimeout desnecessário)
      window.location.replace('dashboard.html');
    } else {
      if (alertMsg) {
        alertMsg.className = 'p-4 rounded-xl text-sm border font-medium bg-red-50 text-red-700 border-red-200';
        alertMsg.textContent = resultado.error || 'Erro ao realizar login.';
        alertMsg.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Erro na requisição de login:', err);
    if (alertMsg) {
      alertMsg.className = 'p-4 rounded-xl text-sm border font-medium bg-red-50 text-red-700 border-red-200';
      alertMsg.textContent = 'Erro de conexão com o servidor.';
      alertMsg.classList.remove('hidden');
    }
  }
}

async function handleLogin(event) {
  return handleLoginComLembrar(event);
}

async function handleRegister(event) {
  event.preventDefault();

  const nome = document.getElementById('reg-name')?.value;
  const empresa = document.getElementById('reg-company')?.value;
  const cnpj = document.getElementById('reg-cnpj')?.value;
  const regiao = document.getElementById('reg-region')?.value;
  const codigoConvite = document.getElementById('reg-invite-code')?.value;
  const email = document.getElementById('reg-email')?.value;
  const senha = document.getElementById('reg-password')?.value;
  const confirmarSenha = document.getElementById('reg-confirm-password')?.value;
  const alertMsg = document.getElementById('alert-msg');

  const temTamanho = senha.length >= 6;
  const temMaiuscula = /[A-Z]/.test(senha);
  const temNumero = /[0-9]/.test(senha);
  const temEspecial = /[^A-Za-z0-9]/.test(senha);

  if (!temTamanho || !temMaiuscula || !temNumero || !temEspecial) {
    if (alertMsg) {
      alertMsg.className = 'p-4 rounded-xl text-sm border font-medium bg-red-50 text-red-700 border-red-200';
      alertMsg.textContent = 'A senha não atende aos requisitos de segurança.';
      alertMsg.classList.remove('hidden');
    }
    return;
  }

  if (senha !== confirmarSenha) {
    if (alertMsg) {
      alertMsg.className = 'p-4 rounded-xl text-sm border font-medium bg-red-50 text-red-700 border-red-200';
      alertMsg.textContent = 'As senhas não coincidem.';
      alertMsg.classList.remove('hidden');
    }
    return;
  }

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, empresa, cnpj, regiao, codigoConvite, email, senha })
    });

    const resultado = await response.json();

    if (response.ok) {
      if (alertMsg) {
        alertMsg.className = 'p-4 rounded-xl text-sm border font-medium bg-emerald-50 text-emerald-700 border-emerald-200';
        alertMsg.textContent = 'Conta criada com sucesso! Redirecionando...';
        alertMsg.classList.remove('hidden');
      }
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      if (alertMsg) {
        alertMsg.className = 'p-4 rounded-xl text-sm border font-medium bg-red-50 text-red-700 border-red-200';
        alertMsg.textContent = resultado.error || 'Erro ao criar conta.';
        alertMsg.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Erro no registo:', err);
  }
}

function mascaraCNPJ(input) {
  let valor = input.value.replace(/\D/g, '');
  if (valor.length > 14) valor = valor.substring(0, 14);

  if (valor.length > 12) {
    valor = valor.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  } else if (valor.length > 8) {
    valor = valor.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})$/, '$1.$2.$3/$4');
  } else if (valor.length > 5) {
    valor = valor.replace(/^(\d{2})(\d{3})(\d{0,3})$/, '$1.$2.$3');
  } else if (valor.length > 2) {
    valor = valor.replace(/^(\d{2})(\d{0,3})$/, '$1.$2');
  }

  input.value = valor;
}

async function enviarRecuperacaoDireta(event) {
  event.preventDefault();

  const email = document.getElementById('rec-email')?.value;
  const novaSenha = document.getElementById('rec-nova-senha')?.value;
  const codigoConvite = document.getElementById('rec-codigo')?.value;
  const alertBox = document.getElementById('rec-alert');

  try {
    const response = await fetch('/api/auth/recuperar-senha-direta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, novaSenha, codigoConvite })
    });

    const resultado = await response.json();

    if (response.ok) {
      if (alertBox) {
        alertBox.className = 'rounded-xl p-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 mb-3';
        alertBox.textContent = resultado.message || 'Senha redefinida com sucesso!';
        alertBox.classList.remove('hidden');
      }
      setTimeout(() => {
        fecharModalRecuperacao();
      }, 1500);
    } else {
      if (alertBox) {
        alertBox.className = 'rounded-xl p-3 text-xs bg-red-50 text-red-700 border border-red-200 mb-3';
        alertBox.textContent = resultado.error || 'Erro ao redefinir senha.';
        alertBox.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Erro na recuperação de senha:', err);
  }
}

function toggleAuthMode() {
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formTitle = document.getElementById('form-title');
  const formSubtitle = document.getElementById('form-subtitle');
  const toggleText = document.getElementById('toggle-text');
  const toggleBtn = document.getElementById('toggle-btn');

  if (formLogin.classList.contains('hidden')) {
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
    formTitle.textContent = 'Bem-vindo de volta';
    formSubtitle.textContent = 'Acesse sua conta para continuar gerenciando sua empresa.';
    toggleText.textContent = 'Ainda não tem uma conta?';
    toggleBtn.textContent = 'Cadastre sua empresa';
  } else {
    formLogin.classList.add('hidden');
    formRegister.classList.remove('hidden');
    formTitle.textContent = 'Crie sua conta';
    formSubtitle.textContent = 'Insira seus dados corporativos e a chave mestre para começar.';
    toggleText.textContent = 'Já tem uma conta?';
    toggleBtn.textContent = 'Faça login';
  }
}

function abrirModalRecuperacao(event) {
  event.preventDefault();
  const modal = document.getElementById('modal-recuperacao');
  if (modal) modal.classList.remove('hidden');
}

function fecharModalRecuperacao() {
  const modal = document.getElementById('modal-recuperacao');
  if (modal) modal.classList.add('hidden');
}

function togglePassword(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.style.opacity = '0.5';
  } else {
    input.type = 'password';
    if (icon) icon.style.opacity = '1';
  }
}

async function loginDemo() {
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');

  if (emailInput) emailInput.value = 'admin@nexusdemo.com';
  if (passwordInput) passwordInput.value = 'demo123';

  const form = document.getElementById('form-login');
  if (form) {
    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submitEvent);
  }
}
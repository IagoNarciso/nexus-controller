// --- INTERCEPTOR GLOBAL DE SESSÃO E TOKEN ---
(function() {
  // 1. Garante a recuperação do token do Cookie para o LocalStorage se necessário
  let token = localStorage.getItem('token');
  if (!token) {
    const match = document.cookie.match(new RegExp('(^| )token=([^;]+)'));
    if (match) {
      token = match[2];
      localStorage.setItem('token', token);
    }
  }

  // 2. Se não houver token em lado nenhum, manda de volta para o login de forma segura
  if (!token && !window.location.pathname.includes('login.html')) {
    window.location.href = 'login.html';
    return;
  }

  // 3. Intercepta o fetch globalmente para injetar o token Bearer automaticamente em todas as chamadas à API
  const originalFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    options.headers = options.headers || {};
    
    // Se for uma rota da API e tivermos o token, injeta no cabeçalho
    if (typeof url === 'string' && url.includes('/api/') && token) {
      if (options.headers instanceof Headers) {
        options.headers.set('Authorization', `Bearer ${token}`);
      } else {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await originalFetch(url, options);

    // Se o servidor retornar 401 (Unauthorized), limpa a sessão e redireciona para o login
    if (response.status === 401 && !window.location.pathname.includes('login.html')) {
      console.warn("⚠️ Sessão expirada ou inválida (401). Redirecionando para o login...");
      localStorage.removeItem('token');
      localStorage.removeItem('nexus_user');
      localStorage.removeItem('nexus_user_name');
      localStorage.removeItem('nexus_user_role');
      window.location.href = 'login.html';
    }

    return response;
  };
})();

// Sincronização automática do cabeçalho em qualquer página (Dashboard, Produtos, etc.)
document.addEventListener('DOMContentLoaded', () => {
  const nomeSalvo = localStorage.getItem('nexus_user_name');
  const cargoSalvo = localStorage.getItem('nexus_user_role') || localStorage.getItem('nexus_user_nivel');

  const elUserName = document.getElementById('userName');
  const elUserRole = document.getElementById('userRole');
  const elUserAvatar = document.getElementById('userAvatar');

  if (elUserName && nomeSalvo) {
    elUserName.textContent = nomeSalvo;
  }

  if (elUserRole && cargoSalvo) {
    const cargoLower = cargoSalvo.toLowerCase().trim();
    let cargoFormatado = 'Administrador';
    if (cargoLower === 'operador' || cargoLower === 'operator') {
      cargoFormatado = 'Operador';
    } else if (cargoLower === 'admin' || cargoLower === 'administrador') {
      cargoFormatado = 'Administrador';
    } else {
      cargoFormatado = cargoSalvo.charAt(0).toUpperCase() + cargoSalvo.slice(1);
    }
    elUserRole.textContent = cargoFormatado;
  }

  if (elUserAvatar && nomeSalvo) {
    const iniciais = nomeSalvo
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    elUserAvatar.textContent = iniciais;
  }

  const emailSalvo = localStorage.getItem('nexus_lembrar_email');
  if (emailSalvo) {
    const inputEmail = document.getElementById('login-email');
    const checkLembrar = document.getElementById('remember-me');
    if (inputEmail) inputEmail.value = emailSalvo;
    if (checkLembrar) checkLembrar.checked = true;
  }
});

// Função de Login Principal no Frontend (Com suporte a Lembrar de Mim)
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
    console.log("Resposta recebida do login:", resultado);

    if (response.ok && (resultado.token || resultado.session?.access_token)) {
      const tokenToSave = resultado.token || resultado.session.access_token;
      const userObj = resultado.user || resultado.usuario || {};
      
      const nomeFinal = resultado.nome || userObj.nome || userObj.user_metadata?.nome || emailInput.split('@')[0];
      const cargoFinal = resultado.cargo || resultado.role || userObj.cargo || userObj.role || userObj.user_metadata?.cargo || 'Administrador';

      localStorage.setItem('token', tokenToSave);
      localStorage.setItem('nexus_user', JSON.stringify(userObj));
      localStorage.setItem('nexus_user_name', nomeFinal);
      localStorage.setItem('nexus_user_role', cargoFinal);
      localStorage.setItem('nexus_user_nivel', cargoFinal);
      localStorage.setItem('nexus_user_empresa', resultado.empresa || userObj.empresa || 'Nexus Controller');
      
      document.cookie = `token=${tokenToSave}; path=/; max-age=86400; SameSite=Lax`;

      console.log("Token, Nome e Cargo gravados com sucesso no Storage e Cookie!");

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 150);
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
      }, 2000);
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
      }, 2500);
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
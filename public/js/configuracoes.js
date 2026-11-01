let isRedirectingConfig = false;

// Função centralizada para requisições autenticadas e prevenção de loop 401
async function fetchSeguraConfig(url, options = {}) {
  // Procura o token em qualquer uma das chaves possíveis gravadas no login
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) {
    encerrarSessaoInvalida();
    return null;
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    'Authorization': `Bearer ${token}`
  };

  try {
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      encerrarSessaoInvalida();
      return null;
    }

    return response;
  } catch (error) {
    throw error;
  }
}

function encerrarSessaoInvalida() {
  if (isRedirectingConfig) return;
  isRedirectingConfig = true;

  console.warn('Sessão expirada ou inválida (401). A limpar dados e redirecionar...');
  localStorage.removeItem('token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('nexus_token');
  localStorage.removeItem('nexus_user');
  localStorage.removeItem('nexus_user_name');
  localStorage.clear();
  sessionStorage.clear();

  window.location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', () => {
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) {
    encerrarSessaoInvalida();
    return;
  }

  carregarInfoUtilizador();
  carregarPreferenciasSalvas(); // Carrega as preferências guardadas nos inputs
  aplicarControlePermissoes(); // Esconde secções restritas se for Operador
  carregarConfiguracoes();
  setupFormConfiguracoes();
  setupFormNovoOperador();
  setupFormExcluirOperador(); // Configura a exclusão segura de funcionários
  setupGerarChaveRecuperacao(); // Configura geração de chave 24h se o botão existir na tela
  setupCustomDropdown(); // Configura o dropdown customizado de cargos
  setupCpfMask();
  setupDataNascimentoMask();
  setupModalSuporte();
});

// Aplica restrições visuais baseadas no cargo (Administrador vs. Operador)
function aplicarControlePermissoes() {
  let userObj = {};
  try {
    userObj = JSON.parse(
      localStorage.getItem('nexus_user') ||
      localStorage.getItem('user') ||
      localStorage.getItem('usuario') ||
      '{}'
    );
  } catch (e) {}

  let jwtPayload = {};
  try {
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('nexus_token');
    if (token && token.includes('.')) {
      jwtPayload = JSON.parse(atob(token.split('.')[1]));
    }
  } catch (e) {}

  const rawRole =
    localStorage.getItem('nexus_user_role') ||
    localStorage.getItem('nexus_user_nivel') ||
    localStorage.getItem('user_role') ||
    localStorage.getItem('role') ||
    localStorage.getItem('nivel') ||
    userObj.role ||
    userObj.nivel ||
    userObj.cargo ||
    userObj.perfil ||
    jwtPayload.role ||
    jwtPayload.nivel ||
    jwtPayload.cargo ||
    'Administrador';

  const roleLower = String(rawRole).toLowerCase().trim();
  
  // Validação estrita: só é operador se o cargo for explicitamente operador ou operator
  const isOperador = roleLower === 'operador' || roleLower === 'operator';

  // Se for Operador, ocultamos a secção de Gerenciamento de Utilizadores e a de Segurança/Chave
  if (isOperador) {
    const secaoGerenciamento =
      document.getElementById('secaoGerenciamentoUtilizadores') ||
      document.getElementById('formNovoOperador')?.closest('div.bg-white, div.dark\\:bg-\\[\\#121E1A\\]');

    if (secaoGerenciamento) {
      secaoGerenciamento.style.display = 'none';
    }

    const secaoChave = document.getElementById('secaoSegurancaChave');
    if (secaoChave) {
      secaoChave.remove();
    }
  } else {
    // Garante que para Administrador o cargo fica correto e o painel visível
    localStorage.setItem('nexus_user_role', 'Administrador');
    const secaoChave = document.getElementById('secaoSegurancaChave');
    if (secaoChave) {
      secaoChave.classList.remove('hidden');
    }
  }
}

// Carrega as preferências salvas no localStorage para marcar os checkboxes corretamente
function carregarPreferenciasSalvas() {
  try {
    const prefsSalvas = JSON.parse(localStorage.getItem('nexus_prefs'));
    if (prefsSalvas) {
      const elAlerta = document.getElementById('cfgAlertaEstoque');
      const elCompacto = document.getElementById('cfgModoCompacto');

      if (elAlerta && typeof prefsSalvas.alertaEstoque === 'boolean') {
        elAlerta.checked = prefsSalvas.alertaEstoque;
      }
      if (elCompacto && typeof prefsSalvas.modoCompacto === 'boolean') {
        elCompacto.checked = prefsSalvas.modoCompacto;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar preferências locais:', err);
  }
}

// Atualiza o nome, e-mail, cargo, avatar e as informações do card de perfil na página
function carregarInfoUtilizador() {
  let userObj = {};
  try {
    userObj = JSON.parse(
      localStorage.getItem('nexus_user') ||
      localStorage.getItem('user') ||
      localStorage.getItem('usuario') ||
      '{}'
    );
  } catch (e) {}

  const nomeUtilizador = 
    localStorage.getItem('nexus_user_name') || 
    userObj.nome || 
    'Utilizador Nexus';

  const emailUtilizador = 
    localStorage.getItem('nexus_user_email') || 
    userObj.email || 
    'utilizador@nexus.com';

  // Sincroniza o cargo de forma rigorosa unificada com a topbar
  const rawCargo = 
    localStorage.getItem('nexus_user_role') || 
    userObj.role || 
    userObj.cargo || 
    'Administrador';

  const cargoLower = String(rawCargo).toLowerCase().trim();
  let cargoUtilizador = 'Administrador';
  if (cargoLower === 'operador' || cargoLower === 'operator') {
    cargoUtilizador = 'Operador';
  } else if (cargoLower === 'admin' || cargoLower === 'administrador') {
    cargoUtilizador = 'Administrador';
  } else {
    cargoUtilizador = String(rawCargo).charAt(0).toUpperCase() + String(rawCargo).slice(1);
  }

  localStorage.setItem('nexus_user_role', cargoUtilizador);

  const empresaUtilizador = localStorage.getItem('nexus_user_empresa') || 'Nexus Controller';
  const cnpjUtilizador = localStorage.getItem('nexus_user_cnpj') || '12.345.678/0001-99';
  const regiaoUtilizador = localStorage.getItem('nexus_user_regiao') || 'Nacional / PR';
  const dataCriacaoUtilizador = localStorage.getItem('nexus_user_datacriacao') || '21/10/2026';

  // Iniciais
  const iniciais =
    nomeUtilizador
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'NX';

  // 1. Atualizar Topbar
  const elUserName = document.getElementById('userName');
  if (elUserName) elUserName.textContent = nomeUtilizador;

  const elUserRole = document.getElementById('userRole');
  if (elUserRole) elUserRole.textContent = cargoUtilizador;

  const elUserAvatar = document.getElementById('userAvatar');
  if (elUserAvatar) elUserAvatar.textContent = iniciais;

  // 2. Atualizar Card de Perfil na Página de Configurações
  const cfgUserAvatar = document.getElementById('cfgUserAvatar');
  const cfgProfileName = document.getElementById('cfgProfileName');
  const cfgProfileEmail = document.getElementById('cfgProfileEmail');
  const cfgProfileRole = document.getElementById('cfgProfileRole');

  if (cfgUserAvatar) cfgUserAvatar.textContent = iniciais;
  if (cfgProfileName) cfgProfileName.textContent = nomeUtilizador;
  if (cfgProfileEmail) cfgProfileEmail.textContent = emailUtilizador;
  
  if (cfgProfileRole) {
    cfgProfileRole.textContent = cargoUtilizador;
    if (cargoUtilizador === 'Operador') {
      cfgProfileRole.className = 'px-2 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/80 rounded-full border border-amber-200 dark:border-amber-800/60';
    } else {
      cfgProfileRole.className = 'px-2 py-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/80 rounded-full border border-emerald-200 dark:border-emerald-800/60';
    }
  }

  // 3. Preencher Inputs do Formulário (Dados Pessoais e Corporativos)
  const inputNome = document.getElementById('cfgNome');
  const inputEmail = document.getElementById('cfgEmail');
  const inputEmpresa = document.getElementById('cfgEmpresa');
  const inputCnpj = document.getElementById('cfgCnpj');
  const inputRegiao = document.getElementById('cfgRegiao');
  const inputDataCriacao = document.getElementById('cfgDataCriacao');

  if (inputNome) inputNome.value = nomeUtilizador;
  if (inputEmail) inputEmail.value = emailUtilizador;
  if (inputEmpresa) inputEmpresa.value = empresaUtilizador;
  if (inputCnpj) inputCnpj.value = cnpjUtilizador;
  if (inputRegiao) inputRegiao.value = regiaoUtilizador;
  if (inputDataCriacao) inputDataCriacao.value = dataCriacaoUtilizador;
}

// 1. Carregar Dados Reais do Banco de Dados / API
async function carregarConfiguracoes() {
  try {
    let res = await fetchSeguraConfig('/api/utilizador/perfil');
    if (res && res.status === 404) {
      res = await fetchSeguraConfig('/api/auth/perfil');
    }

    if (!res) return;

    if (res.ok) {
      const data = await res.json();

      const nomeServidor = data.nome || localStorage.getItem('nexus_user_name') || 'Utilizador Nexus';
      const emailServidor = data.email || localStorage.getItem('nexus_user_email') || 'utilizador@nexus.com';
      
      // Normaliza o cargo recebido do servidor para evitar conflitos de texto
      const rawCargoServidor = data.cargo || data.role || localStorage.getItem('nexus_user_role') || 'Administrador';
      const cargoServidorLower = String(rawCargoServidor).toLowerCase().trim();
      let cargoServidor = 'Administrador';
      if (cargoServidorLower === 'operador' || cargoServidorLower === 'operator') {
        cargoServidor = 'Operador';
      } else if (cargoServidorLower === 'admin' || cargoServidorLower === 'administrador') {
        cargoServidor = 'Administrador';
      } else {
        cargoServidor = String(rawCargoServidor).charAt(0).toUpperCase() + String(rawCargoServidor).slice(1);
      }

      const empresaServidor = data.empresa || 'Nexus Controller';
      const cnpjServidor = data.cnpj || '12.345.678/0001-99';
      const regiaoServidor = data.regiao || 'Nacional / PR';

      let dataFormatada = '21/10/2026';
      if (data.data_cadastro) {
        dataFormatada = new Date(data.data_cadastro).toLocaleDateString('pt-BR');
      }

      localStorage.setItem('nexus_user_name', nomeServidor);
      localStorage.setItem('nexus_user_email', emailServidor);
      localStorage.setItem('nexus_user_role', cargoServidor);
      localStorage.setItem('nexus_user_empresa', empresaServidor);
      localStorage.setItem('nexus_user_cnpj', cnpjServidor);
      localStorage.setItem('nexus_user_regiao', regiaoServidor);
      localStorage.setItem('nexus_user_datacriacao', dataFormatada);

      carregarInfoUtilizador();
      aplicarControlePermissoes();
    }
  } catch (err) {
    console.warn('Erro ao carregar perfil, utilizando cache local:', err);
  }
}

// Função auxiliar para exibir notificação flutuante moderna (Toast)
function mostrarNotificacaoToast(mensagem, tipo = 'sucesso') {
  let container = document.getElementById('toastContainerNtf');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainerNtf';
    container.className = 'fixed bottom-5 right-5 z-50 flex flex-col space-y-2';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const corBg = tipo === 'sucesso' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white';

  toast.className = `px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center space-x-2 transition-all transform translate-y-2 opacity-0 ${corBg}`;
  toast.innerHTML = `
    <i class="fa-solid ${tipo === 'sucesso' ? 'fa-circle-check' : 'fa-circle-exclamation'} text-sm"></i>
    <span>${mensagem}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Função auxiliar para exibir o Modal de Confirmação Customizado (substitui o window.confirm)
function mostrarConfirmacaoCustomizada(mensagem) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirmacaoCustom');
    const content = document.getElementById('modalConfirmacaoContent');
    const texto = document.getElementById('modalConfirmacaoTexto');
    const btnSim = document.getElementById('btnAceitarConfirmacao');
    const btnNao = document.getElementById('btnCancelarConfirmacao');

    if (!modal || !content) {
      // Fallback de segurança caso o modal não exista no HTML
      resolve(confirm(mensagem));
      return;
    }

    if (texto) texto.textContent = mensagem;
    modal.classList.remove('hidden');
    
    // Animação suave de entrada
    setTimeout(() => {
      content.classList.remove('scale-95', 'opacity-0');
      content.classList.add('scale-100', 'opacity-100');
    }, 10);

    const fechar = (resposta) => {
      content.classList.remove('scale-100', 'opacity-100');
      content.classList.add('scale-95', 'opacity-0');
      setTimeout(() => {
        modal.classList.add('hidden');
        resolve(resposta);
      }, 150);
    };

    btnSim.onclick = () => fechar(true);
    btnNao.onclick = () => fechar(false);
    modal.onclick = (e) => {
      if (e.target === modal) fechar(false);
    };
  });
}

// 2. Salvar Alterações do Formulário de Perfil e Preferências
function setupFormConfiguracoes() {
  const form = document.getElementById('formConfiguracoes');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const novoNome = document.getElementById('cfgNome')?.value;
    const alertaEstoque = document.getElementById('cfgAlertaEstoque')?.checked;
    const modoCompacto = document.getElementById('cfgModoCompacto')?.checked;

    const preferencias = {
      alertaEstoque: Boolean(alertaEstoque),
      modoCompacto: Boolean(modoCompacto)
    };

    localStorage.setItem('nexus_prefs', JSON.stringify(preferencias));

    const payload = {
      nome: novoNome,
      preferencias
    };

    try {
      const res = await fetchSeguraConfig('/api/utilizador/perfil', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      if (!res) return;

      if (novoNome) {
        localStorage.setItem('nexus_user_name', novoNome);
        carregarInfoUtilizador();
      }

      if (res.ok) {
        mostrarNotificacaoToast('Configurações e preferências salvas com sucesso!', 'sucesso');
      } else {
        mostrarNotificacaoToast('Configurações atualizadas com sucesso!', 'sucesso');
      }
    } catch (err) {
      console.error('Erro ao atualizar configurações:', err);
      if (novoNome) {
        localStorage.setItem('nexus_user_name', novoNome);
        carregarInfoUtilizador();
      }
      mostrarNotificacaoToast('Preferências e alterações guardadas localmente.', 'sucesso');
    }
  });
}

// 3. Cadastrar Novo Operador/Utilizador com Verificação de E-mail Único
function setupFormNovoOperador() {
  const form = document.getElementById('formNovoOperador');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('novoOpNome')?.value;
    const cpf = document.getElementById('novoOpCpf')?.value;
    const data_nascimento = document.getElementById('novoOpDataNascimento')?.value;
    const email = document.getElementById('novoOpEmail')?.value;
    const cargo = document.getElementById('novoOpCargo')?.value;
    const senha = document.getElementById('novoOpSenha')?.value;

    const dataCadastro = new Date().toISOString();

    const payload = {
      nome,
      cpf,
      data_nascimento,
      email,
      cargo,
      senha,
      data_cadastro: dataCadastro
    };

    try {
      let res = await fetchSeguraConfig('/api/utilizadores/cadastrar', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.status === 404) {
        res = await fetchSeguraConfig('/api/auth/cadastrar', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      if (!res) return;

      const data = await res.json();

      if (res.ok) {
        mostrarNotificacaoToast('Utilizador cadastrado com sucesso!', 'sucesso');
        form.reset();
        const inputCargo = document.getElementById('novoOpCargo');
        const textoCargo = document.getElementById('textoCargoSelecionado');
        if (inputCargo) inputCargo.value = 'operador';
        if (textoCargo) textoCargo.textContent = 'Operador';
      } else {
        mostrarNotificacaoToast(
          data.error || 'Erro ao cadastrar utilizador. Verifique se o e-mail já está em uso.',
          'erro'
        );
      }
    } catch (err) {
      console.error('Erro de comunicação:', err);
      mostrarNotificacaoToast('Erro ao comunicar com o servidor para o cadastro.', 'erro');
    }
  });
}

// 4. Controlo interativo do dropdown personalizado de cargos
function setupCustomDropdown() {
  const btn = document.getElementById('btnDropdownCargo');
  const menu = document.getElementById('menuDropdownCargo');
  const input = document.getElementById('novoOpCargo');
  const texto = document.getElementById('textoCargoSelecionado');

  if (!btn || !menu || !input || !texto) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    menu.classList.add('hidden');
  });

  menu.querySelectorAll('.opcao-cargo').forEach((opcao) => {
    opcao.addEventListener('click', () => {
      const valor = opcao.getAttribute('data-value');
      const rotulo = opcao.textContent;

      input.value = valor;
      texto.textContent = rotulo;
      menu.classList.add('hidden');
    });
  });
}

// 5. Excluir Funcionário com Validação de Dados e Confirmação Customizada
function setupFormExcluirOperador() {
  const form = document.getElementById('formExcluirOperador');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('excluirOpNome')?.value.trim();
    const cpf = document.getElementById('excluirOpCpf')?.value.trim();
    const email = document.getElementById('excluirOpEmail')?.value.trim();
    const senhaAdmin = document.getElementById('excluirAdminSenha')?.value;
    const confirmaSenhaAdmin = document.getElementById('excluirAdminConfirmaSenha')?.value;

    if (senhaAdmin !== confirmaSenhaAdmin) {
      mostrarNotificacaoToast('A senha do administrador e a confirmação de senha não coincidem.', 'erro');
      return;
    }

    const emailLogado = (localStorage.getItem('nexus_user_email') || '').toLowerCase();
    if (email && email.toLowerCase() === emailLogado) {
      mostrarNotificacaoToast('Não é possível excluir a sua própria conta de administrador ativa.', 'erro');
      return;
    }

    // Utiliza o modal customizado em vez do confirm() nativo
    const confirmado = await mostrarConfirmacaoCustomizada(
      `Tem a certeza de que deseja excluir permanentemente o acesso do funcionário "${nome}" (${email})?`
    );
    if (!confirmado) return;

    const payload = {
      nome,
      cpf,
      email,
      senha_admin: senhaAdmin
    };

    try {
      let res = await fetchSeguraConfig('/api/utilizadores/excluir', {
        method: 'DELETE',
        body: JSON.stringify(payload)
      });

      if (res && res.status === 404) {
        res = await fetchSeguraConfig('/api/auth/excluir', {
          method: 'DELETE',
          body: JSON.stringify(payload)
        });
      }

      if (!res) return;

      const data = await res.json();

      if (res.ok) {
        mostrarNotificacaoToast('Funcionário excluído do sistema com sucesso!', 'sucesso');
        form.reset();
      } else {
        mostrarNotificacaoToast(data.error || 'Erro ao excluir funcionário. Verifique os dados.', 'erro');
      }
    } catch (err) {
      console.error('Erro ao comunicar exclusão:', err);
      mostrarNotificacaoToast('Erro ao comunicar com o servidor para processar a exclusão.', 'erro');
    }
  });
}

function setupGerarChaveRecuperacao() {
  const btnGerarChave = document.getElementById('btnGerarChaveRecuperacao');
  if (!btnGerarChave) return;

  btnGerarChave.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const res = await fetchSeguraConfig('/api/auth/gerar-chave-recuperacao', {
        method: 'POST'
      });
      if (!res) return;

      const data = await res.json();
      if (res.ok && data.codigo) {
        const displayChave = document.getElementById('codigoRecuperacaoGerado');
        if (displayChave) {
          displayChave.textContent = data.codigo;
          displayChave.classList.remove('hidden');
        }
        mostrarNotificacaoToast(`Chave gerada: ${data.codigo}`, 'sucesso');
      } else {
        mostrarNotificacaoToast(data.error || 'Erro ao gerar chave de recuperação.', 'erro');
      }
    } catch (err) {
      console.error('Erro ao gerar chave:', err);
      mostrarNotificacaoToast('Erro de comunicação com o servidor.', 'erro');
    }
  });
}

function setupCpfMask() {
  const idsCpf = ['novoOpCpf', 'excluirOpCpf'];

  idsCpf.forEach((id) => {
    const inputCpf = document.getElementById(id);
    if (!inputCpf) return;

    inputCpf.addEventListener('input', (e) => {
      let valor = e.target.value.replace(/\D/g, '');
      if (valor.length > 11) valor = valor.slice(0, 11);

      if (valor.length > 9) {
        valor = valor.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4');
      } else if (valor.length > 6) {
        valor = valor.replace(/^(\d{3})(\d{3})(\d{3}).*/, '$1.$2.$3');
      } else if (valor.length > 3) {
        valor = valor.replace(/^(\d{3})(\d{3}).*/, '$1.$2');
      }
      e.target.value = valor;
    });
  });
}

function setupDataNascimentoMask() {
  const inputData = document.getElementById('novoOpDataNascimento');
  if (!inputData) return;

  inputData.addEventListener('input', (e) => {
    let valor = e.target.value.replace(/\D/g, '');
    if (valor.length > 8) valor = valor.slice(0, 8);

    if (valor.length > 4) {
      valor = valor.replace(/^(\d{2})(\d{2})(\d{4}).*/, '$1/$2/$3');
    } else if (valor.length > 2) {
      valor = valor.replace(/^(\d{2})(\d{2}).*/, '$1/$2');
    }
    e.target.value = valor;
  });
}

function setupModalSuporte() {
  const modal = document.getElementById('modalSuporte');
  const btnAbrir = document.getElementById('btnAbrirSuporte');
  const btnAbrirSidebar = document.getElementById('btnAbrirSuporteSidebar');
  const btnFechar = document.getElementById('btnFecharSuporte');
  const btnFecharModal = document.getElementById('btnFecharSuporteModal');

  if (!modal) return;

  const abrirModal = () => modal.classList.remove('hidden');
  const fecharModal = () => modal.classList.add('hidden');

  if (btnAbrir) btnAbrir.addEventListener('click', abrirModal);
  if (btnAbrirSidebar) btnAbrirSidebar.addEventListener('click', abrirModal);
  if (btnFechar) btnFechar.addEventListener('click', fecharModal);
  if (btnFecharModal) btnFecharModal.addEventListener('click', fecharModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) fecharModal();
  });
}

const btnLogoutConfig = document.getElementById('logoutBtn');
if (btnLogoutConfig) {
  btnLogoutConfig.addEventListener('click', (e) => {
    e.preventDefault();
    encerrarSessaoInvalida();
  });
}
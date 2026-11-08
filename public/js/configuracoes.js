let isRedirectingConfig = false;
if (typeof window.cacheUsuariosEmpresa === 'undefined') {
  window.cacheUsuariosEmpresa = [];
}
let filtroCargoUsuarioAtual = 'todos';

const CHAVE_CACHE_USUARIOS_LOCAL = 'nexus_usuarios_empresa_cache';

async function fetchSeguraConfig(url, options = {}) {
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

  localStorage.removeItem('token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('nexus_token');
  localStorage.removeItem('nexus_user');
  localStorage.removeItem('nexus_user_name');
  localStorage.clear();
  sessionStorage.clear();

  window.location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) {
    encerrarSessaoInvalida();
    return;
  }

  carregarInfoUtilizador();
  carregarPreferenciasSalvas(); 
  aplicarControlePermissoes(); 
  await carregarConfiguracoes();
  setupFormConfiguracoes();
  setupFormNovoOperador();
  setupFormExcluirOperador(); 
  setupGerarChaveRecuperacao(); 
  setupCustomDropdown(); 
  setupCpfMask();
  setupDataNascimentoMask();
  setupModalSuporte();
  setupAbasEBuscaUsuarios();
});

function setupAbasEBuscaUsuarios() {
  const inputBusca = document.getElementById('inputBuscaUsuarios');
  if (inputBusca) {
    inputBusca.addEventListener('input', renderizarTabelaUsuariosEmpresa);
  }

  const roleAtual = (localStorage.getItem('nexus_user_role') || 'Administrador').toLowerCase();
  const isOperador = roleAtual === 'operador' || roleAtual === 'operator';

  if (window.location.hash === '#usuarios' && !isOperador) {
    alternarAbaConfig('usuarios');
  } else {
    carregarUsuariosEmpresa();
  }
}

function alternarAbaConfig(aba) {
  const painelPerfil = document.getElementById('painelAbaPerfil');
  const painelUsuarios = document.getElementById('painelAbaUsuarios');
  const tabBtnPerfil = document.getElementById('tabBtnPerfil');
  const tabBtnUsuarios = document.getElementById('tabBtnUsuarios');
  const sideLinkPerfil = document.getElementById('sideLinkPerfil');
  const sideLinkUsuarios = document.getElementById('sideLinkUsuarios');

  const subtituloBanner = document.getElementById('subtituloBannerConfig');
  const tituloBanner = document.getElementById('tituloBannerConfig');
  const badgeBanner = document.getElementById('badgeContadorUsuariosBanner');
  const btnNovoUsuario = document.getElementById('btnIrParaNovoUsuario');
  const breadcrumbSubAba = document.getElementById('breadcrumbSubAba');

  const classeAtivaTab = 'pb-3 text-xs font-bold text-[#0F392B] dark:text-emerald-400 border-b-2 border-[#0F392B] dark:border-emerald-400 flex items-center space-x-2 transition-all cursor-pointer';
  const classeInativaTab = 'pb-3 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border-b-2 border-transparent flex items-center space-x-2 transition-all cursor-pointer';

  const classeAtivaSide = 'w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#0F392B] dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40 transition-colors flex items-center space-x-2 cursor-pointer';
  const classeInativaSide = 'w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#15241F] transition-colors flex items-center space-x-2 cursor-pointer';

  if (aba === 'usuarios') {
    painelPerfil?.classList.add('hidden');
    painelUsuarios?.classList.remove('hidden');

    if (tabBtnUsuarios) tabBtnUsuarios.className = classeAtivaTab;
    if (tabBtnPerfil) tabBtnPerfil.className = classeInativaTab;
    if (sideLinkUsuarios) sideLinkUsuarios.className = classeAtivaSide;
    if (sideLinkPerfil) sideLinkPerfil.className = classeInativaSide;

    if (subtituloBanner) subtituloBanner.textContent = 'CONTROLE DE ACESSOS E EQUIPA';
    if (tituloBanner) tituloBanner.textContent = 'Usuários';
    badgeBanner?.classList.remove('hidden');
    if (btnNovoUsuario) {
      btnNovoUsuario.classList.remove('hidden');
      btnNovoUsuario.classList.add('inline-flex');
    }
    if (breadcrumbSubAba) breadcrumbSubAba.textContent = 'Usuários';

    window.history.replaceState(null, '', '#usuarios');
    carregarUsuariosEmpresa();
  } else {
    painelUsuarios?.classList.add('hidden');
    painelPerfil?.classList.remove('hidden');

    if (tabBtnPerfil) tabBtnPerfil.className = classeAtivaTab;
    if (tabBtnUsuarios) tabBtnUsuarios.className = classeInativaTab;
    if (sideLinkPerfil) sideLinkPerfil.className = classeAtivaSide;
    if (sideLinkUsuarios) sideLinkUsuarios.className = classeInativaSide;

    if (subtituloBanner) subtituloBanner.textContent = 'PREFERÊNCIAS E PERFIL';
    if (tituloBanner) tituloBanner.textContent = 'Configurações do Sistema';
    badgeBanner?.classList.add('hidden');
    if (btnNovoUsuario) {
      btnNovoUsuario.classList.add('hidden');
      btnNovoUsuario.classList.remove('inline-flex');
    }
    if (breadcrumbSubAba) breadcrumbSubAba.textContent = 'Perfil & Preferências';

    window.history.replaceState(null, '', window.location.pathname);
  }
}
window.alternarAbaConfig = alternarAbaConfig;

function focarFormularioNovoUsuario() {
  const inputNome = document.getElementById('novoOpNome');
  if (inputNome) {
    inputNome.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => inputNome.focus(), 300);
  }
}
window.focarFormularioNovoUsuario = focarFormularioNovoUsuario;

function prepararExclusaoUsuario(nome, cpf, email) {
  const elNome = document.getElementById('excluirOpNome');
  const elCpf = document.getElementById('excluirOpCpf');
  const elEmail = document.getElementById('excluirOpEmail');
  const elSenhaAdmin = document.getElementById('excluirAdminSenha');
  const blocoExclusao = document.getElementById('blocoExclusaoFuncionario');

  if (elNome) elNome.value = nome || '';
  if (elCpf) elCpf.value = cpf || '';
  if (elEmail) elEmail.value = email || '';

  if (blocoExclusao) {
    blocoExclusao.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => elSenhaAdmin?.focus(), 350);
  }
}
window.prepararExclusaoUsuario = prepararExclusaoUsuario;

function obterUsuariosSalvosLocalmente() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CACHE_USUARIOS_LOCAL) || '[]');
  } catch (e) {
    return [];
  }
}

function salvarUsuariosLocalmente(lista) {
  try {
    localStorage.setItem(CHAVE_CACHE_USUARIOS_LOCAL, JSON.stringify(lista));
  } catch (e) {}
}

async function carregarUsuariosEmpresa() {
  let listaServidor = [];

  try {
    let res = await fetchSeguraConfig('/api/utilizadores/equipe');
    if (res && res.status === 404) {
      res = await fetchSeguraConfig('/api/utilizadores');
    }

    if (res && res.ok) {
      const dados = await res.json();
      if (Array.isArray(dados)) listaServidor = dados;
      else if (Array.isArray(dados.equipe)) listaServidor = dados.equipe;
      else if (Array.isArray(dados.usuarios)) listaServidor = dados.usuarios;
    }
  } catch (e) {
    console.warn('Erro ao buscar equipe do servidor:', e);
  }

  if (listaServidor.length > 0) {
    window.cacheUsuariosEmpresa = listaServidor;
    salvarUsuariosLocalmente(listaServidor);
  } else {
    const empresaAtual = document.getElementById('cfgEmpresa')?.value || localStorage.getItem('nexus_user_empresa') || 'Nexus Controller';
    const nomeAtual = document.getElementById('cfgNome')?.value || localStorage.getItem('nexus_user_name') || 'Administrador';
    const emailAtual = document.getElementById('cfgEmail')?.value || localStorage.getItem('nexus_user_email') || 'admin@nexus.com';
    const cargoAtual = localStorage.getItem('nexus_user_role') || 'Administrador';

    window.cacheUsuariosEmpresa = [{
      id: 'atual',
      nome: nomeAtual,
      email: emailAtual,
      cpf: '---',
      data_nascimento: '',
      empresa: empresaAtual,
      cargo: cargoAtual,
      ativo: true
    }];
  }

  atualizarContadoresUsuarios();
  renderizarTabelaUsuariosEmpresa();
}
window.carregarUsuariosEmpresa = carregarUsuariosEmpresa;

function atualizarContadoresUsuarios() {
  const total = window.cacheUsuariosEmpresa.length;
  const qtdAdmins = window.cacheUsuariosEmpresa.filter((u) => {
    const c = String(u.cargo || u.role || u.nivel || '').toLowerCase();
    return c === 'admin' || c === 'administrador';
  }).length;
  const qtdOperadores = total - qtdAdmins;

  const elTodos = document.getElementById('countUserTodos');
  const elAdmin = document.getElementById('countUserAdmin');
  const elOp = document.getElementById('countUserOperador');
  const badgeTab = document.getElementById('badgeTabUsuariosCount');
  const badgeBanner = document.getElementById('badgeContadorUsuariosBanner');

  if (elTodos) elTodos.textContent = `(${total})`;
  if (elAdmin) elAdmin.textContent = `(${qtdAdmins})`;
  if (elOp) elOp.textContent = `(${qtdOperadores})`;
  if (badgeTab) badgeTab.textContent = String(total);
  if (badgeBanner) badgeBanner.textContent = `${total} utilizador(es) na empresa`;
}

function filtrarListaUsuariosPorCargo(cargo) {
  filtroCargoUsuarioAtual = cargo;

  const btnTodos = document.getElementById('btnFiltroUserTodos');
  const btnAdmin = document.getElementById('btnFiltroUserAdmin');
  const btnOp = document.getElementById('btnFiltroUserOperador');

  const classeAtiva = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-[#121E1A] text-slate-800 dark:text-slate-100 shadow-2xs transition-all flex items-center space-x-1.5 cursor-pointer';
  const classeInativa = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-all flex items-center space-x-1.5 cursor-pointer';

  if (btnTodos) btnTodos.className = cargo === 'todos' ? classeAtiva : classeInativa;
  if (btnAdmin) btnAdmin.className = cargo === 'admin' ? classeAtiva : classeInativa;
  if (btnOp) btnOp.className = cargo === 'operador' ? classeAtiva : classeInativa;

  renderizarTabelaUsuariosEmpresa();
}
window.filtrarListaUsuariosPorCargo = filtrarListaUsuariosPorCargo;

function renderizarTabelaUsuariosEmpresa() {
  const tbody = document.getElementById('tabelaUsuariosEmpresaBody');
  if (!tbody) return;

  const termo = (document.getElementById('inputBuscaUsuarios')?.value || '').toLowerCase().trim();
  const emailLogado = (document.getElementById('cfgEmail')?.value || localStorage.getItem('nexus_user_email') || '').toLowerCase().trim();

  const filtrados = window.cacheUsuariosEmpresa.filter((u) => {
    const c = String(u.cargo || u.role || u.nivel || 'operador').toLowerCase();
    const isAdminUser = c === 'admin' || c === 'administrador';

    if (filtroCargoUsuarioAtual === 'admin' && !isAdminUser) return false;
    if (filtroCargoUsuarioAtual === 'operador' && isAdminUser) return false;

    const nome = String(u.nome || '').toLowerCase();
    const email = String(u.email || '').toLowerCase();
    const cpf = String(u.cpf || '').toLowerCase();

    return nome.includes(termo) || email.includes(termo) || cpf.includes(termo);
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-14 text-center text-slate-400 font-medium text-xs">Nenhum usuário encontrado para este filtro.</td></tr>`;
    return;
  }

  const paletasAvatar = [
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  ];

  tbody.innerHTML = filtrados
    .map((u, idx) => {
      const nome = u.nome || 'Utilizador';
      const email = u.email || '---';
      const cpf = u.cpf || 'Não informado';
      const nasc = u.data_nascimento || '';
      const empresa = u.empresa || document.getElementById('cfgEmpresa')?.value || 'Nexus Controller';
      const iniciais =
        nome
          .split(' ')
          .filter(Boolean)
          .map((p) => p[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'US';
      const corAvatar = paletasAvatar[idx % paletasAvatar.length];

      const c = String(u.cargo || u.role || u.nivel || 'operador').toLowerCase();
      const isAdminUser = c === 'admin' || c === 'administrador';
      const isProprioUsuario = emailLogado && email.toLowerCase() === emailLogado;
      const estaAtivo = u.ativo !== false;

      const badgeCargo = isAdminUser
        ? `<span class="px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 rounded-full border border-emerald-200 dark:border-emerald-800/50">Administrador</span>`
        : `<span class="px-3 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 rounded-full border border-blue-200 dark:border-blue-800/50">Operador</span>`;

      const badgeStatus = estaAtivo
        ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 rounded-full border border-emerald-200 dark:border-emerald-800/50"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Ativo</span>`
        : `<span class="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 rounded-full border border-rose-200 dark:border-rose-800/50"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Inativo</span>`;

      const btnAcao = isProprioUsuario
        ? `<span class="text-[11px] font-semibold text-slate-400 italic pr-2">Conta atual</span>`
        : `
          <div class="flex items-center justify-end space-x-3">
            <button type="button" onclick="alternarStatusUsuario('${u.id}', ${!estaAtivo}, '${nome.replace(/'/g, "\\'")}')"
               class="px-3.5 py-1.5 text-[11px] font-semibold rounded-xl transition-colors cursor-pointer shadow-2xs ${
                 estaAtivo 
                   ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40' 
                   : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/40'
               }"
               title="${estaAtivo ? 'Desativar acesso' : 'Ativar acesso'}">
               <i class="fa-solid ${estaAtivo ? 'fa-ban' : 'fa-check'} mr-1.5"></i> ${estaAtivo ? 'Desativar' : 'Ativar'}
            </button>
            <button type="button" onclick="prepararExclusaoUsuario('${nome.replace(/'/g, "\\'")}', '${cpf === 'Não informado' || cpf === '---' ? '' : cpf}', '${email}')"
               class="px-3 py-1.5 text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer border border-slate-200 dark:border-[#1C2C26] hover:border-rose-200 dark:hover:border-rose-900"
               title="Selecionar para exclusão permanente">
               <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        `;

      return `
        <tr class="hover:bg-slate-50/80 dark:hover:bg-[#15241F]/60 transition-colors">
          <td class="py-5 px-6">
            <div class="flex items-center space-x-4">
              <div class="w-10 h-10 rounded-2xl ${corAvatar} font-bold text-xs flex items-center justify-center border shrink-0 shadow-2xs">
                ${iniciais}
              </div>
              <div>
                <p class="font-bold text-slate-800 dark:text-slate-100 text-xs">${nome}</p>
                <p class="text-[11px] text-slate-400 mt-0.5">${email}</p>
              </div>
            </div>
          </td>
          <td class="py-5 px-6 text-xs text-slate-600 dark:text-slate-300">
            <span class="font-medium">${cpf}</span>
            ${nasc ? `<span class="block text-[11px] text-slate-400 mt-0.5">Nasc: ${nasc}</span>` : ''}
          </td>
          <td class="py-5 px-6 text-xs font-medium text-slate-700 dark:text-slate-300">${empresa}</td>
          <td class="py-5 px-6">${badgeCargo}</td>
          <td class="py-5 px-6">${badgeStatus}</td>
          <td class="py-5 px-6 text-right">${btnAcao}</td>
        </tr>
      `;
    })
    .join('');
}

async function alternarStatusUsuario(id, novoStatus, nomeFuncionario) {
  const acao = novoStatus ? 'ativar' : 'desativar';
  const confirmado = await mostrarConfirmacaoCustomizada(
    `Tem a certeza de que deseja ${acao} o acesso de "${nomeFuncionario}"?`
  );
  if (!confirmado) return;

  try {
    const res = await fetchSeguraConfig(`/api/utilizadores/status/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: novoStatus })
    });

    if (!res) return;
    const data = await res.json();

    if (res.ok) {
      mostrarNotificacaoToast(data.message || 'Status atualizado com sucesso!', 'sucesso');
      await carregarUsuariosEmpresa();
    } else {
      mostrarNotificacaoToast(data.error || 'Erro ao atualizar status.', 'erro');
    }
  } catch (err) {
    mostrarNotificacaoToast('Erro de comunicação com o servidor.', 'erro');
  }
}
window.alternarStatusUsuario = alternarStatusUsuario;

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
  const isOperador = roleLower === 'operador' || roleLower === 'operator';

  const tabBtnUsuarios = document.getElementById('tabBtnUsuarios');
  const sideLinkUsuarios = document.getElementById('sideLinkUsuarios');
  const secaoGerenciamento = document.getElementById('secaoGerenciamentoUtilizadores');
  const secaoChave = document.getElementById('secaoSegurancaChave');

  if (isOperador) {
    if (secaoGerenciamento) secaoGerenciamento.style.display = 'none';
    if (secaoChave) secaoChave.remove();
    tabBtnUsuarios?.classList.add('hidden');
    sideLinkUsuarios?.classList.add('hidden');
    alternarAbaConfig('perfil');
  } else {
    localStorage.setItem('nexus_user_role', 'Administrador');
    if (secaoChave) secaoChave.classList.remove('hidden');
    tabBtnUsuarios?.classList.remove('hidden');
    sideLinkUsuarios?.classList.remove('hidden');
  }
}

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

  const iniciais =
    nomeUtilizador
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'NX';

  const elUserName = document.getElementById('userName');
  if (elUserName) elUserName.textContent = nomeUtilizador;

  const elUserRole = document.getElementById('userRole');
  if (elUserRole) elUserRole.textContent = cargoUtilizador;

  const elUserAvatar = document.getElementById('userAvatar');
  if (elUserAvatar) elUserAvatar.textContent = iniciais;

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

async function carregarConfiguracoes() {
  try {
    let res = await fetchSeguraConfig('/api/utilizadores/perfil');
    if (res && res.status === 404) {
      res = await fetchSeguraConfig('/api/auth/perfil');
    }

    if (!res) return;

    if (res.ok) {
      const data = await res.json();

      const nomeServidor = data.nome || localStorage.getItem('nexus_user_name') || 'Utilizador Nexus';
      const emailServidor = data.email || localStorage.getItem('nexus_user_email') || 'utilizador@nexus.com';
      
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
    console.warn('Erro ao carregar perfil do servidor:', err);
  }
}

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
  setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function mostrarConfirmacaoCustomizada(mensagem) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirmacaoCustom');
    const content = document.getElementById('modalConfirmacaoContent');
    const texto = document.getElementById('modalConfirmacaoTexto');
    const btnSim = document.getElementById('btnAceitarConfirmacao');
    const btnNao = document.getElementById('btnCancelarConfirmacao');

    if (!modal || !content) {
      resolve(confirm(mensagem));
      return;
    }

    if (texto) texto.textContent = mensagem;
    modal.classList.remove('hidden');
    
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

    try {
      await fetchSeguraConfig('/api/utilizadores/perfil', {
        method: 'PUT',
        body: JSON.stringify({ nome: novoNome, preferencias })
      });

      if (novoNome) {
        localStorage.setItem('nexus_user_name', novoNome);
        carregarInfoUtilizador();
      }

      mostrarNotificacaoToast('Configurações e preferências salvas com sucesso!', 'sucesso');
    } catch (err) {
      if (novoNome) {
        localStorage.setItem('nexus_user_name', novoNome);
        carregarInfoUtilizador();
      }
      mostrarNotificacaoToast('Preferências e alterações guardadas com sucesso!', 'sucesso');
    }
  });
}

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

    const payload = { nome, cpf, data_nascimento, email, cargo, senha, data_cadastro: new Date().toISOString() };

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
        const empresaAtual = document.getElementById('cfgEmpresa')?.value || localStorage.getItem('nexus_user_empresa') || 'Nexus Controller';
        const atuais = obterUsuariosSalvosLocalmente();
        atuais.push({ id: data.id || Date.now(), nome, cpf, data_nascimento, email, cargo, empresa: empresaAtual, ativo: true });
        salvarUsuariosLocalmente(atuais);

        mostrarNotificacaoToast('Utilizador cadastrado com sucesso!', 'sucesso');
        form.reset();
        document.getElementById('novoOpCargo').value = 'operador';
        document.getElementById('textoCargoSelecionado').textContent = 'Operador';

        await carregarUsuariosEmpresa();
      } else {
        mostrarNotificacaoToast(data.error || 'Erro ao cadastrar utilizador.', 'erro');
      }
    } catch (err) {
      mostrarNotificacaoToast('Erro ao comunicar com o servidor para o cadastro.', 'erro');
    }
  });
}

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
      input.value = opcao.getAttribute('data-value');
      texto.textContent = opcao.textContent;
      menu.classList.add('hidden');
    });
  });
}

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
      mostrarNotificacaoToast('A senha do administrador e a confirmação não coincidem.', 'erro');
      return;
    }

    const emailLogado = (localStorage.getItem('nexus_user_email') || '').toLowerCase();
    if (email && email.toLowerCase() === emailLogado) {
      mostrarNotificacaoToast('Não é possível excluir a sua própria conta de administrador.', 'erro');
      return;
    }

    const confirmado = await mostrarConfirmacaoCustomizada(
      `Tem a certeza de que deseja excluir permanentemente o acesso do funcionário "${nome}" (${email})?`
    );
    if (!confirmado) return;

    try {
      let res = await fetchSeguraConfig('/api/utilizadores/excluir', {
        method: 'DELETE',
        body: JSON.stringify({ nome, cpf, email, senha_admin: senhaAdmin })
      });

      if (res && res.status === 404) {
        res = await fetchSeguraConfig('/api/auth/excluir', {
          method: 'DELETE',
          body: JSON.stringify({ nome, cpf, email, senha_admin: senhaAdmin })
        });
      }

      if (!res) return;
      const data = await res.json();

      if (res.ok) {
        const restantes = obterUsuariosSalvosLocalmente().filter(
          (u) => String(u.email || '').toLowerCase() !== String(email).toLowerCase()
        );
        salvarUsuariosLocalmente(restantes);

        mostrarNotificacaoToast('Funcionário excluído do sistema com sucesso!', 'sucesso');
        form.reset();
        await carregarUsuariosEmpresa();
      } else {
        mostrarNotificacaoToast(data.error || 'Erro ao excluir funcionário.', 'erro');
      }
    } catch (err) {
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
      const res = await fetchSeguraConfig('/api/auth/gerar-chave-recuperacao', { method: 'POST' });
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
      mostrarNotificacaoToast('Erro de comunicação com o servidor.', 'erro');
    }
  });
}

function setupCpfMask() {
  ['novoOpCpf', 'excluirOpCpf'].forEach((id) => {
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
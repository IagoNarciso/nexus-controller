let isRedirectingDashboard = false;
let dashboardRefreshInterval = null;

// Função centralizada para requisições autenticadas e prevenção de loop 401 no Dashboard
async function fetchSeguraDashboard(url, options = {}) {
  const token = localStorage.getItem('token');

  if (!token) {
    encerrarSessaoDashboard();
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
      encerrarSessaoDashboard();
      return null;
    }

    return response;
  } catch (error) {
    throw error;
  }
}

function encerrarSessaoDashboard() {
  if (isRedirectingDashboard) return;
  isRedirectingDashboard = true;

  if (dashboardRefreshInterval) {
    clearInterval(dashboardRefreshInterval);
    dashboardRefreshInterval = null;
  }

  console.warn('Sessão expirada ou inválida no Dashboard (401). A redirecionar para login...');
  localStorage.removeItem('token');
  localStorage.removeItem('nexus_user');
  localStorage.removeItem('nexus_user_name');
  localStorage.clear();
  sessionStorage.clear();

  window.location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', async () => {
  // Aplicar preferências visuais do utilizador (Modo Compacto e Alertas)
  aplicarPreferenciasGlobais();

  // 1. Validar Autenticação
  const token = localStorage.getItem('token');
  const userString = localStorage.getItem('nexus_user');
  let user = {};

  if (!token) {
    encerrarSessaoDashboard();
    return;
  }

  try {
    user = userString ? JSON.parse(userString) : {};
  } catch (e) {
    console.error('Erro ao ler utilizador do localStorage:', e);
  }

  // 2. Preencher Nome do Utilizador, Saudação, Iniciais E NOME DA EMPRESA
  const nomeCompleto =
    localStorage.getItem('nexus_user_name') ||
    user.nome ||
    user.user_metadata?.nome ||
    user.user_metadata?.full_name ||
    'Utilizador';

  const userNameElem = document.getElementById('userName');
  const welcomeNameElem = document.getElementById('welcomeName');
  const userAvatarElem = document.getElementById('userAvatar');
  const nomeEmpresaElem = document.getElementById('nomeEmpresaDestaque');

  if (userNameElem) userNameElem.textContent = nomeCompleto;
  if (welcomeNameElem) welcomeNameElem.textContent = nomeCompleto.split(' ')[0];

  // Capturar e exibir o nome da empresa
  if (nomeEmpresaElem) {
    const nomeDaEmpresa =
      localStorage.getItem('nexus_user_empresa') ||
      user.nome_empresa ||
      user.empresa ||
      user.user_metadata?.nome_empresa ||
      user.user_metadata?.empresa ||
      'Minha Empresa';
    nomeEmpresaElem.textContent = nomeDaEmpresa;
  }

  if (userAvatarElem) {
    const names = nomeCompleto.trim().split(' ').filter(Boolean);
    let initials = 'UT';

    if (names.length >= 2) {
      initials = (names[0][0] + names[names.length - 1][0]).toUpperCase();
    } else if (names.length === 1 && names[0].length > 0) {
      initials = names[0].substring(0, 2).toUpperCase();
    }

    userAvatarElem.textContent = initials;
  }

  // 3. Botão de Logout
  const logoutBtn = document.getElementById('logoutBtn');
  const topbarLogoutBtn = document.getElementById('topbarLogoutBtn');

  const realizarLogout = (e) => {
    if (e) e.preventDefault();
    encerrarSessaoDashboard();
  };

  if (logoutBtn) logoutBtn.addEventListener('click', realizarLogout);
  if (topbarLogoutBtn) topbarLogoutBtn.addEventListener('click', realizarLogout);

  // 4. Configurar o Dropdown Customizado de Histórico Mensal
  const btnFiltroMes = document.getElementById('btnFiltroMes');
  const dropdownFiltroMes = document.getElementById('dropdownFiltroMes');
  const listaOpcoesMes = document.getElementById('listaOpcoesMes');
  const labelMesAtual = document.getElementById('labelMesAtual');

  const dataHoje = new Date();
  const mesAtualPadrao = `${dataHoje.getFullYear()}-${String(dataHoje.getMonth() + 1).padStart(2, '0')}`;
  window.mesFiltroAtivo = mesAtualPadrao;
  window.periodoGraficoAtivo = '7';

  if (btnFiltroMes && dropdownFiltroMes && listaOpcoesMes) {
    // Abrir/Fechar dropdown ao clicar no botão
    btnFiltroMes.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownFiltroMes.classList.toggle('hidden');
    });

    // Fechar ao clicar fora
    document.addEventListener('click', () => {
      dropdownFiltroMes.classList.add('hidden');
    });

    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    let opcoesHTML = '';

    // Gera os últimos 6 meses dinamicamente a partir da data atual
    for (let i = 0; i < 6; i++) {
      const d = new Date(dataHoje.getFullYear(), dataHoje.getMonth() - i, 1);
      const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const nomeMes = nomesMeses[d.getMonth()];
      const ano = d.getFullYear();

      const rotulo =
        i === 0
          ? `Este mês (${nomeMes}/${ano})`
          : i === 1
            ? `Mês passado (${nomeMes}/${ano})`
            : `${nomeMes}/${ano}`;

      if (i === 0 && labelMesAtual) {
        labelMesAtual.textContent = rotulo;
      }

      opcoesHTML += `
        <button type="button" data-valor="${valor}" data-rotulo="${rotulo}" class="opcao-mes w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-[#172722] text-slate-700 dark:text-slate-300 font-medium transition-colors flex items-center justify-between cursor-pointer">
          <span>${rotulo}</span>
        </button>`;
    }

    opcoesHTML += `
      <div class="border-t border-slate-100 dark:border-[#1C2C26] my-1"></div>
      <button type="button" data-valor="todos" data-rotulo="Todo o histórico" class="opcao-mes w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-[#172722] text-emerald-600 dark:text-emerald-400 font-bold transition-colors flex items-center justify-between cursor-pointer">
        <span>Todo o histórico</span>
      </button>`;

    listaOpcoesMes.innerHTML = opcoesHTML;

    // Ação ao selecionar um mês no menu customizado
    listaOpcoesMes.querySelectorAll('.opcao-mes').forEach((opcao) => {
      opcao.addEventListener('click', (e) => {
        const valor = e.currentTarget.getAttribute('data-valor');
        const rotulo = e.currentTarget.getAttribute('data-rotulo');

        if (labelMesAtual) labelMesAtual.textContent = rotulo;
        dropdownFiltroMes.classList.add('hidden');

        // Atualiza o estado ativo e dispara o carregamento dos dados daquele período
        window.mesFiltroAtivo = valor;
        carregarDadosDashboard(window.mesFiltroAtivo, window.periodoGraficoAtivo);
      });
    });
  }

  // 5. Carregamento Inicial e Atualização em Tempo Real (a cada 30 segundos)
  await carregarDadosDashboard(window.mesFiltroAtivo, window.periodoGraficoAtivo);

  dashboardRefreshInterval = setInterval(() => {
    if (!isRedirectingDashboard) {
      carregarDadosDashboard(window.mesFiltroAtivo, window.periodoGraficoAtivo);
    }
  }, 30000);

  // 6. Configuração do Dropdown Customizado do Gráfico de Movimentação
  const btnPeriodoMov = document.getElementById('btnPeriodoMov');
  const dropdownPeriodoMov = document.getElementById('dropdownPeriodoMov');
  const labelPeriodoMov = document.getElementById('labelPeriodoMov');

  if (btnPeriodoMov && dropdownPeriodoMov) {
    btnPeriodoMov.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownPeriodoMov.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      dropdownPeriodoMov.classList.add('hidden');
    });

    dropdownPeriodoMov.querySelectorAll('.opcao-periodo').forEach((opcao) => {
      opcao.addEventListener('click', (e) => {
        const valor = e.currentTarget.getAttribute('data-valor');
        const texto = e.currentTarget.textContent;

        window.periodoGraficoAtivo = valor;
        btnPeriodoMov.setAttribute('data-valor', valor);

        if (labelPeriodoMov) labelPeriodoMov.textContent = texto;
        dropdownPeriodoMov.classList.add('hidden');

        // RECARREGA OS DADOS DO DASHBOARD PASSANDO O NOVO PERÍODO DO GRÁFICO AO BACKEND
        carregarDadosDashboard(window.mesFiltroAtivo, valor);
      });
    });
  }

  // 7. Configuração do Modal de Suporte e Dropdowns da Topbar
  setupModalSuporte();
  setupTopbarDropdowns();
});

// Aplica as preferências globais salvas no localStorage (Modo Compacto e Alertas)
function aplicarPreferenciasGlobais() {
  try {
    const prefs = JSON.parse(localStorage.getItem('nexus_prefs'));
    if (!prefs) return;

    if (prefs.modoCompacto) {
      document.body.classList.add('modo-compacto-ativo');
      const estiloCompacto = document.createElement('style');
      estiloCompacto.id = 'estiloModoCompactoGlobal';
      estiloCompacto.innerHTML = `
        .modo-compacto-ativo td, .modo-compacto-ativo th {
          padding-top: 6px !important;
          padding-bottom: 6px !important;
        }
      `;
      if (!document.getElementById('estiloModoCompactoGlobal')) {
        document.head.appendChild(estiloCompacto);
      }
    } else {
      document.body.classList.remove('modo-compacto-ativo');
      document.getElementById('estiloModoCompactoGlobal')?.remove();
    }

    const containerAlertas = document.getElementById('lowStockList');
    if (containerAlertas && prefs.alertaEstoque === false) {
      containerAlertas.style.opacity = '0.3';
      containerAlertas.title = 'Alertas visuais desativados nas configurações';
    }
  } catch (err) {
    console.warn('Erro ao aplicar preferências globais:', err);
  }
}

// Controlo dos menus suspensos da Topbar (Perfil e Notificações)
function setupTopbarDropdowns() {
  const btnPerfilMenu = document.getElementById('btnPerfilMenu');
  const dropdownPerfil = document.getElementById('dropdownPerfil');
  const btnNotificacoes = document.getElementById('btnNotificacoes');
  const dropdownNotificacoes = document.getElementById('dropdownNotificacoes');

  if (btnPerfilMenu && dropdownPerfil) {
    btnPerfilMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownPerfil.classList.toggle('hidden');
      dropdownNotificacoes?.classList.add('hidden');
    });
  }

  if (btnNotificacoes && dropdownNotificacoes) {
    btnNotificacoes.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownNotificacoes.classList.toggle('hidden');
      dropdownPerfil?.classList.add('hidden');
      carregarNotificacoesTopo();
    });
  }

  document.addEventListener('click', () => {
    dropdownPerfil?.classList.add('hidden');
    dropdownNotificacoes?.classList.add('hidden');
  });
}

// Função para abrir e fechar o modal de suporte
function setupModalSuporte() {
  const modal = document.getElementById('modalSuporte');
  const btnAbrir = document.getElementById('btnAbrirSuporte');
  const btnFechar = document.getElementById('btnFecharSuporte');
  const btnFecharModal = document.getElementById('btnFecharSuporteModal');

  if (!modal || !btnAbrir) return;

  const abrirModal = () => modal.classList.remove('hidden');
  const fecharModal = () => modal.classList.add('hidden');

  btnAbrir.addEventListener('click', (e) => {
    e.preventDefault();
    abrirModal();
  });

  if (btnFechar) btnFechar.addEventListener('click', fecharModal);
  if (btnFecharModal) btnFecharModal.addEventListener('click', fecharModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) fecharModal();
  });
}

// Função unificada para buscar e atualizar as estatísticas do painel via API
async function carregarDadosDashboard(mesSelecionado = '', periodoGrafico = '7') {
  if (isRedirectingDashboard) return;

  const listContainer = document.getElementById('lowStockList');
  const badgeContainer = document.getElementById('lowStockBadge');
  const statBadge = document.getElementById('statEstoqueBaixo');
  const elVendasMes = document.getElementById('cardVendasMes');
  const elGastosMes = document.getElementById('cardGastosMes');
  const listaMaisCaros = document.getElementById('listaMaisCaros');
  const listaMaisVendidos = document.getElementById('listaMaisVendidos');

  const elTotalProdutos = document.getElementById('statTotalProdutos');
  const elValorEstoque = document.getElementById('statValorEstoque');
  const elSaidasMes = document.getElementById('statSaidasMes');

  const elGiroTopo = document.getElementById('resumoGiro');
  const elCoberturaTopo = document.getElementById('resumoCobertura');
  const elPedidosTopo = document.getElementById('resumoPedidos');
  const elGiroGlobal = document.getElementById('giroGlobal');
  const elMediaPerm = document.getElementById('mediaPermanencia');
  const elTaxaRuptura = document.getElementById('taxaRuptura');
  const elSaudeScore = document.getElementById('saudeScore');
  const barraSaude = document.getElementById('barraSaudeProgresso');
  const containerPercentuais = document.getElementById('listaCategoriasPercentual');

  const elClassificacao = document.getElementById('saudeClassificacao');
  const txtSaudavel = document.getElementById('txtEstoqueSaudavel');
  const txtBaixo = document.getElementById('txtAbaixoMinimo');
  const txtStatus = document.getElementById('txtStatusSistema');
  const dotStatus = document.getElementById('dotStatusSistema');

  try {
    let url = `/api/dashboard/estatisticas?periodo=${encodeURIComponent(periodoGrafico)}`;
    if (mesSelecionado) {
      url += `&mes=${encodeURIComponent(mesSelecionado)}`;
    }

    const response = await fetchSeguraDashboard(url);
    if (!response) return;

    if (!response.ok) {
      throw new Error('Falha ao carregar estatísticas do inventário');
    }

    const data = await response.json();

    if (elTotalProdutos) elTotalProdutos.textContent = data.totalProdutos || 0;
    if (elValorEstoque) {
      elValorEstoque.textContent = Number(data.valorTotalEstoque || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }
    if (elSaidasMes) elSaidasMes.textContent = data.totalSaidasMes || 0;

    window.dadosMovimentacaoGlobal = data.movimentacao || {};

    renderizarGraficoMovimentacao(window.dadosMovimentacaoGlobal, periodoGrafico);
    renderizarGraficoCategoria(data.categorias || null);

    if (elVendasMes) {
      elVendasMes.textContent = Number(data.totalVendasMes || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }

    // Exibe o Total de Compras / Gastos (Mês) vindo diretamente e de forma estável do backend
    if (elGastosMes) {
      elGastosMes.textContent = Number(data.totalGastosMes || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }

    if (elGiroTopo) elGiroTopo.textContent = `${data.giroEstoque || '0'}x`;
    if (elCoberturaTopo) elCoberturaTopo.textContent = `${data.coberturaMedia || '0'} dias`;
    if (elPedidosTopo) elPedidosTopo.textContent = data.pedidosPendentes || '0';

    const subGiro = document.getElementById('subGiro');
    const subCobertura = document.getElementById('subCobertura');
    const subPedidos = document.getElementById('subPedidos');

    if (subGiro) {
      subGiro.textContent = Number(data.giroEstoque || 0) > 1 ? 'Ritmo saudável de saída' : 'Atenção ao giro';
    }
    if (subCobertura) {
      subCobertura.textContent = `Estoque para ~${data.coberturaMedia || 0} dias`;
    }
    if (subPedidos) {
      subPedidos.textContent =
        data.pedidosPendentes > 0 ? `${data.pedidosPendentes} aguardando aprovação` : 'Nenhum pedido pendente';
    }

    if (elGiroGlobal) elGiroGlobal.textContent = `${data.giroEstoque || '0'}x / ano`;
    if (elMediaPerm) elMediaPerm.textContent = `${data.coberturaMedia || '0'} dias`;
    if (elTaxaRuptura) elTaxaRuptura.textContent = `${data.taxaRuptura || '0'}%`;

    const score = Number(data.saudeEstoque || 0);

    if (elSaudeScore) {
      elSaudeScore.textContent = `${score}%`;
      elSaudeScore.className = `w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center border transition-colors ${
        score >= 70
          ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
          : score >= 40
            ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
            : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
      }`;
    }

    if (barraSaude) {
      barraSaude.style.width = `${score}%`;
      barraSaude.className = `h-full rounded-full transition-all duration-1000 ${
        score >= 70 ? 'bg-emerald-600 dark:bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500'
      }`;
    }

    if (elClassificacao) {
      if (score >= 70) {
        elClassificacao.textContent = 'Muito bom';
        elClassificacao.className = 'text-emerald-700 dark:text-emerald-400 font-semibold';
      } else if (score >= 40) {
        elClassificacao.textContent = 'Regular (Atenção)';
        elClassificacao.className = 'text-amber-600 dark:text-amber-400 font-semibold';
      } else {
        elClassificacao.textContent = 'Crítico';
        elClassificacao.className = 'text-rose-600 dark:text-rose-400 font-semibold';
      }
    }

    const qtdSaudavel = data.itensSaudaveis ?? Math.max(0, (data.totalProdutos || 0) - (data.qtdEstoqueBaixo || 0));
    const qtdBaixo = data.qtdEstoqueBaixo || 0;

    if (txtSaudavel) {
      txtSaudavel.textContent = qtdSaudavel > 0 ? `${qtdSaudavel} item(ns) em conformidade` : 'Nenhum item ideal';
    }
    if (txtBaixo) {
      txtBaixo.textContent = qtdBaixo > 0 ? `${qtdBaixo} item(ns) em alerta` : '0 alertas (Tudo OK)';
      txtBaixo.className =
        qtdBaixo > 0
          ? 'font-bold text-amber-600 dark:text-amber-400'
          : 'font-bold text-emerald-600 dark:text-emerald-400';
    }
    if (txtStatus) {
      const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      txtStatus.textContent = `Ativo (${horaAtual})`;
      txtStatus.className = 'font-bold text-emerald-600 dark:text-emerald-400';
    }
    if (dotStatus) {
      dotStatus.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    }

    if (containerPercentuais && data.categorias && data.categorias.percentuais) {
      const cores = ['bg-[#0F392B]', 'bg-emerald-500', 'bg-amber-500'];
      containerPercentuais.innerHTML = data.categorias.percentuais
        .map(
          (cat, idx) => `
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-[#1C2C26] pb-1.5 mt-2">
          <div class="flex items-center space-x-2">
            <span class="w-2.5 h-2.5 rounded-full ${cores[idx] || 'bg-slate-400'}"></span>
            <span class="text-xs text-slate-600 dark:text-slate-300 font-medium">${cat.nome}</span>
          </div>
          <span class="text-xs font-bold text-slate-800 dark:text-slate-100">${cat.percentual}%</span>
        </div>
      `
        )
        .join('');
    }

    const count = data.qtdEstoqueBaixo || 0;
    if (badgeContainer) badgeContainer.textContent = count;
    if (statBadge) statBadge.textContent = count;

    if (listContainer) {
      if (count === 0) {
        listContainer.innerHTML = `
          <div class="text-center py-4">
            <i class="fa-solid fa-circle-check text-emerald-500 text-lg mb-1"></i>
            <p class="text-xs text-slate-500">Todos os estoques estão normais!</p>
          </div>
        `;
      } else {
        listContainer.innerHTML = `
          <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 p-3 rounded-xl text-center">
            <i class="fa-solid fa-triangle-exclamation text-amber-500 text-base mb-1"></i>
            <p class="text-xs font-bold">${count} item(ns) precisam de reposição</p>
            <p class="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">Consulte a aba de produtos.</p>
          </div>
        `;
      }
    }

    if (listaMaisCaros) {
      if (!data.maisCaros || data.maisCaros.length === 0) {
        listaMaisCaros.innerHTML = `<div class="p-3 bg-slate-50 dark:bg-[#14231E] rounded-xl text-xs text-slate-400 text-center">Nenhum produto cadastrado.</div>`;
      } else {
        listaMaisCaros.innerHTML = data.maisCaros
          .map(
            (p) => `
          <div class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-[#14231E] rounded-xl text-xs">
            <span class="font-semibold text-slate-700 dark:text-slate-200">${p.nome}</span>
            <span class="font-bold text-indigo-600 dark:text-indigo-400">R$ ${Number(p.preco_venda || p.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
        `
          )
          .join('');
      }
    }

    if (listaMaisVendidos) {
      if (
        !data.maisVendidos ||
        data.maisVendidos.length === 0 ||
        data.maisVendidos.every((p) => p.totalVendido === 0)
      ) {
        listaMaisVendidos.innerHTML = `<div class="p-3 bg-slate-50 dark:bg-[#14231E] rounded-xl text-xs text-slate-400 text-center">Sem registos de vendas neste período.</div>`;
      } else {
        listaMaisVendidos.innerHTML = data.maisVendidos
          .map(
            (p) => `
          <div class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-[#14231E] rounded-xl text-xs">
            <span class="font-semibold text-slate-700 dark:text-slate-200">${p.nome}</span>
            <span class="font-bold text-emerald-600 dark:text-emerald-400">${p.totalVendido} un. vendidas</span>
          </div>
        `
          )
          .join('');
      }
    }
  } catch (error) {
    console.error('Erro ao carregar estatísticas do dashboard:', error);
    if (listContainer) {
      listContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Status de estoque em monitoramento.</p>`;
    }
    if (txtStatus) {
      txtStatus.textContent = 'Offline';
      txtStatus.className = 'font-bold text-rose-600 dark:text-rose-400';
    }
    if (dotStatus) {
      dotStatus.className = 'w-2 h-2 rounded-full bg-rose-500';
    }
  }
}

async function carregarNotificacoesTopo() {
  const lista = document.getElementById('listaNotificacoes');
  if (!lista) return;

  let alertasAtivos = true;
  try {
    const prefs = JSON.parse(localStorage.getItem('nexus_prefs'));
    if (prefs && typeof prefs.alertaEstoque === 'boolean') {
      alertasAtivos = prefs.alertaEstoque;
    }
  } catch (e) {}

  if (!alertasAtivos) {
    lista.innerHTML = `
      <div class="p-4 text-center">
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Alertas visuais desativados</p>
        <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Pode reativá-los na página de Configurações.</p>
      </div>
    `;
    document.getElementById('dotNotificacao')?.classList.add('hidden');
    return;
  }

  try {
    const res = await fetchSeguraDashboard('/api/produtos');
    if (!res) return;

    if (res.ok) {
      const produtos = await res.json();

      const criticos = produtos.filter((p) => {
        if (p.status === 'pendente' || p.status === 'rejeitado') return false;
        const estoque = Number(p.estoque ?? p.quantidade ?? 0);
        const min = Number(p.quantidade_minima ?? 12);
        return p.ativo !== false && estoque <= min;
      });

      if (criticos.length === 0) {
        lista.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 font-medium">Nenhum alerta pendente. Tudo em ordem!</div>`;
        document.getElementById('dotNotificacao')?.classList.add('hidden');
        return;
      }

      document.getElementById('dotNotificacao')?.classList.remove('hidden');
      lista.innerHTML = criticos
        .map(
          (p) => `
        <div class="p-3 hover:bg-slate-50 dark:hover:bg-[#15241F] transition-colors flex items-center justify-between border-b border-slate-100 dark:border-[#1C2C26] last:border-0">
          <div>
            <p class="font-semibold text-slate-800 dark:text-slate-200 text-xs">${p.nome}</p>
            <p class="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Estoque crítico: apenas ${p.estoque ?? p.quantidade ?? 0} un.</p>
          </div>
          <span class="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded-md text-[10px] font-bold border border-amber-200/50">Atenção</span>
        </div>
      `
        )
        .join('');
    }
  } catch (err) {
    lista.innerHTML = `<div class="p-4 text-center text-xs text-rose-500 font-medium">Erro ao carregar notificações.</div>`;
  }
}

function renderizarGraficoMovimentacao(dadosOrigem, periodo = '7') {
  const chartCanvas = document.getElementById('movimentacaoChart');
  if (!chartCanvas || typeof Chart === 'undefined') return;

  const ctx = chartCanvas.getContext('2d');

  if (window.movimentacaoChartInstance) {
    window.movimentacaoChartInstance.destroy();
  }

  const dadosAtuais = (dadosOrigem && (dadosOrigem[periodo] || dadosOrigem[7])) || {
    labels: [],
    entradas: [],
    saidas: []
  };

  window.movimentacaoChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dadosAtuais.labels,
      datasets: [
        {
          label: 'Entradas',
          data: dadosAtuais.entradas,
          backgroundColor: '#236E50',
          borderRadius: 3,
          borderSkipped: false,
          maxBarThickness: 17
        },
        {
          label: 'Saídas',
          data: dadosAtuais.saidas,
          backgroundColor: '#C2E0D4',
          borderRadius: 3,
          borderSkipped: false,
          maxBarThickness: 17
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      categoryPercentage: periodo === '12' ? 0.6 : 0.35,
      barPercentage: 0.75,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            pointStyle: 'rect',
            boxWidth: 10,
            boxHeight: 10,
            font: { size: 11, family: 'Inter, sans-serif' },
            color: '#64748B'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#F1F5F9' },
          ticks: {
            color: '#94A3B8',
            font: { size: 11 },
            precision: 0
          }
        },
        x: {
          border: { color: '#E2E8F0' },
          grid: { display: false },
          ticks: { color: '#94A3B8', font: { size: 11 } }
        }
      }
    }
  });
}

function renderizarGraficoCategoria(dadosCat = null) {
  const chartCanvas = document.getElementById('categoriaChart');
  if (!chartCanvas || typeof Chart === 'undefined') return;

  const ctx = chartCanvas.getContext('2d');

  if (window.categoriaChartInstance) {
    window.categoriaChartInstance.destroy();
  }

  const labels = dadosCat?.labels?.length ? dadosCat.labels : ['Sem dados'];
  const values = dadosCat?.values?.length ? dadosCat.values : [1];

  window.categoriaChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: dadosCat?.values?.length
            ? ['#0F392B', '#10B981', '#F59E0B', '#6366F1', '#EC4899']
            : ['#E2E8F0'],
          borderWidth: 0,
          hoverOffset: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: { display: false }
      }
    }
  });
}
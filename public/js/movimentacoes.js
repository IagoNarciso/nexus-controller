let isRedirectingMovimentacoes = false;
let listaProdutosCache = [];
let listaMovimentacoesCache = [];
let carrinhoMovimentacao = [];
let filtroPeriodoAtual = 'este_mes';
let filtroApenasNaoVistas = false;

const CHAVE_MOVIMENTACOES_VISTAS = 'nexus_movimentacoes_vistas_ids';

function obterIdsVistosLocal() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_MOVIMENTACOES_VISTAS) || '[]');
  } catch (e) {
    return [];
  }
}

function salvarIdsVistosLocal(novosIds) {
  try {
    const atuais = obterIdsVistosLocal();
    const combinados = [...new Set([...atuais, ...novosIds.map(String)])];
    localStorage.setItem(CHAVE_MOVIMENTACOES_VISTAS, JSON.stringify(combinados));
  } catch (e) {
    console.error('Erro ao salvar IDs vistos no localStorage:', e);
  }
}

async function fetchSeguraMovimentacoes(url, options = {}) {
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) {
    encerrarSessaoMovimentacoes();
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
      encerrarSessaoMovimentacoes();
      return null;
    }
    return response;
  } catch (error) {
    throw error;
  }
}

function encerrarSessaoMovimentacoes() {
  if (isRedirectingMovimentacoes) return;
  isRedirectingMovimentacoes = true;

  localStorage.removeItem('token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('nexus_token');
  localStorage.removeItem('nexus_user');
  localStorage.removeItem('nexus_user_name');
  sessionStorage.clear();

  window.location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) {
    encerrarSessaoMovimentacoes();
    return;
  }

  carregarInfoUtilizador();

  const btnLogout = document.getElementById('logoutBtnSidebar') || document.getElementById('logoutBtn');
  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault();
      encerrarSessaoMovimentacoes();
    });
  }

  setupModalSuporte();
  setupModalDetalhesEvents();
  setupDropdownFiltroPeriodo();
  setupUserDropdown();
  setupBotoesNaoVistas();

  await carregarProdutosSelect();
  await carregarHistoricoMovimentacoes();
  await atualizarBadgeNaoLidas();
  setupMovimentacaoEvents();

  const inputSearch = document.getElementById('inputSearchMovimentacoes');
  if (inputSearch) {
    inputSearch.addEventListener('input', aplicarFiltroBuscaMovimentacoes);
  }
});

function carregarInfoUtilizador() {
  const nomeUtilizador = localStorage.getItem('nexus_user_name') || 'Usuário Nexus';
  const elUserName = document.getElementById('userName');
  if (elUserName) elUserName.textContent = nomeUtilizador;

  const cargoUtilizador =
    localStorage.getItem('nexus_user_role') ||
    localStorage.getItem('nexus_user_nivel') ||
    'Administrador';
  const elUserRole = document.getElementById('userRole');
  if (elUserRole) elUserRole.textContent = cargoUtilizador;

  const iniciais = nomeUtilizador
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const avatarTop = document.getElementById('userAvatarTop') || document.getElementById('userAvatar');
  if (avatarTop) {
    avatarTop.textContent = iniciais || 'NX';
  }
}

function setupUserDropdown() {
  const btn = document.getElementById('userMenuBtn') || document.getElementById('btnPerfilMenu');
  const dropdown = document.getElementById('userDropdown') || document.getElementById('dropdownPerfil');

  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

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

function setupModalDetalhesEvents() {
  const modalDetalhes = document.getElementById('modalDetalhesMov');
  const btnFecha1 = document.getElementById('btnFecharModalDetalhes');
  const btnFecha2 = document.getElementById('btnFecharDetalhesModal');

  if (!modalDetalhes) return;

  const fecharDetalhes = () => modalDetalhes.classList.add('hidden');

  btnFecha1?.addEventListener('click', fecharDetalhes);
  btnFecha2?.addEventListener('click', fecharDetalhes);
  modalDetalhes.addEventListener('click', (e) => {
    if (e.target === modalDetalhes) fecharDetalhes();
  });
}

function setupDropdownFiltroPeriodo() {
  const btnToggle = document.getElementById('btnToggleFiltroPeriodo');
  const dropdown = document.getElementById('dropdownFiltroPeriodo');

  if (!btnToggle || !dropdown) return;

  btnToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    dropdown.classList.add('hidden');
  });
}

let isMarcandoTodasVistas = false;

function setupBotoesNaoVistas() {
  const btnFiltro = document.getElementById('btnFiltroNaoVistas');
  const btnMarcarTodas = document.getElementById('btnMarcarTodasVistas');

  if (btnFiltro) {
    btnFiltro.addEventListener('click', () => {
      filtroApenasNaoVistas = !filtroApenasNaoVistas;
      if (filtroApenasNaoVistas) {
        btnFiltro.classList.add('bg-emerald-50', 'dark:bg-emerald-950/50', 'border-emerald-300', 'dark:border-emerald-700', 'text-emerald-700', 'dark:text-emerald-300');
      } else {
        btnFiltro.classList.remove('bg-emerald-50', 'dark:bg-emerald-950/50', 'border-emerald-300', 'dark:border-emerald-700', 'text-emerald-700', 'dark:text-emerald-300');
      }
      aplicarFiltroBuscaMovimentacoes();
    });
  }

  if (btnMarcarTodas) {
    btnMarcarTodas.addEventListener('click', async () => {
      if (isMarcandoTodasVistas || !listaMovimentacoesCache || listaMovimentacoesCache.length === 0) return;
      isMarcandoTodasVistas = true;

      const pendentes = listaMovimentacoesCache.filter((m) => !m.lida);
      const todosIds = listaMovimentacoesCache.map((m) => String(m.id));

      salvarIdsVistosLocal(todosIds);

      btnMarcarTodas.disabled = true;
      btnMarcarTodas.classList.add('opacity-75', 'cursor-not-allowed', 'pointer-events-none');

      try {
        if (pendentes.length > 0) {
          await Promise.all(
            pendentes.map((m) =>
              fetchSeguraMovimentacoes(`/api/movimentacoes/${m.id}/visualizar`, {
                method: 'PATCH'
              }).catch(() => null)
            )
          );
        }

        listaMovimentacoesCache.forEach((m) => {
          m.lida = true;
        });

        if (filtroApenasNaoVistas) {
          filtroApenasNaoVistas = false;
          btnFiltro?.classList.remove('bg-emerald-50', 'dark:bg-emerald-950/50', 'border-emerald-300', 'dark:border-emerald-700', 'text-emerald-700', 'dark:text-emerald-300');
        }

        aplicarFiltroBuscaMovimentacoes();
        await atualizarBadgeNaoLidas();
        mostrarNotificacaoToastMov('Todas as movimentações foram marcadas como vistas!', 'sucesso');
      } finally {
        isMarcandoTodasVistas = false;
        btnMarcarTodas.disabled = false;
        btnMarcarTodas.classList.remove('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
      }
    });
  }
}

function mudarFiltroPeriodo(tipoFiltro, textoLabel) {
  filtroPeriodoAtual = tipoFiltro;
  const label = document.getElementById('textoPeriodoSelecionado');
  if (label) label.textContent = textoLabel;

  const dropdown = document.getElementById('dropdownFiltroPeriodo');
  if (dropdown) dropdown.classList.add('hidden');

  carregarHistoricoMovimentacoes();
}
window.mudarFiltroPeriodo = mudarFiltroPeriodo;

async function atualizarBadgeNaoLidas() {
  const badge = document.getElementById('badgeMovimentacoes');
  const badgeCount = document.getElementById('badgeNaoVistasCount');

  try {
    const idsVistos = obterIdsVistosLocal();
    const naoLidasCount = listaMovimentacoesCache.filter(
      (m) => !m.lida && !idsVistos.includes(String(m.id))
    ).length;

    if (badge) {
      if (naoLidasCount > 0) {
        badge.textContent = naoLidasCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (badgeCount) {
      if (naoLidasCount > 0) {
        badgeCount.textContent = naoLidasCount;
        badgeCount.classList.remove('hidden');
      } else {
        badgeCount.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Erro ao atualizar contagem de movimentações não lidas:', err);
  }
}

async function carregarProdutosSelect() {
  try {
    const res = await fetchSeguraMovimentacoes('/api/produtos', {
      method: 'GET'
    });
    if (!res || !res.ok) return;

    const dados = await res.json();
    const todosProdutos = Array.isArray(dados) ? dados : [];

    listaProdutosCache = todosProdutos.filter((p) => {
      const status = String(p.status || p.estado || '').toLowerCase();
      return status === 'aprovado' || status === 'ativo' || p.aprovado === true || !p.status;
    });
  } catch (err) {
    console.error('Erro de conexão ao carregar produtos:', err);
  }
}

async function carregarHistoricoMovimentacoes() {
  const badgeTotal = document.getElementById('totalMovimentacoesBadge');

  try {
    const res = await fetchSeguraMovimentacoes('/api/movimentacoes', {
      method: 'GET'
    });
    if (!res) return;

    if (!res.ok) throw new Error('Falha ao carregar movimentações');

    const dados = await res.json();
    let movimentacoes = Array.isArray(dados) ? dados : [];
    const idsVistos = obterIdsVistosLocal();

    movimentacoes = movimentacoes.map((m) => ({
      ...m,
      lida: Boolean(m.lida || idsVistos.includes(String(m.id)))
    }));

    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();

    movimentacoes = movimentacoes.filter((m) => {
      if (!m.created_at) return false;
      const dataMov = new Date(m.created_at);
      const mesMov = dataMov.getMonth();
      const anoMov = dataMov.getFullYear();

      if (filtroPeriodoAtual === 'este_mes') {
        return mesMov === mesAtual && anoMov === anoAtual;
      } else if (filtroPeriodoAtual === 'mes_passado') {
        const mesPassado = mesAtual === 0 ? 11 : mesAtual - 1;
        const anoPassado = mesAtual === 0 ? anoAtual - 1 : anoAtual;
        return mesMov === mesPassado && anoMov === anoPassado;
      } else if (filtroPeriodoAtual === 'ago_2026') {
        return mesMov === 7 && anoMov === 2026;
      } else if (filtroPeriodoAtual === 'jul_2026') {
        return mesMov === 6 && anoMov === 2026;
      }
      return true;
    });

    listaMovimentacoesCache = movimentacoes;

    if (badgeTotal) {
      badgeTotal.textContent = `${movimentacoes.length} registro(s) encontrado(s)`;
    }

    aplicarFiltroBuscaMovimentacoes();
    await atualizarBadgeNaoLidas();
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
    if (badgeTotal) badgeTotal.textContent = 'Erro ao carregar';
    const tbody = document.getElementById('tabelaMovimentacoesBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-rose-400 font-medium text-xs">Erro ao carregar o histórico de movimentações.</td></tr>`;
    }
  }
}

function renderizarTabelaMovimentacoes(movimentacoes) {
  const tbody = document.getElementById('tabelaMovimentacoesBody');
  if (!tbody) return;

  if (!Array.isArray(movimentacoes) || movimentacoes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400 font-medium text-xs">Nenhuma movimentação registrada para este período ou busca.</td></tr>`;
    return;
  }

  tbody.innerHTML = movimentacoes
    .map((m) => {
      const dataFormatada = m.created_at ? new Date(m.created_at).toLocaleString('pt-BR') : '---';
      const prodNome = m.produtos?.nome || m.produto_nome || 'Produto Indisponível';
      const idCurto = m.id ? String(m.id).substring(0, 6) : `---`;
      const nomeSolicitante = m.usuarios?.nome || m.usuario_nome || 'Sistema / Não identificado';

      let badgeTipo = `<span class="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 rounded-full border border-emerald-200 dark:border-emerald-800/50">Venda</span>`;
      if (m.tipo === 'compra') {
        badgeTipo = `<span class="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950/60 rounded-full border border-blue-200 dark:border-blue-800/50">Compra</span>`;
      } else if (m.tipo === 'retirada') {
        badgeTipo = `<span class="px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/60 rounded-full border border-rose-200 dark:border-rose-800/50">Retirada</span>`;
      }

      let badgeStatus = `<span class="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 rounded-full border border-emerald-200 dark:border-emerald-800/50">Concluída</span>`;
      if (m.status === 'cancelada' || m.status === 'estornada') {
        badgeStatus = `<span class="px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/60 rounded-full border border-rose-200 dark:border-rose-800/50">Estornada</span>`;
      }

      const obsTexto = m.observacao ? m.observacao : '-';
      const bgClass = !m.lida ? 'bg-amber-50/60 dark:bg-amber-950/20 font-medium' : '';
      const indicacaoNovo = !m.lida
        ? `<span class="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1.5" title="Não visualizada"></span>`
        : '';

      return `
      <tr class="${bgClass} hover:bg-slate-50 dark:hover:bg-[#15241F]/60 transition-colors border-b border-slate-100 dark:border-[#1C2C26]">
        <td class="py-3.5 px-6 text-xs text-slate-500 dark:text-slate-400">${indicacaoNovo} #${idCurto} <br>${dataFormatada}</td>
        <td class="py-3.5 px-6 text-xs font-bold text-slate-800 dark:text-slate-200">${prodNome}</td>
        <td class="py-3.5 px-6 text-xs font-semibold text-slate-700 dark:text-slate-300">${m.quantidade || 0} un.</td>
        <td class="py-3.5 px-6 text-xs font-medium text-slate-700 dark:text-slate-300">${nomeSolicitante}</td>
        <td class="py-3.5 px-6">${badgeTipo}</td>
        <td class="py-3.5 px-6">${badgeStatus}</td>
        <td class="py-3.5 px-6 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title="${obsTexto}">${obsTexto}</td>
        <td class="py-3.5 px-6 text-right">
          <button onclick="visualizarMovimentacao('${m.id}')" class="p-1.5 bg-white dark:bg-[#14231E] hover:bg-slate-100 dark:hover:bg-[#1C2C26] text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-[#1C2C26] shadow-xs transition-colors cursor-pointer" title="Visualizar detalhes completos">
            <i class="fa-solid fa-eye text-xs"></i>
          </button>
        </td>
      </tr>
    `;
    })
    .join('');
}

function aplicarFiltroBuscaMovimentacoes() {
  const termo = (document.getElementById('inputSearchMovimentacoes')?.value || '').toLowerCase().trim();

  const filtrados = listaMovimentacoesCache.filter((m) => {
    if (filtroApenasNaoVistas && m.lida) return false;

    const prodNome = (m.produtos?.nome || m.produto_nome || '').toLowerCase();
    const obs = (m.observacao || '').toLowerCase();
    const tipo = (m.tipo || '').toLowerCase();
    const solicitante = (m.usuarios?.nome || '').toLowerCase();

    return prodNome.includes(termo) || obs.includes(termo) || tipo.includes(termo) || solicitante.includes(termo);
  });

  renderizarTabelaMovimentacoes(filtrados);
}

function mostrarNotificacaoToastMov(mensagem, tipo = 'sucesso') {
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

async function visualizarMovimentacao(id) {
  const modal = document.getElementById('modalDetalhesMov');

  const m = listaMovimentacoesCache.find((item) => String(item.id) === String(id));
  if (!m) {
    alert('Detalhes da movimentação não encontrados.');
    return;
  }

  try {
    const elIdData = document.getElementById('detalhesIdData');
    if (elIdData) {
      elIdData.textContent = `Registro #${m.id ? String(m.id).substring(0, 6) : '---'} | ${new Date(m.created_at).toLocaleString('pt-BR')}`;
    }

    const elProduto = document.getElementById('detalhesProduto');
    const elQtd = document.getElementById('detalhesQuantidade');
    const elValorUnit = document.getElementById('detalhesValorUnit');

    if (elProduto) elProduto.textContent = m.produtos?.nome || m.produto_nome || 'Produto Indisponível';
    if (elQtd) elQtd.textContent = `${m.quantidade} un.`;
    if (elValorUnit) {
      elValorUnit.textContent = `R$ ${parseFloat(m.valor_unitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }

    const subtotal = m.quantidade * parseFloat(m.valor_unitario || 0);
    let desconto = parseFloat(m.desconto || 0);
    const observacaoReal = m.observacao || '';

    if (desconto === 0 && observacaoReal.includes('Desconto aplicado:')) {
      const match = observacaoReal.match(/R\$\s*([\d\.]*,\d{2})/);
      if (match && match[1]) {
        desconto = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
      }
    }

    const totalFinal = Math.max(0, subtotal - desconto);

    const elDesconto = document.getElementById('detalhesDesconto');
    const elValorTotal = document.getElementById('detalhesValorTotal');
    const elObservacao = document.getElementById('detalhesObservacao');

    if (elDesconto) {
      elDesconto.textContent =
        desconto > 0 ? `R$ ${desconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Nenhum';
    }
    if (elValorTotal) {
      elValorTotal.textContent = `R$ ${totalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (elObservacao) {
      elObservacao.textContent = observacaoReal || 'Nenhuma observação informada.';
    }

    const badgeDiv = document.getElementById('detalhesBadgeTipo');
    if (badgeDiv) {
      if (m.tipo === 'venda') {
        badgeDiv.innerHTML = `<span class="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 rounded-full border border-emerald-200 dark:border-emerald-800/50">Venda</span>`;
      } else if (m.tipo === 'compra') {
        badgeDiv.innerHTML = `<span class="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950/60 rounded-full border border-blue-200 dark:border-blue-800/50">Compra</span>`;
      } else {
        badgeDiv.innerHTML = `<span class="px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/60 rounded-full border border-rose-200 dark:border-rose-800/50">Retirada</span>`;
      }
    }

    if (!m.lida) {
      salvarIdsVistosLocal([m.id]);
      m.lida = true;
      await fetchSeguraMovimentacoes(`/api/movimentacoes/${id}/visualizar`, {
        method: 'PATCH'
      });
      await carregarHistoricoMovimentacoes();
      await atualizarBadgeNaoLidas();
    }

    modal?.classList.remove('hidden');
  } catch (err) {
    console.error('Erro ao abrir detalhes:', err);
    alert('Erro ao carregar detalhes da movimentação.');
  }
}
window.visualizarMovimentacao = visualizarMovimentacao;

let isSubmittingMovimentacao = false;

function setupMovimentacaoEvents() {
  const modal = document.getElementById('modalMovimentacao');
  const btnAbrir = document.getElementById('btnNovaMovimentacao');
  const btnFechar = document.getElementById('btnFecharModalMov');
  const btnCancelar = document.getElementById('btnCancelarModalMov');
  const form = document.getElementById('formMovimentacao');

  const btnToggleSelect = document.getElementById('btnToggleCustomSelectMov');
  const textoSelecionado = document.getElementById('textoProdutoSelecionadoMov');
  const inputHiddenId = document.getElementById('movProdutoId');
  const dropdownOptions = document.getElementById('dropdownCustomOptionsMov');
  const iconeSeta = document.getElementById('iconeSetaSelectMov');

  const inputQtd = document.getElementById('movQuantidade');
  const inputValorUnit = document.getElementById('movValorUnitario');
  const inputPorcentagem = document.getElementById('movDescontoPorcentagem');
  const containerDescontoPct = document.getElementById('containerDescontoPct');
  const labelTotal = document.getElementById('labelTotalComDesconto');
  const radiosTipo = document.querySelectorAll('input[name="movTipo"]');

  const btnAdicionarItem = document.getElementById('btnAdicionarItemMov');
  const containerCarrinho = document.getElementById('containerCarrinhoMov');
  const listaItensCarrinho = document.getElementById('listaItensCarrinhoMov');
  const contadorItensCarrinho = document.getElementById('contadorItensCarrinhoMov');
  const btnLimparCarrinho = document.getElementById('btnLimparCarrinhoMov');

  const limparCamposSelecaoProduto = () => {
    if (inputHiddenId) {
      inputHiddenId.value = '';
      delete inputHiddenId.dataset.nome;
      delete inputHiddenId.dataset.estoque;
    }
    if (textoSelecionado) {
      textoSelecionado.textContent = 'Selecione um produto...';
      textoSelecionado.className = 'truncate text-slate-400';
    }
    if (inputQtd) inputQtd.value = '1';
    if (inputValorUnit) inputValorUnit.value = '';
    if (inputPorcentagem) inputPorcentagem.value = '';
  };

  const calcularItemAtualInputs = () => {
    const prodId = inputHiddenId?.value;
    if (!prodId) return null;

    const tipo = document.querySelector('input[name="movTipo"]:checked')?.value || 'venda';
    const qtd = Math.max(1, parseInt(inputQtd?.value, 10) || 1);
    const valorUnit = parseFloat((inputValorUnit?.value || '').replace(/\./g, '').replace(',', '.')) || 0;
    const pct = tipo === 'venda' ? Math.min(100, Math.max(0, parseFloat(inputPorcentagem?.value) || 0)) : 0;

    const subtotal = qtd * valorUnit;
    const descontoReais = subtotal * (pct / 100);
    const totalLiquido = Math.max(0, subtotal - descontoReais);

    const prodObj = listaProdutosCache.find((p) => String(p.id) === String(prodId));
    const nome = inputHiddenId.dataset.nome || prodObj?.nome || 'Produto';
    const estoque = Number(inputHiddenId.dataset.estoque ?? prodObj?.estoque ?? prodObj?.quantidade ?? 0);

    return {
      produto_id: prodId,
      nome,
      estoque,
      quantidade: qtd,
      valor_unitario: valorUnit,
      desconto_pct: pct,
      desconto: descontoReais,
      total: totalLiquido
    };
  };

  const recalcularValores = () => {
    const tipo = document.querySelector('input[name="movTipo"]:checked')?.value || 'venda';

    // Recalcula descontos dos itens já no carrinho caso o tipo mude (ex: de Venda para Compra)
    carrinhoMovimentacao.forEach((item) => {
      const subtotal = item.quantidade * item.valor_unitario;
      const pct = tipo === 'venda' ? item.desconto_pct : 0;
      item.desconto = subtotal * (pct / 100);
      item.total = Math.max(0, subtotal - item.desconto);
    });

    const totalCarrinho = carrinhoMovimentacao.reduce((acc, item) => acc + item.total, 0);
    const itemAtual = calcularItemAtualInputs();
    const totalPrevisto = totalCarrinho + (itemAtual ? itemAtual.total : 0);

    if (labelTotal) {
      labelTotal.textContent = `R$ ${totalPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  const renderizarCarrinhoMov = () => {
    if (!containerCarrinho || !listaItensCarrinho) return;

    if (carrinhoMovimentacao.length === 0) {
      containerCarrinho.classList.add('hidden');
      listaItensCarrinho.innerHTML = '';
      if (contadorItensCarrinho) contadorItensCarrinho.textContent = '0';
      recalcularValores();
      return;
    }

    containerCarrinho.classList.remove('hidden');
    if (contadorItensCarrinho) contadorItensCarrinho.textContent = String(carrinhoMovimentacao.length);

    const tipo = document.querySelector('input[name="movTipo"]:checked')?.value || 'venda';

    listaItensCarrinho.innerHTML = carrinhoMovimentacao
      .map((item, idx) => {
        const valorUnitFmt = item.valor_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const totalFmt = item.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const tagDesconto =
          tipo === 'venda' && item.desconto_pct > 0
            ? `<span class="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded border border-amber-200/60">-${item.desconto_pct}%</span>`
            : '';

        return `
          <div class="p-3 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-[#15241F]/60 transition-colors">
            <div class="min-w-0 pr-3">
              <p class="font-bold text-slate-800 dark:text-slate-200 text-xs truncate">${item.nome}</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">
                ${item.quantidade} un. &times; ${valorUnitFmt} ${tagDesconto}
              </p>
            </div>
            <div class="flex items-center space-x-3 shrink-0">
              <span class="font-bold text-emerald-700 dark:text-emerald-400 text-xs">${totalFmt}</span>
              <button type="button" onclick="removerItemCarrinhoMov(${idx})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer" title="Remover item">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    recalcularValores();
  };

  window.removerItemCarrinhoMov = (index) => {
    carrinhoMovimentacao.splice(index, 1);
    renderizarCarrinhoMov();
  };

  btnLimparCarrinho?.addEventListener('click', () => {
    carrinhoMovimentacao = [];
    renderizarCarrinhoMov();
  });

  btnAdicionarItem?.addEventListener('click', () => {
    const novoItem = calcularItemAtualInputs();
    if (!novoItem) {
      mostrarNotificacaoToastMov('Selecione um produto antes de adicionar à lista.', 'erro');
      return;
    }

    const tipo = document.querySelector('input[name="movTipo"]:checked')?.value || 'venda';
    const itemExistente = carrinhoMovimentacao.find(
      (i) => String(i.produto_id) === String(novoItem.produto_id)
    );

    const qtdTotalProduto = (itemExistente ? itemExistente.quantidade : 0) + novoItem.quantidade;

    // Validação de estoque disponível para Venda ou Retirada
    if ((tipo === 'venda' || tipo === 'retirada') && qtdTotalProduto > novoItem.estoque) {
      mostrarNotificacaoToastMov(
        `Estoque insuficiente para "${novoItem.nome}". Disponível: ${novoItem.estoque} un.`,
        'erro'
      );
      return;
    }

    if (itemExistente) {
      itemExistente.quantidade = qtdTotalProduto;
      itemExistente.valor_unitario = novoItem.valor_unitario;
      itemExistente.desconto_pct = novoItem.desconto_pct;
    } else {
      carrinhoMovimentacao.push(novoItem);
    }

    limparCamposSelecaoProduto();
    renderizarCarrinhoMov();
  });

  const renderizarDropdownProdutos = () => {
    if (!dropdownOptions) return;

    if (!Array.isArray(listaProdutosCache) || listaProdutosCache.length === 0) {
      dropdownOptions.innerHTML = `<div class="p-3 text-center text-slate-400 text-xs">Nenhum produto cadastrado</div>`;
      return;
    }

    dropdownOptions.innerHTML = listaProdutosCache
      .map((p) => {
        const estoque = p.estoque ?? p.quantidade ?? 0;
        return `
        <div class="p-3 hover:bg-slate-50 dark:hover:bg-[#15241F] transition-colors cursor-pointer flex items-center justify-between item-opcao-produto-mov"
          data-id="${p.id}" data-nome="${p.nome}" data-estoque="${estoque}" data-preco="${p.preco_venda || p.preco || 0}">
          <span class="font-medium text-slate-800 dark:text-slate-200">${p.nome}</span>
          <span class="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">Estoque: ${estoque} un.</span>
        </div>
      `;
      })
      .join('');

    document.querySelectorAll('.item-opcao-produto-mov').forEach((item) => {
      item.onclick = (e) => {
        e.stopPropagation();
        const id = item.getAttribute('data-id');
        const nome = item.getAttribute('data-nome');
        const estoque = item.getAttribute('data-estoque');
        const preco = item.getAttribute('data-preco');

        if (inputHiddenId) {
          inputHiddenId.value = id;
          inputHiddenId.dataset.nome = nome;
          inputHiddenId.dataset.estoque = estoque;
        }
        if (textoSelecionado) {
          textoSelecionado.textContent = `${nome} (Estoque: ${estoque} un.)`;
          textoSelecionado.className = 'truncate text-slate-800 dark:text-slate-100 font-medium';
        }

        if (inputValorUnit && preco) {
          inputValorUnit.value = parseFloat(preco).toFixed(2).replace('.', ',');
          recalcularValores();
        }

        dropdownOptions.classList.add('hidden');
        if (iconeSeta) iconeSeta.style.transform = 'rotate(0deg)';
      };
    });
  };

  if (btnToggleSelect && dropdownOptions) {
    btnToggleSelect.onclick = (e) => {
      e.stopPropagation();
      dropdownOptions.classList.toggle('hidden');
      if (iconeSeta) {
        iconeSeta.style.transform = dropdownOptions.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    };

    document.addEventListener('click', () => {
      dropdownOptions.classList.add('hidden');
      if (iconeSeta) iconeSeta.style.transform = 'rotate(0deg)';
    });
  }

  inputQtd?.addEventListener('input', recalcularValores);
  inputValorUnit?.addEventListener('input', recalcularValores);
  inputPorcentagem?.addEventListener('input', recalcularValores);

  const toggleDesconto = () => {
    const tipo = document.querySelector('input[name="movTipo"]:checked')?.value;
    if (containerDescontoPct) {
      if (tipo === 'venda') {
        containerDescontoPct.classList.remove('hidden');
      } else {
        containerDescontoPct.classList.add('hidden');
        if (inputPorcentagem) inputPorcentagem.value = '';
      }
    }
    renderizarCarrinhoMov();
  };

  radiosTipo.forEach((r) => r.addEventListener('change', toggleDesconto));

  const abrir = async () => {
    form?.reset();
    carrinhoMovimentacao = [];
    limparCamposSelecaoProduto();
    renderizarCarrinhoMov();
    if (dropdownOptions) dropdownOptions.classList.add('hidden');

    toggleDesconto();
    await carregarProdutosSelect();
    renderizarDropdownProdutos();
    modal?.classList.remove('hidden');
  };
  const fechar = () => modal?.classList.add('hidden');

  btnAbrir?.addEventListener('click', abrir);
  btnFechar?.addEventListener('click', fechar);
  btnCancelar?.addEventListener('click', fechar);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isSubmittingMovimentacao) return;

    const tipo = document.querySelector('input[name="movTipo"]:checked')?.value || 'venda';
    const observacao = document.getElementById('movObservacao')?.value || '';

    // Monta a lista final de itens (carrinho + item eventual selecionado no campo que ainda não foi adicionado)
    const itensParaEnviar = [...carrinhoMovimentacao];
    const itemPendenteNoInput = calcularItemAtualInputs();

    if (itemPendenteNoInput) {
      const existente = itensParaEnviar.find(
        (i) => String(i.produto_id) === String(itemPendenteNoInput.produto_id)
      );
      const qtdTotal = (existente ? existente.quantidade : 0) + itemPendenteNoInput.quantidade;

      if ((tipo === 'venda' || tipo === 'retirada') && qtdTotal > itemPendenteNoInput.estoque) {
        mostrarNotificacaoToastMov(
          `Estoque insuficiente para "${itemPendenteNoInput.nome}". Disponível: ${itemPendenteNoInput.estoque} un.`,
          'erro'
        );
        return;
      }

      if (existente) {
        existente.quantidade = qtdTotal;
        existente.valor_unitario = itemPendenteNoInput.valor_unitario;
        existente.desconto += itemPendenteNoInput.desconto;
      } else {
        itensParaEnviar.push(itemPendenteNoInput);
      }
    }

    if (itensParaEnviar.length === 0) {
      mostrarNotificacaoToastMov('Selecione ou adicione pelo menos um produto para registrar.', 'erro');
      return;
    }

    isSubmittingMovimentacao = true;

    const btnSubmitModal = form.querySelector('button[type="submit"]');
    const textoOriginalBotao = btnSubmitModal ? btnSubmitModal.innerHTML : 'Registrar Movimentação';

    if (btnSubmitModal) {
      btnSubmitModal.disabled = true;
      btnSubmitModal.classList.add('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
      btnSubmitModal.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Registrando (${itensParaEnviar.length})...`;
    }

    let sucessos = 0;
    let ultimoErro = '';

    try {
      for (const item of itensParaEnviar) {
        const res = await fetchSeguraMovimentacoes('/api/movimentacoes', {
          method: 'POST',
          body: JSON.stringify({
            produto_id: item.produto_id,
            tipo,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario || undefined,
            desconto: tipo === 'venda' ? item.desconto : 0,
            observacao
          })
        });

        if (!res) return;

        if (res.ok) {
          sucessos++;
        } else {
          const dataErro = await res.json().catch(() => ({}));
          ultimoErro = dataErro.error || `Falha ao registrar ${item.nome}`;
        }
      }

      if (sucessos === 0) {
        mostrarNotificacaoToastMov(ultimoErro || 'Erro ao registrar movimentação.', 'erro');
        return;
      }

      if (sucessos < itensParaEnviar.length) {
        mostrarNotificacaoToastMov(
          `${sucessos} de ${itensParaEnviar.length} itens registrados. (${ultimoErro})`,
          'erro'
        );
      } else {
        mostrarNotificacaoToastMov(
          itensParaEnviar.length > 1
            ? `${sucessos} produtos movimentados com sucesso!`
            : 'Movimentação registrada com sucesso!',
          'sucesso'
        );
      }

      fechar();
      await carregarProdutosSelect();
      await carregarHistoricoMovimentacoes();
      await atualizarBadgeNaoLidas();
    } catch (err) {
      console.error('Erro no envio da movimentação:', err);
      mostrarNotificacaoToastMov('Falha na comunicação com o servidor.', 'erro');
    } finally {
      isSubmittingMovimentacao = false;
      if (btnSubmitModal) {
        btnSubmitModal.disabled = false;
        btnSubmitModal.classList.remove('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
        btnSubmitModal.innerHTML = textoOriginalBotao;
      }
    }
  });
}
let isRedirectingSolicitacoes = false;

// Função centralizada para requisições autenticadas e prevenção de loop 401
async function fetchSeguraSolicitacoes(url, options = {}) {
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) {
    encerrarSessaoSolicitacoes();
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
      encerrarSessaoSolicitacoes();
      return null;
    }

    return response;
  } catch (error) {
    throw error;
  }
}

function encerrarSessaoSolicitacoes() {
  if (isRedirectingSolicitacoes) return;
  isRedirectingSolicitacoes = true;

  console.warn('Sessão expirada ou inválida em Solicitações (401). A redirecionar para login...');
  localStorage.removeItem('token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('nexus_token');
  localStorage.removeItem('nexus_user');
  localStorage.removeItem('nexus_user_name');
  sessionStorage.clear();

  window.location.replace('login.html');
}

document.addEventListener('DOMContentLoaded', () => {
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) {
    encerrarSessaoSolicitacoes();
    return;
  }

  setupAbasNavegacao();
  carregarSolicitacoes();
  setupSolicitacaoEvents();
});

// 1. Alternar entre as abas Catálogo, Solicitações e Aprovações
function setupAbasNavegacao() {
  const tabCatalogo = document.getElementById('tabCatalogo');
  const tabSolicitacoes = document.getElementById('tabSolicitacoes');
  const secaoCatalogo = document.getElementById('secaoCatalogo');
  const secaoSolicitacoes = document.getElementById('secaoSolicitacoes');
  const btnNovoProduto = document.getElementById('btnNovoProduto');
  const btnNovaSolicitacao = document.getElementById('btnNovaSolicitacao');

  if (!tabCatalogo || !tabSolicitacoes) return;

  tabCatalogo.addEventListener('click', () => {
    tabCatalogo.className =
      'flex items-center space-x-2 text-xs font-semibold text-[#0F392B] dark:text-emerald-400 pb-2 border-b-2 border-[#0F392B] dark:border-emerald-400 cursor-pointer';
    tabSolicitacoes.className =
      'flex items-center space-x-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 pb-2 transition-colors cursor-pointer';

    secaoCatalogo?.classList.remove('hidden');
    secaoSolicitacoes?.classList.add('hidden');

    btnNovoProduto?.classList.remove('hidden');
    btnNovaSolicitacao?.classList.add('hidden');
  });

  tabSolicitacoes.addEventListener('click', () => {
    tabSolicitacoes.className =
      'flex items-center space-x-2 text-xs font-semibold text-[#0F392B] dark:text-emerald-400 pb-2 border-b-2 border-[#0F392B] dark:border-emerald-400 cursor-pointer';
    tabCatalogo.className =
      'flex items-center space-x-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 pb-2 transition-colors cursor-pointer';

    secaoSolicitacoes?.classList.remove('hidden');
    secaoCatalogo?.classList.add('hidden');

    btnNovaSolicitacao?.classList.remove('hidden');
    btnNovoProduto?.classList.add('hidden');

    carregarSolicitacoes();
  });

  btnNovaSolicitacao?.classList.add('hidden');
}

// 2. Carregar e Renderizar Solicitações na Tabela + Atualizar Badge de Pendentes
async function carregarSolicitacoes() {
  const tbody = document.getElementById('tabelaSolicitacoesBody');
  if (!tbody) return;

  try {
    const res = await fetchSeguraSolicitacoes('/api/solicitacoes', {
      method: 'GET'
    });
    if (!res) return;

    if (!res.ok) throw new Error('Erro ao carregar solicitações');

    const solicitacoes = await res.json();

    const pendentesCount = Array.isArray(solicitacoes)
      ? solicitacoes.filter((s) => s.status === 'pendente').length
      : 0;

    let badgeTab = document.getElementById('badgeTabSolicitacoes');
    const tabSolicitacoes = document.getElementById('tabSolicitacoes');

    if (!badgeTab && tabSolicitacoes) {
      badgeTab = document.createElement('span');
      badgeTab.id = 'badgeTabSolicitacoes';
      badgeTab.className =
        'px-1.5 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/80 rounded-full border border-amber-700/50 hidden';
      tabSolicitacoes.appendChild(badgeTab);
    }

    if (badgeTab) {
      if (pendentesCount > 0) {
        badgeTab.textContent = pendentesCount;
        badgeTab.classList.remove('hidden');
      } else {
        badgeTab.classList.add('hidden');
      }
    }

    if (!Array.isArray(solicitacoes) || solicitacoes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400 font-medium text-xs">Nenhuma solicitação registrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = solicitacoes
      .map((s, index) => {
        const dataFormatada = s.created_at ? new Date(s.created_at).toLocaleString('pt-BR') : 'Data não informada';
        const prodNome = s.produtos?.nome || s.nome_produto || 'Produto Indisponível';
        const solicitanteNome = s.solicitante
          ? s.solicitante
          : '<span class="text-slate-400 dark:text-slate-500 italic">Não informado</span>';

        let badgePrioridade = `<span class="px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-full">Média</span>`;
        if (s.prioridade === 'alta') {
          badgePrioridade = `<span class="px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 rounded-full border border-rose-200 dark:border-rose-900/50">Alta</span>`;
        } else if (s.prioridade === 'baixa') {
          badgePrioridade = `<span class="px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 rounded-full border border-blue-200 dark:border-blue-900/50">Baixa</span>`;
        }

        let badgeStatus = `<span class="px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 rounded-full border border-amber-200 dark:border-amber-900/50">Pendente</span>`;
        let acoes = `
        <button onclick="alterarStatusSolicitacao('${s.id}', 'aprovada')" class="p-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800/50 shadow-xs transition-colors mr-1 cursor-pointer" title="Aprovar e repor estoque">
          <i class="fa-solid fa-check text-xs"></i>
        </button>
        <button onclick="alterarStatusSolicitacao('${s.id}', 'cancelada')" class="p-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-800/50 shadow-xs transition-colors cursor-pointer" title="Cancelar solicitação">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      `;

        if (s.status === 'aprovada') {
          badgeStatus = `<span class="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 rounded-full border border-emerald-200 dark:border-emerald-800/50">Aprovada</span>`;
          acoes = `<span class="text-xs text-slate-400 font-medium">Finalizada</span>`;
        } else if (s.status === 'cancelada') {
          badgeStatus = `<span class="px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 rounded-full border border-rose-200 dark:border-rose-900/50">Cancelada</span>`;
          acoes = `<span class="text-xs text-slate-400 font-medium">Cancelada</span>`;
        }

        return `
        <tr class="hover:bg-slate-50/80 dark:hover:bg-[#15241F]/60 transition-colors border-b border-slate-100 dark:border-[#1C2C26]">
          <td class="py-3.5 px-6 text-xs text-slate-500 dark:text-slate-400">#${index + 1} <br>${dataFormatada}</td>
          <td class="py-3.5 px-6 text-xs font-bold text-slate-800 dark:text-slate-200">${prodNome}</td>
          <td class="py-3.5 px-6 text-xs font-semibold text-slate-700 dark:text-slate-300">${s.quantidade} un.</td>
          <td class="py-3.5 px-6 text-xs font-medium text-slate-700 dark:text-slate-300">${solicitanteNome}</td>
          <td class="py-3.5 px-6">${badgePrioridade}</td>
          <td class="py-3.5 px-6">${badgeStatus}</td>
          <td class="py-3.5 px-6 text-xs text-slate-400 dark:text-slate-500">${s.observacao || '-'}</td>
          <td class="py-3.5 px-6 text-right whitespace-nowrap">${acoes}</td>
        </tr>
      `;
      })
      .join('');
  } catch (err) {
    console.error('Erro ao carregar solicitações:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-rose-400 font-medium text-xs">Erro ao carregar solicitações.</td></tr>`;
  }
}

// 3. Função Auxiliar para Exibir o Modal Personalizado de Confirmação (Usa a função global unificada do HTML)
async function mostrarModalConfirmacaoPersonalizado(mensagem, status) {
  if (typeof window.mostrarConfirmacaoCustomizada === 'function') {
    return await window.mostrarConfirmacaoCustomizada(mensagem);
  }
  // Fallback caso a função global não exista
  return confirm(mensagem);
}

// 4. Aprovar ou Cancelar Solicitação
async function alterarStatusSolicitacao(id, status) {
  const acaoTexto = status === 'aprovada' ? 'aprovar e dar entrada no estoque' : 'cancelar';

  const confirmado = await mostrarModalConfirmacaoPersonalizado(`Deseja realmente ${acaoTexto} esta solicitação?`, status);
  if (!confirmado) return;

  try {
    const res = await fetchSeguraSolicitacoes(`/api/solicitacoes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });

    if (!res) return;

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || 'Erro ao atualizar status.');
      return;
    }

    await carregarSolicitacoes();
    if (typeof carregarProdutos === 'function') {
      carregarProdutos();
    }
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    alert('Erro de comunicação com o servidor.');
  }
}
window.alterarStatusSolicitacao = alterarStatusSolicitacao;

// 5. Modais e Dropdowns Customizados para Produtos e Prioridade
function setupSolicitacaoEvents() {
  const modal = document.getElementById('modalSolicitacao');
  const btnAbrir = document.getElementById('btnNovaSolicitacao');
  const btnFechar = document.getElementById('btnFecharModalSol');
  const btnCancelar = document.getElementById('btnCancelarModalSol');
  const form = document.getElementById('formSolicitacao');
  const inputSolicitante = document.getElementById('solSolicitante');

  const btnToggleSelect = document.getElementById('btnToggleCustomSelect');
  const textoSelecionado = document.getElementById('textoProdutoSelecionado');
  const inputHiddenId = document.getElementById('solProdutoId');
  const dropdownOptions = document.getElementById('dropdownCustomOptions');
  const iconeSeta = document.getElementById('iconeSetaSelect');

  const btnTogglePri = document.getElementById('btnToggleCustomPrioridade');
  const textoPriSelecionada = document.getElementById('textoPrioridadeSelecionada');
  const inputHiddenPri = document.getElementById('solPrioridade');
  const dropdownPriOptions = document.getElementById('dropdownCustomOptionsPrioridade');
  const iconeSetaPri = document.getElementById('iconeSetaPrioridade');

  const carregarDropdownProdutos = async () => {
    try {
      const res = await fetchSeguraSolicitacoes('/api/produtos', {
        method: 'GET'
      });
      if (!res) return;

      if (res.ok) {
        const produtos = await res.json();

        if (!dropdownOptions) return;

        if (!Array.isArray(produtos) || produtos.length === 0) {
          dropdownOptions.innerHTML = `<div class="p-3 text-center text-slate-400 text-xs">Nenhum produto cadastrado</div>`;
          return;
        }

        dropdownOptions.innerHTML = produtos
          .map((p) => {
            const estoque = p.estoque ?? p.quantidade ?? 0;
            return `
            <div class="p-3 hover:bg-slate-50 dark:hover:bg-[#15241F] transition-colors cursor-pointer flex items-center justify-between item-opcao-produto"
              data-id="${p.id}" data-nome="${p.nome}" data-estoque="${estoque}">
              <span class="font-medium text-slate-800 dark:text-slate-200">${p.nome}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">Estoque: ${estoque} un.</span>
            </div>
          `;
          })
          .join('');

        if (btnToggleSelect) {
          btnToggleSelect.onclick = (e) => {
            e.stopPropagation();
            dropdownOptions.classList.toggle('hidden');
            dropdownPriOptions?.classList.add('hidden');
            if (iconeSeta) {
              iconeSeta.style.transform = dropdownOptions.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
            }
          };
        }

        document.querySelectorAll('.item-opcao-produto').forEach((item) => {
          item.onclick = (e) => {
            e.stopPropagation();
            const id = item.getAttribute('data-id');
            const nome = item.getAttribute('data-nome');
            const estoque = item.getAttribute('data-estoque');

            if (inputHiddenId) inputHiddenId.value = id;
            if (textoSelecionado) {
              textoSelecionado.textContent = `${nome} (Estoque: ${estoque} un.)`;
              textoSelecionado.className = 'truncate text-slate-800 dark:text-slate-100 font-medium';
            }

            dropdownOptions.classList.add('hidden');
            if (iconeSeta) iconeSeta.style.transform = 'rotate(0deg)';
          };
        });
      }
    } catch (err) {
      console.error('Erro ao carregar produtos para solicitação:', err);
    }
  };

  if (btnTogglePri && dropdownPriOptions) {
    btnTogglePri.onclick = (e) => {
      e.stopPropagation();
      dropdownPriOptions.classList.toggle('hidden');
      dropdownOptions?.classList.add('hidden');
      if (iconeSetaPri) {
        iconeSetaPri.style.transform = dropdownPriOptions.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    };

    document.querySelectorAll('.item-opcao-prioridade').forEach((item) => {
      item.onclick = (e) => {
        e.stopPropagation();
        const valor = item.getAttribute('data-valor');
        const texto = item.textContent;

        if (inputHiddenPri) inputHiddenPri.value = valor;
        if (textoPriSelecionada) {
          textoPriSelecionada.textContent = texto;
        }

        dropdownPriOptions.classList.add('hidden');
        if (iconeSetaPri) iconeSetaPri.style.transform = 'rotate(0deg)';
      };
    });
  }

  document.addEventListener('click', () => {
    dropdownOptions?.classList.add('hidden');
    dropdownPriOptions?.classList.add('hidden');
    if (iconeSeta) iconeSeta.style.transform = 'rotate(0deg)';
    if (iconeSetaPri) iconeSetaPri.style.transform = 'rotate(0deg)';
  });

  const abrir = async () => {
    form?.reset();

    if (textoSelecionado) {
      textoSelecionado.textContent = 'Selecione o produto...';
      textoSelecionado.className = 'truncate text-slate-400';
    }
    if (inputHiddenId) inputHiddenId.value = '';
    if (dropdownOptions) dropdownOptions.classList.add('hidden');

    if (inputHiddenPri) inputHiddenPri.value = 'media';
    if (textoPriSelecionada) textoPriSelecionada.textContent = 'Média';
    if (dropdownPriOptions) dropdownPriOptions.classList.add('hidden');

    if (inputSolicitante) {
      try {
        const userString = localStorage.getItem('nexus_user');
        const u = JSON.parse(userString || '{}');
        inputSolicitante.value =
          localStorage.getItem('nexus_user_name') ||
          u.nome ||
          u.user_metadata?.nome ||
          u.user_metadata?.full_name ||
          'Administrador';
      } catch {
        inputSolicitante.value = 'Administrador';
      }
    }

    await carregarDropdownProdutos();
    modal?.classList.remove('hidden');
  };

  const fechar = () => modal?.classList.add('hidden');

  btnAbrir?.addEventListener('click', abrir);
  btnFechar?.addEventListener('click', fechar);
  btnCancelar?.addEventListener('click', fechar);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const produto_id = inputHiddenId?.value;
    if (!produto_id) {
      alert('Por favor, selecione um produto.');
      return;
    }

    const quantidade = parseInt(document.getElementById('solQuantidade')?.value, 10);
    const prioridade = inputHiddenPri?.value || 'media';
    const solicitante = document.getElementById('solSolicitante')?.value.trim() || 'Administrador';
    const observacao = document.getElementById('solObservacao')?.value.trim() || '';

    try {
      const res = await fetchSeguraSolicitacoes('/api/solicitacoes', {
        method: 'POST',
        body: JSON.stringify({ produto_id, quantidade, prioridade, solicitante, observacao })
      });

      if (!res) return;

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || 'Erro ao enviar solicitação.');
        return;
      }

      fechar();
      await carregarSolicitacoes();
    } catch (err) {
      console.error('Erro ao registrar solicitação:', err);
      alert('Falha na comunicação com o servidor.');
    }
  });
}
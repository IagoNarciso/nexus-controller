let isRedirectingProdutos = false;

// Função centralizada para requisições autenticadas e prevenção de loop 401
async function fetchSeguraProdutos(url, options = {}) {
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) {
    encerrarSessaoProdutos();
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
      encerrarSessaoProdutos();
      return null;
    }

    return response;
  } catch (error) {
    throw error;
  }
}

function encerrarSessaoProdutos() {
  if (isRedirectingProdutos) return;
  isRedirectingProdutos = true;

  console.warn('Sessão expirada ou inválida em Produtos (401). A redirecionar para login...');
  localStorage.removeItem('token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('nexus_token');
  localStorage.removeItem('nexus_user');
  localStorage.removeItem('nexus_user_name');
  sessionStorage.clear();

  window.location.replace('login.html');
}

// Paleta de cores para os avatares dos produtos
const avatarBgColors = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
];

let produtosCache = [];
let produtosPendentesCache = [];
let fornecedoresCache = [];
let statusFiltroAtivo = 'todos';
let produtoParaExcluirId = null;

// Aplicação instantânea do cache de pendências ao carregar o script
(function aplicarCacheInstantaneo() {
  let userObj = {};
  try {
    userObj = JSON.parse(localStorage.getItem('nexus_user') || '{}');
  } catch (e) {}
  const rawRole = localStorage.getItem('nexus_user_role') || userObj.role || userObj.cargo || 'Administrador';
  const isOperador = String(rawRole).toLowerCase().trim() === 'operador';

  const cacheSalvo = localStorage.getItem('nexus_pendentes_cache');
  if (cacheSalvo !== null && !isOperador) {
    const qtdCache = parseInt(cacheSalvo, 10);
    const badgeMenuProdutos = document.getElementById('badgeMenuProdutos');
    const badgeTabAprovacoes = document.getElementById('badgeTabAprovacoes');

    if (qtdCache > 0) {
      if (badgeMenuProdutos) {
        badgeMenuProdutos.textContent = qtdCache;
        badgeMenuProdutos.classList.remove('hidden');
      }
      if (badgeTabAprovacoes) {
        badgeTabAprovacoes.textContent = qtdCache;
        badgeTabAprovacoes.classList.remove('hidden');
      }
    }
  }
})();

function obterMetaLocalProdutos() {
  try {
    return JSON.parse(localStorage.getItem('nexus_produtos_meta') || '{}');
  } catch {
    return {};
  }
}

function salvarMetaLocalProduto(chave, dadosMeta) {
  if (!chave) return;
  const chaveNormalizada = String(chave).trim();
  if (!chaveNormalizada) return;

  const metaAtual = obterMetaLocalProdutos();
  metaAtual[chaveNormalizada] = { ...(metaAtual[chaveNormalizada] || {}), ...dadosMeta };
  localStorage.setItem('nexus_produtos_meta', JSON.stringify(metaAtual));
}

function obterMetaPorProduto(p, metaLocal) {
  if (!p || !metaLocal) return {};
  const chaveNome = (p.nome || '').toLowerCase().trim();
  return (
    metaLocal[p.id] ||
    (p.sku && metaLocal[p.sku]) ||
    (chaveNome && metaLocal[`nome:${chaveNome}`]) ||
    {}
  );
}

function gerarSKU(categoria) {
  const catLimpa = (categoria || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-zA-Z]/g, '');
  const prefixo = catLimpa.length >= 3 ? catLimpa.substring(0, 3).toUpperCase() : 'PRD';
  const numeroAleatorio = Math.floor(1000 + Math.random() * 9000);
  return `${prefixo}-${numeroAleatorio}`;
}

function tratarPrecoInput(valorTexto) {
  if (valorTexto === null || valorTexto === undefined || valorTexto === '') return 0;
  if (String(valorTexto).includes(',')) {
    const limpo = String(valorTexto).replace(/\./g, '').replace(',', '.');
    return parseFloat(limpo) || 0;
  }
  return parseFloat(valorTexto) || 0;
}

function calcularDadosMargem(precoCusto, precoVenda) {
  const custo = Number(precoCusto || 0);
  const venda = Number(precoVenda || 0);

  if (custo <= 0 || venda <= 0) {
    return { temMargem: false, lucroBruto: 0, margemPercentual: 0 };
  }

  const lucroBruto = venda - custo;
  const margemPercentual = (lucroBruto / venda) * 100;

  return {
    temMargem: true,
    lucroBruto,
    margemPercentual
  };
}

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
  } catch (err) {
    console.warn('Erro ao aplicar preferências globais:', err);
  }
}

// Oculta a aba e a secção de Aprovações caso o utilizador seja Operador
function aplicarRestricaoAprovacoesProdutos() {
  let userObj = {};
  try {
    userObj = JSON.parse(
      localStorage.getItem('nexus_user') ||
      localStorage.getItem('user') ||
      localStorage.getItem('usuario') ||
      '{}'
    );
  } catch (e) {}

  const rawRole =
    localStorage.getItem('nexus_user_role') ||
    localStorage.getItem('nexus_user_nivel') ||
    userObj.role ||
    userObj.cargo ||
    'Administrador';

  const roleLower = String(rawRole).toLowerCase().trim();
  const isOperador = roleLower === 'operador' || roleLower === 'operator';

  if (isOperador) {
    const tabAprovacoes = document.getElementById('tabAprovacoes');
    if (tabAprovacoes) {
      const containerTab = tabAprovacoes.closest('button, li') || tabAprovacoes;
      containerTab.style.display = 'none';
    }

    const secaoAprovacoes = document.getElementById('secaoAprovacoes') || document.getElementById('secaoAprovacoesContainer');
    if (secaoAprovacoes) {
      secaoAprovacoes.style.display = 'none';
    }
  }
}

async function inicializarPaginaProdutos() {
  aplicarPreferenciasGlobais();
  aplicarRestricaoAprovacoesProdutos();

  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  const userString = localStorage.getItem('nexus_user');
  let user = {};

  if (!token) {
    encerrarSessaoProdutos();
    return;
  }

  try {
    user = userString ? JSON.parse(userString) : {};
  } catch (e) {
    console.error('Erro ao ler usuário:', e);
  }

  const nomeCompleto =
    localStorage.getItem('nexus_user_name') ||
    user.nome ||
    user.user_metadata?.nome ||
    user.user_metadata?.full_name ||
    'Utilizador';
  const userNameElem = document.getElementById('userName');
  const userAvatarElem = document.getElementById('userAvatar');

  if (userNameElem) userNameElem.textContent = nomeCompleto;
  if (userAvatarElem) {
    const names = nomeCompleto.trim().split(' ').filter(Boolean);
    userAvatarElem.textContent =
      names.length > 1
        ? (names[0][0] + names[names.length - 1][0]).toUpperCase()
        : names[0].substring(0, 2).toUpperCase();
  }

  setupTopbarDropdowns();
  setupAbasNavegacao();

  await carregarFornecedoresSugestao();
  await carregarProdutos();
  
  // Operadores não precisam carregar produtos pendentes se não têm acesso à aba
  let userObj = {};
  try {
    userObj = JSON.parse(localStorage.getItem('nexus_user') || '{}');
  } catch (e) {}
  const rawRole = localStorage.getItem('nexus_user_role') || userObj.role || userObj.cargo || 'Administrador';
  const isOperador = String(rawRole).toLowerCase().trim() === 'operador';

  if (!isOperador) {
    await carregarProdutosPendentes();
  } else {
    const badgeMenuProdutos = document.getElementById('badgeMenuProdutos');
    if (badgeMenuProdutos) badgeMenuProdutos.classList.add('hidden');
  }

  document.getElementById('inputSearchProdutos')?.addEventListener('input', aplicarFiltros);

  document.querySelectorAll('.btn-filtro-status').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const botaoClicado = e.currentTarget;
      statusFiltroAtivo = botaoClicado.getAttribute('data-status') || 'todos';

      document.querySelectorAll('.btn-filtro-status').forEach((b) => {
        b.classList.remove(
          'bg-white',
          'dark:bg-[#1E332C]',
          'text-slate-800',
          'dark:text-slate-100',
          'shadow-2xs',
          'font-semibold'
        );
        b.classList.add('text-slate-500', 'dark:text-slate-400', 'font-medium');
      });

      botaoClicado.classList.remove('text-slate-500', 'dark:text-slate-400', 'font-medium');
      botaoClicado.classList.add(
        'bg-white',
        'dark:bg-[#1E332C]',
        'text-slate-800',
        'dark:text-slate-100',
        'shadow-2xs',
        'font-semibold'
      );

      aplicarFiltros();
    });
  });

  document.getElementById('btnExportar')?.addEventListener('click', exportarProdutosCSV);

  document.getElementById('prodCategoria')?.addEventListener('input', (e) => {
    const id = document.getElementById('prodId')?.value;
    const skuInput = document.getElementById('prodSku');
    if (!id && skuInput) {
      skuInput.value = gerarSKU(e.target.value);
    }
  });

  setupModalEvents();
  setupConfirmacaoExclusao();
  setupModalSuporte();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarPaginaProdutos);
} else {
  inicializarPaginaProdutos();
}

function setupAbasNavegacao() {
  const tabCatalogo = document.getElementById('tabCatalogo');
  const tabSolicitacoes = document.getElementById('tabSolicitacoes');
  const tabAprovacoes = document.getElementById('tabAprovacoes');

  const secaoCatalogo = document.getElementById('secaoCatalogo');
  const secaoSolicitacoes = document.getElementById('secaoSolicitacoes');
  const secaoAprovacoes = document.getElementById('secaoAprovacoes');

  if (!tabCatalogo || !tabSolicitacoes) return;

  const classeAtiva =
    'flex items-center space-x-2 text-xs font-semibold text-[#0F392B] dark:text-emerald-400 pb-2 border-b-2 border-[#0F392B] dark:border-emerald-400 cursor-pointer';
  const classeInativa =
    'flex items-center space-x-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 pb-2 transition-colors cursor-pointer';

  tabCatalogo.addEventListener('click', () => {
    tabCatalogo.className = classeAtiva;
    tabSolicitacoes.className = classeInativa;
    if (tabAprovacoes) tabAprovacoes.className = classeInativa;

    secaoCatalogo?.classList.remove('hidden');
    secaoSolicitacoes?.classList.add('hidden');
    secaoAprovacoes?.classList.add('hidden');
  });

  tabSolicitacoes.addEventListener('click', () => {
    tabSolicitacoes.className = classeAtiva;
    tabCatalogo.className = classeInativa;
    if (tabAprovacoes) tabAprovacoes.className = classeInativa;

    secaoSolicitacoes?.classList.remove('hidden');
    secaoCatalogo?.classList.add('hidden');
    secaoAprovacoes?.classList.add('hidden');
  });

  if (tabAprovacoes) {
    tabAprovacoes.addEventListener('click', async () => {
      tabAprovacoes.className = classeAtiva;
      tabCatalogo.className = classeInativa;
      tabSolicitacoes.className = classeInativa;

      secaoAprovacoes?.classList.remove('hidden');
      secaoCatalogo?.classList.add('hidden');
      secaoSolicitacoes?.classList.add('hidden');

      await carregarProdutosPendentes();
    });
  }
}

async function carregarFornecedoresSugestao() {
  try {
    const res = await fetchSeguraProdutos('/api/fornecedores');
    if (!res) return;

    if (res.ok) {
      const dados = await res.json();
      if (Array.isArray(dados)) {
        fornecedoresCache = dados;
      }
    }
  } catch {}
}

function atualizarDatalistsModal() {
  const datalistForn = document.getElementById('listaFornecedores');

  if (datalistForn) {
    const nomesDaApi = fornecedoresCache
      .map((f) => (f.nome || f.razao_social || f.empresa || '').trim())
      .filter(Boolean);
    const nomesDosProdutos = produtosCache.map((p) => (p.fornecedor || '').trim()).filter(Boolean);
    const todosFornecedores = [...new Set([...nomesDaApi, ...nomesDosProdutos])].sort();

    datalistForn.innerHTML = todosFornecedores
      .map((forn) => `<option value="${forn.replace(/"/g, '&quot;')}"></option>`)
      .join('');
  }
}

function setupTopbarDropdowns() {
  const btnPerfilMenu = document.getElementById('btnPerfilMenu');
  const dropdownPerfil = document.getElementById('dropdownPerfil');
  const btnNotificacoes = document.getElementById('btnNotificacoes');
  const dropdownNotificacoes = document.getElementById('dropdownNotificacoes');
  const sidebarLogoutBtn = document.getElementById('logoutBtn');

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

  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      encerrarSessaoProdutos();
    });
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
    const res = await fetchSeguraProdutos('/api/produtos');
    if (!res) return;

    if (res.ok) {
      const produtos = await res.json();
      const metaLocal = obterMetaLocalProdutos();

      const criticos = produtos.filter((p) => {
        if (p.status === 'pendente' || p.status === 'rejeitado') return false;
        const meta = obterMetaPorProduto(p, metaLocal);
        const estoque = Number(p.estoque ?? p.quantidade ?? 0);
        const min = Number(p.quantidade_minima ?? p.estoque_minimo ?? meta.quantidade_minima ?? 12);
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

async function carregarProdutos() {
  try {
    const response = await fetchSeguraProdutos('/api/produtos');
    if (!response) return;

    if (response.ok) {
      const dadosApi = await response.json();
      const metaLocal = obterMetaLocalProdutos();

      const apenasAprovados = dadosApi.filter((p) => p.status !== 'pendente' && p.status !== 'rejeitado');

      produtosCache = apenasAprovados.map((p) => {
        const meta = obterMetaPorProduto(p, metaLocal);
        const custoBanco = Number(p.preco_custo ?? p.custo ?? p.preco_compra ?? 0);
        const custoMeta = Number(meta.preco_custo ?? 0);
        const precoCustoReal = custoBanco > 0 ? custoBanco : custoMeta;

        // Sincroniza o ID do produto no cache local caso tenha sido salvo apenas por SKU ou nome
        if (precoCustoReal > 0 && p.id) {
          salvarMetaLocalProduto(p.id, {
            preco_custo: precoCustoReal,
            quantidade_minima: p.quantidade_minima ?? p.estoque_minimo ?? meta.quantidade_minima ?? 12,
            fornecedor: p.fornecedor ?? p.fornecedor_nome ?? meta.fornecedor ?? ''
          });
        }

        return {
          ...p,
          preco_custo: precoCustoReal,
          quantidade_minima: p.quantidade_minima ?? p.estoque_minimo ?? meta.quantidade_minima ?? 12,
          fornecedor: p.fornecedor ?? p.fornecedor_nome ?? meta.fornecedor ?? ''
        };
      });
    } else {
      produtosCache = [];
    }

    atualizarDatalistsModal();
    atualizarContadoresFiltro();
    aplicarFiltros();
  } catch (error) {
    produtosCache = [];
    atualizarContadoresFiltro();
    renderizarTabela([]);
  }
}

async function carregarProdutosPendentes() {
  try {
    const res = await fetchSeguraProdutos('/api/produtos/pendentes');
    if (!res) return;

    if (res.ok) {
      const dados = await res.json();
      produtosPendentesCache = Array.isArray(dados) ? dados : [];
    } else {
      produtosPendentesCache = [];
    }

    renderizarTabelaAprovacoes(produtosPendentesCache);
  } catch (err) {
    produtosPendentesCache = [];
    renderizarTabelaAprovacoes([]);
  }
}

async function renderizarTabelaAprovacoes(pendentes) {
  const tbody = document.getElementById('tabelaAprovacoesBody');
  const badgeAprovacoes = document.getElementById('badgeTabAprovacoes');
  const badgeSolicitacoes = document.getElementById('badgeTabSolicitacoes');
  const badgeMenuProdutos = document.getElementById('badgeMenuProdutos');
  const secaoAprovacoes = document.getElementById('secaoAprovacoes');

  // Verifica se é operador para forçar a ocultação do badge na sidebar
  let userObj = {};
  try {
    userObj = JSON.parse(localStorage.getItem('nexus_user') || '{}');
  } catch (e) {}
  const rawRole = localStorage.getItem('nexus_user_role') || userObj.role || userObj.cargo || 'Administrador';
  const isOperador = String(rawRole).toLowerCase().trim() === 'operador';

  if (isOperador) {
    if (badgeMenuProdutos) badgeMenuProdutos.classList.add('hidden');
    return;
  }

  const qtdAprovacoes = Array.isArray(pendentes) ? pendentes.length : 0;

  let qtdSolicitacoes = 0;
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('access_token') || localStorage.getItem('nexus_token');
    const resSol = await fetch('/api/solicitacoes', { headers: { 'Authorization': `Bearer ${token}` } });
    if (resSol.ok) {
      const solicitacoes = await resSol.json();
      const pendentesSol = Array.isArray(solicitacoes) 
        ? solicitacoes.filter(s => (s.status || '').toLowerCase() === 'pendente') 
        : [];
      qtdSolicitacoes = pendentesSol.length;

      if (badgeSolicitacoes) {
        if (qtdSolicitacoes > 0) {
          badgeSolicitacoes.textContent = qtdSolicitacoes;
          badgeSolicitacoes.classList.remove('hidden');
        } else {
          badgeSolicitacoes.classList.add('hidden');
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao buscar contagem de solicitações:', e);
  }

  const totalGeralPendentes = qtdAprovacoes + qtdSolicitacoes;

  localStorage.setItem('nexus_pendentes_cache', totalGeralPendentes);

  if (badgeAprovacoes) {
    if (qtdAprovacoes > 0) {
      badgeAprovacoes.textContent = qtdAprovacoes;
      badgeAprovacoes.classList.remove('hidden');
    } else {
      badgeAprovacoes.textContent = '0';
      badgeAprovacoes.classList.add('hidden');
    }
  }

  if (badgeMenuProdutos) {
    if (totalGeralPendentes > 0) {
      badgeMenuProdutos.textContent = totalGeralPendentes;
      badgeMenuProdutos.classList.remove('hidden');
    } else {
      badgeMenuProdutos.classList.add('hidden');
    }
  }

  if (secaoAprovacoes && qtdAprovacoes > 0) {
    secaoAprovacoes.classList.remove('hidden');
  }

  if (!tbody) return;

  if (qtdAprovacoes === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-slate-400 font-medium text-xs">
          Nenhum produto pendente de aprovação no momento.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pendentes
    .map((p) => {
      const precoVenda = Number(p.preco_venda ?? p.preco ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
      const estoque = Number(p.estoque ?? p.quantidade ?? 0);
      const dataSubmissao = p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : 'Data N/A';

      return `
      <tr class="hover:bg-slate-50/80 dark:hover:bg-[#15241F]/60 transition-colors">
        <td class="py-3.5 px-6">
          <p class="font-bold text-slate-800 dark:text-slate-200 text-xs">${p.nome || 'Sem nome'}</p>
          <p class="text-[10px] text-slate-400 font-medium">${p.sku || 'N/A'}</p>
        </td>
        <td class="py-3.5 px-4 text-xs font-medium text-slate-600 dark:text-slate-300">
          ${p.categoria || 'Geral'}
        </td>
        <td class="py-3.5 px-4 text-xs font-semibold text-slate-800 dark:text-slate-200">
          ${estoque} un.
        </td>
        <td class="py-3.5 px-4 text-xs font-bold text-slate-800 dark:text-slate-100">
          ${precoVenda}
        </td>
        <td class="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400">
          ${dataSubmissao}
        </td>
        <td class="py-3.5 px-6 text-right space-x-2 whitespace-nowrap">
          <button type="button" onclick="moderarProduto('${p.id}', 'aprovado')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-xs cursor-pointer">
            <i class="fa-solid fa-check mr-1"></i> Aprovar
          </button>
          <button type="button" onclick="moderarProduto('${p.id}', 'rejeitado')" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-xs cursor-pointer">
            <i class="fa-solid fa-xmark mr-1"></i> Rejeitar
          </button>
        </td>
      </tr>
    `;
    })
    .join('');
}

async function moderarProduto(id, novoStatus) {
  const isAprovacao = novoStatus === 'aprovado';
  const acaoTexto = isAprovacao ? 'aprovar' : 'rejeitar';

  const textoMsg = document.getElementById('textoMensagemConfirmacao');
  const btnAceitar = document.getElementById('btnAceitarConfirmacao');

  if (textoMsg) {
    textoMsg.textContent = `Deseja realmente ${acaoTexto} este produto?`;
  }

  if (btnAceitar) {
    btnAceitar.textContent = isAprovacao ? 'Sim, Aprovar' : 'Sim, Rejeitar';

    if (isAprovacao) {
      btnAceitar.className =
        'px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs cursor-pointer';
    } else {
      btnAceitar.className =
        'px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs cursor-pointer';
    }
  }

  const modalConfirmacao = document.getElementById('modalConfirmacaoAprovacao');
  if (!modalConfirmacao) {
    if (!confirm(`Tem a certeza de que deseja ${acaoTexto} este produto?`)) return;
    await executarModeracao(id, novoStatus);
    return;
  }

  modalConfirmacao.classList.remove('hidden');

  const btnCancelar = document.getElementById('btnCancelarConfirmacao');

  const limparEventos = () => {
    btnAceitar.replaceWith(btnAceitar.cloneNode(true));
    btnCancelar.replaceWith(btnCancelar.cloneNode(true));
    modalConfirmacao.classList.add('hidden');
  };

  document.getElementById('btnAceitarConfirmacao').addEventListener('click', async () => {
    limparEventos();
    await executarModeracao(id, novoStatus);
  });

  document.getElementById('btnCancelarConfirmacao').addEventListener('click', () => {
    limparEventos();
  });
}

async function executarModeracao(id, novoStatus) {
  try {
    const res = await fetchSeguraProdutos(`/api/produtos/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: novoStatus })
    });

    if (!res) return;

    if (res.ok) {
      const acaoMsg = novoStatus === 'aprovado' ? 'aprovado' : 'rejeitado';
      mostrarNotificacaoToast(`Produto ${acaoMsg} com sucesso!`, 'sucesso');

      await carregarProdutos();
      await carregarProdutosPendentes();
    } else {
      const data = await res.json();
      mostrarNotificacaoToast(data.error || 'Erro ao processar moderação.', 'erro');
    }
  } catch (err) {
    mostrarNotificacaoToast('Erro de comunicação com o servidor.', 'erro');
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

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function atualizarContadoresFiltro() {
  const elTodos = document.getElementById('countFiltroTodos');
  const elNormal = document.getElementById('countFiltroNormal');
  const elBaixo = document.getElementById('countFiltroBaixo');
  const dotNotificacao = document.getElementById('dotNotificacao');

  const total = produtosCache.length;
  let qtdNormal = 0;
  let qtdBaixo = 0;

  produtosCache.forEach((p) => {
    const estoque = Number(p.estoque ?? p.quantidade ?? 0);
    const min = Number(p.quantidade_minima ?? 12);
    if (estoque <= min) {
      qtdBaixo++;
    } else {
      qtdNormal++;
    }
  });

  if (elTodos) elTodos.textContent = `(${total})`;
  if (elNormal) elNormal.textContent = `(${qtdNormal})`;
  if (elBaixo) elBaixo.textContent = `(${qtdBaixo})`;

  if (dotNotificacao) {
    dotNotificacao.classList.toggle('hidden', qtdBaixo === 0);
  }
}

function renderizarTabela(produtos) {
  const tbody = document.getElementById('tabelaProdutosBody');
  const badgeTotal = document.getElementById('totalItensBadge');

  if (badgeTotal) {
    badgeTotal.textContent = `${produtosCache.length} ${produtosCache.length === 1 ? 'item cadastrado' : 'itens cadastrados'}`;
  }

  if (!tbody) return;

  if (produtos.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-slate-400 font-medium text-xs">
          Nenhum produto encontrado para os filtros selecionados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = produtos
    .map((p, index) => {
      const precoVenda = Number(p.preco_venda ?? p.preco ?? 0);
      const precoCusto = Number(p.preco_custo ?? 0);
      const estoque = Number(p.estoque ?? p.quantidade ?? 0);
      const estoqueMin = Number(p.quantidade_minima ?? 12);
      const fornecedor = (p.fornecedor || '').trim();

      const precoVendaFormatado = precoVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const precoCustoFormatado =
        precoCusto > 0
          ? precoCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : '<span class="text-slate-400 dark:text-slate-500 font-normal">Não informado</span>';

      const { temMargem, lucroBruto, margemPercentual } = calcularDadosMargem(precoCusto, precoVenda);
      let badgeMargemHTML = `<span class="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">Sem custo base</span>`;

      if (temMargem) {
        const lucroFormatado = lucroBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const corMargem =
          margemPercentual >= 20
            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200/60 dark:border-emerald-800/50'
            : margemPercentual > 0
              ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200/60 dark:border-amber-800/50'
              : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200/60 dark:border-rose-800/50';

        const sinal = margemPercentual > 0 ? '+' : '';
        badgeMargemHTML = `
        <div class="flex items-center space-x-1.5 mt-1" title="Lucro bruto por unidade: ${lucroFormatado}">
          <span class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded-md border ${corMargem}">
            ${sinal}${margemPercentual.toFixed(1)}%
          </span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">(${lucroFormatado})</span>
        </div>
      `;
      }

      const words = (p.nome || 'Produto').trim().split(' ').filter(Boolean);
      const initials =
        words.length > 1
          ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
          : words[0].substring(0, 2).toUpperCase();
      const colorClass = avatarBgColors[index % avatarBgColors.length];

      let statusBadge = `
      <span class="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 rounded-full border border-emerald-200/50 dark:border-emerald-800/50">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        <span>Estoque normal</span>
      </span>
    `;

      if (estoque === 0) {
        statusBadge = `
        <span class="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 rounded-full border border-rose-200/60 dark:border-rose-800/50">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
          <span>Esgotado</span>
        </span>
      `;
      } else if (estoque <= estoqueMin) {
        statusBadge = `
        <span class="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 rounded-full border border-amber-200/60 dark:border-amber-800/50">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span>Estoque baixo</span>
        </span>
      `;
      }

      if (p.ativo === false) {
        statusBadge = `
        <span class="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-[#1A2D27] rounded-full border border-slate-200 dark:border-[#243831]">
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          <span>Inativo</span>
        </span>
      `;
      }

      const corTextoEstoque =
        estoque <= estoqueMin
          ? 'text-amber-600 dark:text-amber-400 font-bold'
          : 'text-slate-800 dark:text-slate-200 font-semibold';

      const infoFornecedorHTML = fornecedor
        ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 font-normal mt-0.5 flex items-center space-x-1">
             <i class="fa-solid fa-truck-field text-[9px]"></i>
             <span class="truncate max-w-[140px]" title="${fornecedor}">${fornecedor}</span>
           </p>`
        : '';

      return `
      <tr class="hover:bg-slate-50/80 dark:hover:bg-[#15241F]/60 transition-colors">
        <td class="py-3.5 px-6">
          <div class="flex items-center space-x-3">
            <div class="w-9 h-9 rounded-xl ${colorClass} flex items-center justify-center font-bold text-xs shrink-0">
              ${initials}
            </div>
            <div>
              <p class="font-bold text-slate-800 dark:text-slate-200 text-xs">${p.nome}</p>
              <p class="text-[10px] text-slate-400 font-medium">${p.sku || 'N/A'}</p>
            </div>
          </div>
        </td>

        <td class="py-3.5 px-4">
          <p class="text-xs font-medium text-slate-600 dark:text-slate-300">${p.categoria || 'Geral'}</p>
          ${infoFornecedorHTML}
        </td>

        <td class="py-3.5 px-4">
          <p class="text-xs ${corTextoEstoque}">${estoque} un.</p>
          <p class="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">Mín: ${estoqueMin} un.</p>
        </td>

        <td class="py-3.5 px-4 text-xs font-medium text-slate-600 dark:text-slate-300">
          ${precoCustoFormatado}
        </td>

        <td class="py-3.5 px-4">
          <p class="text-xs font-bold text-slate-800 dark:text-slate-100">${precoVendaFormatado}</p>
          ${badgeMargemHTML}
        </td>

        <td class="py-3.5 px-4">
          ${statusBadge}
        </td>

        <td class="py-3.5 px-6 text-right space-x-1 whitespace-nowrap">
          <button type="button" onclick="editarProduto('${p.id}')" class="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer" title="Editar Produto">
            <i class="fa-solid fa-pen-to-square text-xs"></i>
          </button>
          
          <button type="button" onclick="alternarStatusProduto('${p.id}', ${p.ativo === false})" class="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer" title="${p.ativo !== false ? 'Desativar' : 'Ativar'}">
            <i class="fa-solid ${p.ativo !== false ? 'fa-toggle-on text-emerald-600 dark:text-emerald-400' : 'fa-toggle-off text-slate-400'} text-sm"></i>
          </button>
          
          <button type="button" onclick="confirmarExclusaoProduto('${p.id}', '${p.nome.replace(/'/g, "\\'")}')" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer" title="Excluir Produto">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      </tr>
    `;
    })
    .join('');
}

function aplicarFiltros() {
  const search = (document.getElementById('inputSearchProdutos')?.value || '').toLowerCase().trim();

  const filtrados = produtosCache.filter((p) => {
    const matchSearch =
      p.nome.toLowerCase().includes(search) ||
      (p.sku && p.sku.toLowerCase().includes(search)) ||
      (p.categoria && p.categoria.toLowerCase().includes(search)) ||
      (p.fornecedor && p.fornecedor.toLowerCase().includes(search));

    const estoque = Number(p.estoque ?? p.quantidade ?? 0);
    const min = Number(p.quantidade_minima ?? 12);

    let matchStatus = true;
    if (statusFiltroAtivo === 'normal') {
      matchStatus = estoque > min;
    } else if (statusFiltroAtivo === 'baixo') {
      matchStatus = estoque <= min;
    }

    return matchSearch && matchStatus;
  });

  renderizarTabela(filtrados);
}

function atualizarPreviewMargemModal() {
  const inputCusto = document.getElementById('prodPrecoCusto');
  const inputVenda = document.getElementById('prodPrecoVenda');
  const previewEl = document.getElementById('previewMargemModal');

  if (!previewEl) return;

  const custo = tratarPrecoInput(inputCusto?.value);
  const venda = tratarPrecoInput(inputVenda?.value);

  const { temMargem, margemPercentual } = calcularDadosMargem(custo, venda);

  if (!temMargem) {
    previewEl.textContent = '';
    return;
  }

  const sinal = margemPercentual > 0 ? '+' : '';
  previewEl.textContent = `Margem: ${sinal}${margemPercentual.toFixed(1)}%`;
  previewEl.className =
    margemPercentual > 0
      ? 'text-[10px] font-bold text-emerald-600 dark:text-emerald-400'
      : 'text-[10px] font-bold text-rose-600 dark:text-rose-400';
}

function setupModalEvents() {
  const modal = document.getElementById('modalProduto');
  const btnNovo = document.getElementById('btnNovoProduto');
  const btnFechar = document.getElementById('btnFecharModal');
  const btnCancelar = document.getElementById('btnCancelarModal');
  const form = document.getElementById('formProduto');
  const inputCusto = document.getElementById('prodPrecoCusto');
  const inputVenda = document.getElementById('prodPrecoVenda');

  inputCusto?.addEventListener('input', atualizarPreviewMargemModal);
  inputVenda?.addEventListener('input', atualizarPreviewMargemModal);

  const abrirModal = () => {
    form.reset();
    document.getElementById('prodId').value = '';
    document.getElementById('prodEstoqueMinimo').value = '';
    const inputForn = document.getElementById('prodFornecedor');
    if (inputForn) inputForn.value = '';
    const previewEl = document.getElementById('previewMargemModal');
    if (previewEl) previewEl.textContent = '';
    document.getElementById('modalTitulo').textContent = 'Novo Produto';
    atualizarDatalistsModal();
    modal.classList.remove('hidden');
  };

  const fecharModal = () => modal.classList.add('hidden');

  btnNovo?.addEventListener('click', abrirModal);
  btnFechar?.addEventListener('click', fecharModal);
  btnCancelar?.addEventListener('click', fecharModal);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('prodId').value;
    const nomeProduto = document.getElementById('prodNome').value.trim();
    const categoria = document.getElementById('prodCategoria').value.trim();
    const fornecedor = (document.getElementById('prodFornecedor')?.value || '').trim();
    let sku = document.getElementById('prodSku').value;

    if (!sku) {
      sku = gerarSKU(categoria);
      document.getElementById('prodSku').value = sku;
    }

    const precoCustoVal = tratarPrecoInput(document.getElementById('prodPrecoCusto')?.value);
    const precoVendaVal = tratarPrecoInput(document.getElementById('prodPrecoVenda')?.value);
    const estoqueVal = parseInt(document.getElementById('prodEstoque')?.value) || 0;

    const inputMinTexto = (document.getElementById('prodEstoqueMinimo')?.value || '').trim();
    const estoqueMinVal = inputMinTexto !== '' ? Math.max(1, parseInt(inputMinTexto) || 12) : 12;

    // Identifica se quem está a cadastrar é operador para definir status pendente de aprovação
    let userObj = {};
    try {
      userObj = JSON.parse(localStorage.getItem('nexus_user') || '{}');
    } catch (e) {}

    const rawRole = localStorage.getItem('nexus_user_role') || userObj.role || userObj.cargo || 'Administrador';
    const isOperador = String(rawRole).toLowerCase().trim() === 'operador';

    const bodyData = {
      nome: nomeProduto,
      sku: sku,
      categoria: categoria,
      fornecedor: fornecedor,
      preco_custo: precoCustoVal,
      custo: precoCustoVal,
      preco_venda: precoVendaVal,
      estoque: estoqueVal,
      quantidade_minima: estoqueMinVal,
      status: isOperador ? 'pendente' : 'aprovado'
    };

    try {
      const method = id ? 'PUT' : 'POST';
      const url = id ? `/api/produtos/${id}` : '/api/produtos';

      const res = await fetchSeguraProdutos(url, {
        method,
        body: JSON.stringify(bodyData)
      });

      if (!res) return;

      const responseData = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(responseData.error || responseData.message || 'Falha ao salvar produto no servidor.');
      }

      const metaObj = {
        preco_custo: precoCustoVal,
        quantidade_minima: estoqueMinVal,
        fornecedor: fornecedor
      };

      const chaveId =
        id ||
        responseData.id ||
        responseData.produto?.id ||
        responseData.data?.id ||
        (Array.isArray(responseData) ? responseData[0]?.id : null) ||
        (Array.isArray(responseData.data) ? responseData.data[0]?.id : null);

      if (chaveId) salvarMetaLocalProduto(chaveId, metaObj);
      if (sku) salvarMetaLocalProduto(sku, metaObj);
      if (nomeProduto) salvarMetaLocalProduto(`nome:${nomeProduto.toLowerCase()}`, metaObj);

      fecharModal();
      await carregarProdutos();
      if (!isOperador) {
        await carregarProdutosPendentes();
      }
      
      if (isOperador) {
        mostrarNotificacaoToast('Produto cadastrado e enviado para aprovação do administrador!', 'sucesso');
      }
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  });
}

function editarProduto(id) {
  const prod = produtosCache.find((p) => String(p.id) === String(id));
  if (!prod) return;

  atualizarDatalistsModal();

  document.getElementById('prodId').value = prod.id;
  document.getElementById('prodNome').value = prod.nome;
  document.getElementById('prodSku').value = prod.sku || '';
  document.getElementById('prodCategoria').value = prod.categoria || '';

  const campoFornecedor = document.getElementById('prodFornecedor');
  if (campoFornecedor) campoFornecedor.value = prod.fornecedor || '';

  const campoCusto = document.getElementById('prodPrecoCusto');
  if (campoCusto) campoCusto.value = prod.preco_custo || '';

  document.getElementById('prodPrecoVenda').value = prod.preco_venda || prod.preco || '';
  document.getElementById('prodEstoque').value = prod.estoque ?? prod.quantidade ?? 0;

  const campoMinimo = document.getElementById('prodEstoqueMinimo');
  if (campoMinimo) {
    campoMinimo.value = prod.quantidade_minima && prod.quantidade_minima !== 12 ? prod.quantidade_minima : '';
  }

  atualizarPreviewMargemModal();

  document.getElementById('modalTitulo').textContent = 'Editar Produto';
  document.getElementById('modalProduto').classList.remove('hidden');
}

async function alternarStatusProduto(id, novoStatus) {
  try {
    const res = await fetchSeguraProdutos(`/api/produtos/${id}/ativo`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: novoStatus })
    });

    if (!res) return;

    if (res.ok) {
      await carregarProdutos();
    } else {
      const data = await res.json();
      alert(data.error || 'Erro ao alterar status do produto.');
    }
  } catch (err) {}
}

function confirmarExclusaoProduto(id, nome) {
  produtoParaExcluirId = id;

  const msgElem = document.getElementById('mensagemConfirmacao');
  if (msgElem) {
    msgElem.innerHTML = `Tem certeza que deseja excluir o produto <strong class="text-slate-700 dark:text-slate-200">"${nome}"</strong>? Esta ação não pode ser desfeita.`;
  }

  const modal = document.getElementById('modalConfirmacao');
  if (modal) modal.classList.remove('hidden');
}

function fecharModalConfirmacao() {
  produtoParaExcluirId = null;
  const modal = document.getElementById('modalConfirmacao');
  if (modal) modal.classList.add('hidden');
}

function setupConfirmacaoExclusao() {
  const btnConfirmar = document.getElementById('btnConfirmarExclusaoAcao');
  if (!btnConfirmar) return;

  btnConfirmar.addEventListener('click', async () => {
    if (!produtoParaExcluirId) return;

    try {
      const res = await fetchSeguraProdutos(`/api/produtos/${produtoParaExcluirId}`, {
        method: 'DELETE'
      });

      if (!res) return;

      if (res.ok) {
        fecharModalConfirmacao();
        await carregarProdutos();
        await carregarProdutosPendentes();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir o produto.');
        fecharModalConfirmacao();
      }
    } catch (err) {
      alert('Ocorreu um erro de comunicação com o servidor.');
      fecharModalConfirmacao();
    }
  });
}

function exportarProdutosCSV() {
  if (!produtosCache || produtosCache.length === 0) {
    alert('Não há produtos para exportar.');
    return;
  }

  const cabecalhos = [
    'SKU',
    'Produto',
    'Categoria',
    'Fornecedor',
    'Estoque Atual',
    'Estoque Minimo',
    'Preco Custo (R$)',
    'Preco Venda (R$)',
    'Margem (%)',
    'Status'
  ];
  const linhas = produtosCache.map((p) => {
    const estoque = Number(p.estoque ?? p.quantidade ?? 0);
    const min = Number(p.quantidade_minima ?? 12);
    const custo = Number(p.preco_custo ?? 0);
    const venda = Number(p.preco_venda ?? p.preco ?? 0);
    const { temMargem, margemPercentual } = calcularDadosMargem(custo, venda);
    const status = p.ativo === false ? 'Inativo' : estoque <= min ? 'Estoque Baixo' : 'Estoque Normal';

    return [
      `"${p.sku || ''}"`,
      `"${(p.nome || '').replace(/"/g, '""')}"`,
      `"${p.categoria || 'Geral'}"`,
      `"${(p.fornecedor || 'Não informado').replace(/"/g, '""')}"`,
      estoque,
      min,
      custo.toFixed(2).replace('.', ','),
      venda.toFixed(2).replace('.', ','),
      temMargem ? `${margemPercentual.toFixed(1).replace('.', ',')}%` : 'N/A',
      `"${status}"`
    ].join(';');
  });

  const csvContent = '\uFEFF' + [cabecalhos.join(';'), ...linhas].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `catalogo_produtos_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

window.moderarProduto = moderarProduto;
window.editarProduto = editarProduto;
window.alternarStatusProduto = alternarStatusProduto;
window.confirmarExclusaoProduto = confirmarExclusaoProduto;
window.fecharModalConfirmacao = fecharModalConfirmacao;
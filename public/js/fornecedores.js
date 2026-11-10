let isRedirectingFornecedores = false;
let listaFornecedoresGlobal = [];
let filtroStatusAtual = 'todos';
let isSubmittingFornecedor = false;
let isProcessandoAcaoFornecedor = false;

// Função centralizada para requisições autenticadas e prevenção de loop 401
async function fetchSeguraFornecedores(url, options = {}) {
  // Procura o token em qualquer uma das chaves possíveis gravadas no login
  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) {
    encerrarSessaoFornecedores();
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
      encerrarSessaoFornecedores();
      return null;
    }

    return response;
  } catch (error) {
    throw error;
  }
}

function encerrarSessaoFornecedores() {
  if (isRedirectingFornecedores) return;
  isRedirectingFornecedores = true;

  console.warn('Sessão expirada ou inválida em Fornecedores (401). A redirecionar para login...');
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
    encerrarSessaoFornecedores();
    return;
  }

  carregarInfoUtilizador();
  carregarFornecedores();
  setupModalEvents();
  setupBuscaEspecífica();
  setupCnpjMask();
  setupTelefoneMask();
  setupModalDetalhesEvents();
  setupUserDropdown();
});

// Atualiza o nome, avatar e nível/cargo na barra superior dinamicamente
function carregarInfoUtilizador() {
  const nomeUtilizador = localStorage.getItem('nexus_user_name') || 'Utilizador Nexus';
  const elUserName = document.getElementById('userName');
  if (elUserName) elUserName.textContent = nomeUtilizador;

  const cargoUtilizador =
    localStorage.getItem('nexus_user_role') ||
    localStorage.getItem('nexus_user_nivel') ||
    'Administrador';
  const elUserRole = document.getElementById('userRole');
  if (elUserRole) elUserRole.textContent = cargoUtilizador;

  const elUserAvatar = document.getElementById('userAvatar');
  if (elUserAvatar) {
    const iniciais = nomeUtilizador
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    elUserAvatar.textContent = iniciais || 'NX';
  }
}

// Controle do Dropdown do Utilizador na Topbar
function setupUserDropdown() {
  const btn = document.getElementById('userMenuBtn');
  const dropdown = document.getElementById('userDropdown');

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

// 1. Carregar Fornecedores da API
async function carregarFornecedores() {
  const container = document.getElementById('cardsFornecedoresContainer');
  const badgeTotal = document.getElementById('totalFornecedoresBadge');

  try {
    const res = await fetchSeguraFornecedores('/api/fornecedores');
    if (!res) return;

    if (!res.ok) throw new Error('Erro ao carregar fornecedores');

    const fornecedores = await res.json();
    listaFornecedoresGlobal = Array.isArray(fornecedores) ? fornecedores : [];

    const ativosCount = listaFornecedoresGlobal.filter((f) => f.ativo !== false).length;
    if (badgeTotal) {
      badgeTotal.textContent = `${ativosCount} parceiro(s) ativo(s)`;
    }

    aplicarFiltrosEFiltrar();
  } catch (err) {
    console.error('Erro ao buscar fornecedores:', err);
    if (container) {
      container.innerHTML = `<div class="col-span-full py-12 text-center text-rose-500 font-medium text-xs">Erro ao carregar parceiros.</div>`;
    }
  }
}

// Cores suaves aleatórias para as iniciais nos Cards
const bgColors = [
  'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
  'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300'
];

// 2. Renderizar Cards (Com CNPJ, Telefone e Ações)
function renderizarCards(lista) {
  const container = document.getElementById('cardsFornecedoresContainer');
  if (!container) return;

  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 dark:text-slate-500 font-medium text-xs">Nenhum fornecedor encontrado.</div>`;
    return;
  }

  container.innerHTML = lista
    .map((f, index) => {
      const nomeSeguro = f.nome || 'Fornecedor';
      const iniciais = nomeSeguro
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      const colorClass = bgColors[index % bgColors.length];
      const isAtivo = f.ativo !== false;

      const cardBgClass = isAtivo
        ? 'bg-white dark:bg-[#121E1A] border-slate-100 dark:border-[#1C2C26]'
        : 'bg-slate-100/70 dark:bg-[#101715] border-slate-200/60 dark:border-[#17221E] opacity-75';

      const textNameClass = isAtivo
        ? 'text-slate-800 dark:text-slate-100'
        : 'text-slate-500 dark:text-slate-400 line-through';

      return `
      <div class="${cardBgClass} border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between mb-4">
            <div class="w-10 h-10 rounded-xl ${isAtivo ? colorClass : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'} font-bold text-xs flex items-center justify-center">
              ${iniciais}
            </div>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${isAtivo ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/50' : 'text-slate-600 bg-slate-200 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700'}">
              ${isAtivo ? 'Ativo' : 'Inativo'}
            </span>
          </div>

          <h3 class="font-bold ${textNameClass} text-base mb-0.5">${nomeSeguro}</h3>
          <p class="text-xs text-slate-400 dark:text-slate-500 mb-4">${f.categoria || 'Geral'}</p>

          <div class="space-y-2 text-xs text-slate-500 dark:text-slate-400 mb-5">
            <div class="flex items-center gap-2 truncate">
              <i class="fa-solid fa-id-card text-slate-400 dark:text-slate-500 w-4"></i>
              <span class="truncate">${f.cnpj || 'CNPJ não informado'}</span>
            </div>
            <div class="flex items-center gap-2 truncate">
              <i class="fa-solid fa-phone text-slate-400 dark:text-slate-500 w-4"></i>
              <span class="truncate">${f.telefone || 'Telefone não informado'}</span>
            </div>
            <div class="flex items-center gap-2 truncate">
              <i class="fa-regular fa-envelope text-slate-400 dark:text-slate-500 w-4"></i>
              <span class="truncate">${f.email || 'Sem e-mail'}</span>
            </div>
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-box text-slate-400 dark:text-slate-500 w-4 text-[11px]"></i>
              <span>${f.produtos_vinculados || 0} produtos no estoque</span>
            </div>
          </div>
        </div>

        <div class="pt-4 border-t border-slate-200/60 dark:border-[#1C2C26] flex items-center justify-between">
          <span class="text-[11px] font-medium text-slate-400">#${index + 1}</span>
          <button onclick="abrirDetalhesFornecedor('${f.id}')" class="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-800 dark:hover:text-emerald-400 flex items-center gap-1 transition-colors cursor-pointer">
            Ver detalhes <i class="fa-solid fa-chevron-right text-[10px]"></i>
          </button>
        </div>
      </div>
    `;
    })
    .join('');
}

// 3. Abrir Modal de Detalhes com os dados do Fornecedor
function abrirDetalhesFornecedor(id) {
  const f = listaFornecedoresGlobal.find((item) => String(item.id) === String(id));
  if (!f) return;

  const modal = document.getElementById('modalDetalhesFornecedor');
  const isAtivo = f.ativo !== false;

  const nomeSeguro = f.nome || 'Fornecedor';
  const iniciais = nomeSeguro
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const elAvatar = document.getElementById('detalheAvatar');
  const elNome = document.getElementById('detalheNome');
  const elSubtitulo = document.getElementById('detalheSubtitulo');

  if (elAvatar) elAvatar.textContent = iniciais;
  if (elNome) elNome.textContent = nomeSeguro;
  if (elSubtitulo) {
    elSubtitulo.textContent = `${f.categoria || 'Sem categoria'} • ${f.cidade_estado || 'Não informada'}`;
  }

  const badgeStatus = document.getElementById('detalheStatusBadge');
  if (badgeStatus) {
    badgeStatus.innerHTML = `
      <span class="w-2 h-2 rounded-full ${isAtivo ? 'bg-emerald-400' : 'bg-slate-400'}"></span>
      <span>Fornecedor ${isAtivo ? 'ativo' : 'inativo'}</span>
    `;
  }

  const elProdutos = document.getElementById('detalheProdutos');
  const elPrazo = document.getElementById('detalhePrazo');
  const elPedidoMinimo = document.getElementById('detalhePedidoMinimo');

  if (elProdutos) elProdutos.textContent = f.produtos_vinculados || 0;
  if (elPrazo) elPrazo.textContent = `${f.prazo_medio || 1} dias`;

  const pedidoMinimoFormatado = f.pedido_minimo
    ? Number(f.pedido_minimo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'R$ 0,00';
  if (elPedidoMinimo) elPedidoMinimo.textContent = pedidoMinimoFormatado;

  const elResponsavel = document.getElementById('detalheResponsavel');
  const elEmail = document.getElementById('detalheEmail');
  const elTelefone = document.getElementById('detalheTelefone');

  if (elResponsavel) elResponsavel.textContent = f.responsavel || '-';
  if (elEmail) elEmail.textContent = f.email || '-';
  if (elTelefone) elTelefone.textContent = f.telefone || '-';

  const elCnpj = document.getElementById('detalheCnpj');
  const elLocalizacao = document.getElementById('detalheLocalizacao');
  const elCategoria = document.getElementById('detalheCategoria');

  if (elCnpj) elCnpj.textContent = f.cnpj || '-';
  if (elLocalizacao) elLocalizacao.textContent = f.cidade_estado || '-';
  if (elCategoria) elCategoria.textContent = f.categoria || '-';

  const btnStatus = document.getElementById('btnAlternarStatusDetalhe');
  if (btnStatus) {
    btnStatus.textContent = isAtivo ? 'Desativar' : 'Ativar';
    btnStatus.className = `text-xs font-semibold ${isAtivo ? 'text-amber-600 dark:text-amber-400 hover:underline' : 'text-emerald-600 dark:text-emerald-400 hover:underline'} transition-colors cursor-pointer`;
    btnStatus.onclick = () => alternarStatusFornecedor(f.id, !isAtivo);
  }

  const btnExcluir = document.getElementById('btnExcluirDetalhe');
  if (btnExcluir) {
    btnExcluir.onclick = () => excluirFornecedorDefinitivo(f.id);
  }

  const btnEditar = document.getElementById('btnEditarFornecedorDetalhe');
  if (btnEditar) {
    btnEditar.onclick = () => abrirEdicaoFornecedor(f);
  }

  modal?.classList.remove('hidden');
}

function setupModalDetalhesEvents() {
  const modal = document.getElementById('modalDetalhesFornecedor');
  const btnFechar1 = document.getElementById('btnFecharModalDetalhes');
  const btnFechar2 = document.getElementById('btnFecharModalDetalhes2');

  const fechar = () => modal?.classList.add('hidden');
  btnFechar1?.addEventListener('click', fechar);
  btnFechar2?.addEventListener('click', fechar);
}

function mostrarModalConfirmacaoPersonalizado(
  titulo,
  mensagem,
  textoBotao = 'Confirmar',
  corBotao = 'bg-[#0F392B] hover:bg-[#0a271d]'
) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirmacaoPersonalizado');
    const elTitulo = document.getElementById('tituloModalConfirmacao');
    const elMensagem = document.getElementById('textoMensagemConfirmacao');
    const btnAceitar = document.getElementById('btnAceitarConfirmacao');
    const btnCancelar = document.getElementById('btnCancelarConfirmacao');

    if (!modal || !btnAceitar || !btnCancelar) {
      resolve(confirm(mensagem));
      return;
    }

    if (elTitulo) elTitulo.textContent = titulo;
    if (elMensagem) elMensagem.textContent = mensagem;

    btnAceitar.textContent = textoBotao;
    btnAceitar.className = `px-4 py-2 text-xs font-semibold text-white ${corBotao} rounded-xl shadow-xs transition-colors cursor-pointer`;

    modal.classList.remove('hidden');

    const fecharEResolver = (resultado) => {
      modal.classList.add('hidden');
      btnAceitar.replaceWith(btnAceitar.cloneNode(true));
      btnCancelar.replaceWith(btnCancelar.cloneNode(true));
      resolve(resultado);
    };

    document.getElementById('btnAceitarConfirmacao').addEventListener('click', () => fecharEResolver(true));
    document.getElementById('btnCancelarConfirmacao').addEventListener('click', () => fecharEResolver(false));

    modal.onclick = (e) => {
      if (e.target === modal) fecharEResolver(false);
    };
  });
}

async function alternarStatusFornecedor(id, novoStatus) {
  if (isProcessandoAcaoFornecedor) return;

  const acaoTxt = novoStatus ? 'ativar' : 'desativar';
  const titulo = novoStatus ? 'Ativar Fornecedor' : 'Desativar Fornecedor';
  const corBtn = novoStatus ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700';

  const confirmado = await mostrarModalConfirmacaoPersonalizado(
    titulo,
    `Deseja realmente ${acaoTxt} este fornecedor?`,
    novoStatus ? 'Sim, Ativar' : 'Sim, Desativar',
    corBtn
  );

  if (!confirmado) return;

  isProcessandoAcaoFornecedor = true;
  try {
    const fornecedorId = id || (window.fAtual && window.fAtual.id);

    const res = await fetchSeguraFornecedores(`/api/fornecedores/${fornecedorId}`, {
      method: 'PUT',
      body: JSON.stringify({ ativo: novoStatus })
    });

    if (!res) return;

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Erro HTTP: ${res.status}`);
    }

    document.getElementById('modalDetalhesFornecedor')?.classList.add('hidden');
    await carregarFornecedores();
    
    // Notificação Toast de sucesso
    if (typeof mostrarToast === 'function') {
      mostrarToast(`Fornecedor ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`, 'sucesso');
    }
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    if (typeof mostrarToast === 'function') {
      mostrarToast(`Erro ao alterar o status: ${err.message}`, 'erro');
    } else {
      alert(`Erro ao alterar o status: ${err.message}`);
    }
  } finally {
    isProcessandoAcaoFornecedor = false;
  }
}

async function excluirFornecedorDefinitivo(id) {
  if (isProcessandoAcaoFornecedor) return;

  const confirmado = await mostrarModalConfirmacaoPersonalizado(
    'Excluir Permanentemente',
    'Deseja realmente excluir permanentemente este fornecedor? Esta ação não pode ser desfeita.',
    'Sim, Excluir',
    'bg-rose-600 hover:bg-rose-700'
  );

  if (!confirmado) return;

  isProcessandoAcaoFornecedor = true;
  try {
    const res = await fetchSeguraFornecedores(`/api/fornecedores/${id}`, {
      method: 'DELETE'
    });

    if (!res) return;

    if (!res.ok) throw new Error('Erro ao excluir fornecedor');

    document.getElementById('modalDetalhesFornecedor')?.classList.add('hidden');
    await carregarFornecedores();

    // Notificação Toast de sucesso
    if (typeof mostrarToast === 'function') {
      mostrarToast('Fornecedor excluído com sucesso!', 'sucesso');
    }
  } catch (err) {
    console.error('Erro ao excluir:', err);
    if (typeof mostrarToast === 'function') {
      mostrarToast('Erro ao excluir o fornecedor.', 'erro');
    } else {
      alert('Erro ao excluir o fornecedor.');
    }
  } finally {
    isProcessandoAcaoFornecedor = false;
  }
}

function abrirEdicaoFornecedor(f) {
  document.getElementById('modalDetalhesFornecedor')?.classList.add('hidden');

  const modal = document.getElementById('modalFornecedor');
  const form = document.getElementById('formFornecedor');
  if (!modal || !form) return;

  form.reset();
  isSubmittingFornecedor = false;

  const fornecedorId = f.id || f._id;

  const btnSubmit = document.getElementById('btnSalvarForn') || form.querySelector('button[type="submit"]');
  const textoOriginalBotao = 'Salvar';
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.classList.remove('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
    btnSubmit.textContent = textoOriginalBotao;
  }

  document.getElementById('fornNome').value = f.nome || '';
  document.getElementById('fornCategoria').value = f.categoria || '';
  document.getElementById('fornCnpj').value = f.cnpj || '';
  document.getElementById('fornResponsavel').value = f.responsavel || '';
  document.getElementById('fornTelefone').value = f.telefone || '';
  document.getElementById('fornEmail').value = f.email || '';
  document.getElementById('fornCidadeEstado').value = f.cidade_estado || '';
  document.getElementById('fornProdutosVinculados').value = f.produtos_vinculados || 0;
  document.getElementById('fornPrazoMedio').value = f.prazo_medio || 1;
  document.getElementById('fornPedidoMinimo').value = f.pedido_minimo || 0;

  form.onsubmit = async (e) => {
    e.preventDefault();

    if (isSubmittingFornecedor) return;
    isSubmittingFornecedor = true;

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.classList.add('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
      btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Salvando...`;
    }

    const payload = {
      nome: document.getElementById('fornNome')?.value,
      categoria: document.getElementById('fornCategoria')?.value || '',
      cnpj: document.getElementById('fornCnpj')?.value || '',
      responsavel: document.getElementById('fornResponsavel')?.value || '',
      telefone: document.getElementById('fornTelefone')?.value || '',
      email: document.getElementById('fornEmail')?.value || '',
      cidade_estado: document.getElementById('fornCidadeEstado')?.value || '',
      produtos_vinculados: document.getElementById('fornProdutosVinculados')?.value || 0,
      prazo_medio: document.getElementById('fornPrazoMedio')?.value || 1,
      pedido_minimo: document.getElementById('fornPedidoMinimo')?.value || 0
    };

    try {
      const res = await fetchSeguraFornecedores(`/api/fornecedores/${fornecedorId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      if (!res) return;

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao atualizar fornecedor');
      }

      modal.classList.add('hidden');
      await carregarFornecedores();

      // Notificação Toast de sucesso na edição
      if (typeof mostrarToast === 'function') {
        mostrarToast('Fornecedor atualizado com sucesso!', 'sucesso');
      }
    } catch (err) {
      console.error('Erro ao editar:', err);
      if (typeof mostrarToast === 'function') {
        mostrarToast(err.message || 'Erro ao atualizar o fornecedor.', 'erro');
      } else {
        alert('Erro ao atualizar o fornecedor.');
      }
    } finally {
      isSubmittingFornecedor = false;
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
        btnSubmit.textContent = textoOriginalBotao;
      }
    }
  };

  modal.classList.remove('hidden');
}

function setupModalEvents() {
  const modal = document.getElementById('modalFornecedor');
  const btnAbrir = document.getElementById('btnNovoFornecedor');
  const btnFechar = document.getElementById('btnFecharModalForn');
  const btnCancelar = document.getElementById('btnCancelarModalForn');
  const form = document.getElementById('formFornecedor');

  const fechar = () => modal?.classList.add('hidden');

  const abrir = () => {
    form?.reset();
    isSubmittingFornecedor = false;

    const btnSubmit = document.getElementById('btnSalvarForn') || form?.querySelector('button[type="submit"]');
    const textoOriginalBotao = 'Adicionar fornecedor';
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.classList.remove('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
      btnSubmit.textContent = textoOriginalBotao;
    }

    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();

        if (isSubmittingFornecedor) return;
        isSubmittingFornecedor = true;

        if (btnSubmit) {
          btnSubmit.disabled = true;
          btnSubmit.classList.add('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
          btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Salvando...`;
        }

        const payload = {
          nome: document.getElementById('fornNome')?.value,
          categoria: document.getElementById('fornCategoria')?.value || '',
          cnpj: document.getElementById('fornCnpj')?.value || '',
          responsavel: document.getElementById('fornResponsavel')?.value || '',
          telefone: document.getElementById('fornTelefone')?.value || '',
          email: document.getElementById('fornEmail')?.value || '',
          cidade_estado: document.getElementById('fornCidadeEstado')?.value || '',
          produtos_vinculados: document.getElementById('fornProdutosVinculados')?.value || 0,
          prazo_medio: document.getElementById('fornPrazoMedio')?.value || 1,
          pedido_minimo: document.getElementById('fornPedidoMinimo')?.value || 0,
          ativo: true
        };

        try {
          const res = await fetchSeguraFornecedores('/api/fornecedores', {
            method: 'POST',
            body: JSON.stringify(payload)
          });

          if (!res) return;

          const data = await res.json();
          if (!res.ok) {
            if (typeof mostrarToast === 'function') {
              mostrarToast(data.error || 'Erro ao cadastrar fornecedor.', 'erro');
            } else {
              alert(data.error || 'Erro ao cadastrar fornecedor.');
            }
            return;
          }

          fechar();
          await carregarFornecedores();

          // NOTIFICAÇÃO TOAST DE SUCESSO AO CADASTRAR FORNECEDOR!
          if (typeof mostrarToast === 'function') {
            mostrarToast('Fornecedor cadastrado com sucesso!', 'sucesso');
          }
        } catch (err) {
          console.error('Erro ao cadastrar fornecedor:', err);
          if (typeof mostrarToast === 'function') {
            mostrarToast('Erro de comunicação com o servidor.', 'erro');
          } else {
            alert('Erro de comunicação com o servidor.');
          }
        } finally {
          isSubmittingFornecedor = false;
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.classList.remove('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
            btnSubmit.textContent = textoOriginalBotao;
          }
        }
      };
    }

    modal?.classList.remove('hidden');
  };

  btnAbrir?.addEventListener('click', abrir);
  btnFechar?.addEventListener('click', fechar);
  btnCancelar?.addEventListener('click', fechar);
}

function setupBuscaEspecífica() {
  const inputSearch = document.getElementById('inputSearchFornecedores');
  const botoesFiltro = document.querySelectorAll('.btn-filtro-forn');

  botoesFiltro.forEach((btn) => {
    btn.addEventListener('click', () => {
      botoesFiltro.forEach((b) => {
        b.className =
          'btn-filtro-forn px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all cursor-pointer whitespace-nowrap';
      });
      btn.className =
        'btn-filtro-forn px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#1E332C] text-slate-800 dark:text-slate-100 shadow-2xs transition-all cursor-pointer whitespace-nowrap';

      filtroStatusAtual = btn.getAttribute('data-status');
      aplicarFiltrosEFiltrar();
    });
  });

  inputSearch?.addEventListener('input', () => {
    aplicarFiltrosEFiltrar();
  });
}

function aplicarFiltrosEFiltrar() {
  const termo = document.getElementById('inputSearchFornecedores')?.value.toLowerCase() || '';

  const filtrados = listaFornecedoresGlobal.filter((f) => {
    const matchStatus =
      filtroStatusAtual === 'todos'
        ? true
        : filtroStatusAtual === 'ativo'
          ? f.ativo !== false
          : filtroStatusAtual === 'inativo'
            ? f.ativo === false
            : true;

    const matchTermo =
      (f.nome && f.nome.toLowerCase().includes(termo)) ||
      (f.cnpj && f.cnpj.toLowerCase().includes(termo)) ||
      (f.categoria && f.categoria.toLowerCase().includes(termo)) ||
      (f.responsavel && f.responsavel.toLowerCase().includes(termo)) ||
      (f.email && f.email.toLowerCase().includes(termo));

    return matchStatus && matchTermo;
  });

  renderizarCards(filtrados);
}

function setupCnpjMask() {
  const inputCnpj = document.getElementById('fornCnpj');
  if (!inputCnpj) return;

  inputCnpj.addEventListener('input', (e) => {
    let valor = e.target.value.replace(/\D/g, '');
    if (valor.length > 14) valor = valor.slice(0, 14);

    if (valor.length > 12) valor = valor.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5');
    else if (valor.length > 8) valor = valor.replace(/^(\d{2})(\d{3})(\d{3})(\d{4}).*/, '$1.$2.$3/$4');
    else if (valor.length > 5) valor = valor.replace(/^(\d{2})(\d{3})(\d{3}).*/, '$1.$2.$3');
    else if (valor.label > 2) valor = valor.replace(/^(\d{2})(\d{3}).*/, '$1.$2');

    e.target.value = valor;
  });
}

function setupTelefoneMask() {
  const inputTelefone = document.getElementById('fornTelefone');
  if (!inputTelefone) return;

  inputTelefone.addEventListener('input', (e) => {
    let valor = e.target.value.replace(/\D/g, '');
    if (valor.length > 11) valor = valor.slice(0, 11);

    if (valor.length > 10) valor = valor.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
    else if (valor.length > 6) valor = valor.replace(/^(\d{2})(\d{4})(\d{4}).*/, '($1) $2-$3');
    else if (valor.length > 2) valor = valor.replace(/^(\d{2})(\d{0,4}).*/, '($1) $2');
    else if (valor.length > 0) valor = valor.replace(/^(\d{0,2}).*/, '($1');

    e.target.value = valor;
  });
}
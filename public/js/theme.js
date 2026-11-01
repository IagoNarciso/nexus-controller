// 1. Aplica o tema apenas se o utilizador já tiver escolhido 'dark' anteriormente
(function aplicarTemaInicial() {
  const temaSalvo = localStorage.getItem('nexus_theme');
  if (temaSalvo === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
})();

// 2. Função Global para Atualizar a Badge de Movimentações em Qualquer Página
async function atualizarBadgeGlobalMovimentacoes() {
  const badge = document.getElementById('badgeMovimentacoes');
  if (!badge) return;

  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) return;

  try {
    const res = await fetch('/api/movimentacoes/nao-lidas', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.totalNaoLidas > 0) {
        badge.textContent = data.totalNaoLidas;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Erro ao buscar movimentações não lidas globalmente:', err);
  }
}

// 3. Função Global para Atualizar a Badge de Produtos (Aprovações + Solicitações) em Qualquer Página
async function atualizarBadgeGlobalProdutos() {
  let badge = document.getElementById('badgeMenuProdutos');

  // Verifica rigorosamente se o utilizador atual é Operador
  let userObj = {};
  try {
    userObj = JSON.parse(localStorage.getItem('nexus_user') || '{}');
  } catch (e) {}
  
  const rawRole = localStorage.getItem('nexus_user_role') || userObj.role || userObj.cargo || 'Administrador';
  const isOperador = String(rawRole).toLowerCase().trim() === 'operador';

  // Se for operador, o menu lateral de produtos nunca deve mostrar badge de aprovações pendentes
  if (isOperador) {
    if (badge) badge.classList.add('hidden');
    return;
  }

  // Caso o HTML da página atual não tenha o <span>, cria-o automaticamente para o Admin
  if (!badge) {
    const linkProdutos = document.querySelector('aside nav a[href="produtos.html"], a[href="produtos.html"]');
    if (linkProdutos) {
      badge = document.createElement('span');
      badge.id = 'badgeMenuProdutos';
      badge.className = 'px-1.5 py-0.5 text-[10px] font-bold text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950/80 rounded-full border border-rose-700/50 hidden';
      badge.style.marginLeft = 'auto';
      linkProdutos.appendChild(badge);
    }
  }

  if (!badge) return;

  // Exibe imediatamente o valor em cache para evitar atraso visual ao trocar de página
  const cacheSalvo = localStorage.getItem('nexus_pendentes_cache');
  if (cacheSalvo !== null) {
    const qtdCache = parseInt(cacheSalvo, 10);
    if (qtdCache > 0) {
      badge.textContent = qtdCache;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  const token = 
    localStorage.getItem('token') || 
    localStorage.getItem('access_token') || 
    localStorage.getItem('nexus_token');

  if (!token) return;

  try {
    const [resAprov, resSol] = await Promise.all([
      fetch('/api/produtos/pendentes', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => null),
      fetch('/api/solicitacoes', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => null)
    ]);

    let totalPendentes = 0;

    if (resAprov && resAprov.ok) {
      const aprovados = await resAprov.json();
      if (Array.isArray(aprovados)) totalPendentes += aprovados.length;
    }

    if (resSol && resSol.ok) {
      const solicitacoes = await resSol.json();
      const pendentesSol = Array.isArray(solicitacoes)
        ? solicitacoes.filter(s => (s.status || '').toLowerCase() === 'pendente')
        : [];
      totalPendentes += pendentesSol.length;
    }

    localStorage.setItem('nexus_pendentes_cache', totalPendentes);

    if (totalPendentes > 0) {
      badge.textContent = totalPendentes;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (err) {
    console.error('Erro ao buscar pendências de produtos globalmente:', err);
  }
}

// Expõe a função globalmente para que outros scripts possam chamá-la
window.atualizarBadgeMenuSidebarGlobal = atualizarBadgeGlobalProdutos;

// 4. Função Global para Atualizar o Utilizador, Avatar e Cargo na Topbar em Tempo Real
function atualizarPerfilTopbarGlobal() {
  const nomeUtilizador = 
    localStorage.getItem('nexus_user_name') || 
    localStorage.getItem('nexus_user_nome') || 
    'Utilizador Nexus';

  const elUserName = document.getElementById('userName');
  if (elUserName) {
    elUserName.textContent = nomeUtilizador;
  }

  // Tratamento do Cargo / Role
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
    localStorage.getItem('nexus_user_cargo') ||
    localStorage.getItem('user_role') ||
    localStorage.getItem('role') ||
    localStorage.getItem('nivel') ||
    userObj.role ||
    userObj.nivel ||
    userObj.cargo ||
    'Administrador';

  const roleLower = String(rawRole).toLowerCase().trim();
  let cargoFormatado = 'Administrador';

  if (roleLower === 'operador' || roleLower === 'operator') {
    cargoFormatado = 'Operador';
  } else if (roleLower === 'admin' || roleLower === 'administrador') {
    cargoFormatado = 'Administrador';
  } else {
    cargoFormatado = String(rawRole).charAt(0).toUpperCase() + String(rawRole).slice(1);
  }

  // Atualiza elementos específicos do ID 'userRole' ou textos genéricos na topbar
  const elUserRole = document.getElementById('userRole');
  if (elUserRole) {
    elUserRole.textContent = cargoFormatado;
  }

  const possiveisLocais = document.querySelectorAll('header p.text-\\[10px\\], header span, header div');
  possiveisLocais.forEach(el => {
    if (el && (el.textContent.trim() === 'Authenticated' || el.textContent.trim() === 'Operator' || el.textContent.trim() === 'Administrador' || el.textContent.trim() === 'Operador')) {
      if (el.id !== 'userName') {
        el.textContent = cargoFormatado;
      }
    }
  });

  // Atualiza as iniciais do Avatar automaticamente
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

// 5. Lógica do Botão de Alternância e Inicialização Global
document.addEventListener('DOMContentLoaded', () => {
  function atualizarIcone(btn) {
    if (!btn) return;
    const isDark = document.documentElement.classList.contains('dark');
    btn.innerHTML = isDark 
      ? '<i class="fa-regular fa-sun text-sm text-amber-400"></i>' 
      : '<i class="fa-regular fa-moon text-sm"></i>';
  }

  let btnThemeToggle = document.getElementById('btnThemeToggle');

  if (!btnThemeToggle) {
    const topbarIconsContainer = document.querySelector('header .flex.items-center.space-x-3.border-l') || 
                                 document.querySelector('header .flex.items-center.space-x-4');
    if (topbarIconsContainer) {
      btnThemeToggle = document.createElement('button');
      btnThemeToggle.id = 'btnThemeToggle';
      btnThemeToggle.type = 'button';
      btnThemeToggle.className = 'p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-[#15241F] transition-colors';
      btnThemeToggle.title = 'Alternar tema (Claro / Escuro)';
      topbarIconsContainer.prepend(btnThemeToggle);
    }
  }

  if (btnThemeToggle) {
    atualizarIcone(btnThemeToggle);
  }

  document.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('#btnThemeToggle');
    if (targetBtn) {
      e.preventDefault();
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('nexus_theme', isDark ? 'dark' : 'light');
      atualizarIcone(targetBtn);
    }
  });

  // Executa todas as sincronizações globais assim que qualquer página carrega
  atualizarBadgeGlobalMovimentacoes();
  atualizarBadgeGlobalProdutos();
  atualizarPerfilTopbarGlobal();
});
/**
 * Exibe uma notificação Toast flutuante moderna
 * @param {string} mensagem - Texto a ser exibido
 * @param {string} tipo - 'sucesso', 'erro' ou 'aviso'
 */
function mostrarToast(mensagem, tipo = 'sucesso') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  // Configuração de cores baseada no design system do projeto
  const configs = {
    sucesso: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-500 text-emerald-800 dark:text-emerald-200',
      icone: '✅'
    },
    erro: {
      bg: 'bg-red-50 dark:bg-red-900/40 border-red-500 text-red-800 dark:text-red-200',
      icone: '❌'
    },
    aviso: {
      bg: 'bg-amber-50 dark:bg-amber-900/40 border-amber-500 text-amber-800 dark:text-amber-200',
      icone: '⚠️'
    }
  };

  const config = configs[tipo] || configs.sucesso;

  // Cria o elemento visual do toast
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center w-full max-w-sm p-4 rounded-xl border shadow-lg transition-all duration-300 transform translate-y-2 opacity-0 ${config.bg}`;
  
  toast.innerHTML = `
    <span class="text-lg mr-3">${config.icone}</span>
    <div class="text-sm font-medium flex-1">${mensagem}</div>
    <button onclick="this.parentElement.remove()" class="ml-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-lg cursor-pointer">&times;</button>
  `;

  container.appendChild(toast);

  // Animação suave de entrada (Fade-in / Slide-down)
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  // Remove automaticamente após 4 segundos com animação de saída
  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
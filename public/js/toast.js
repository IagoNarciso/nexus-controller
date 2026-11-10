/**
 * Exibe uma notificação Toast flutuante padronizada para todo o sistema
 * @param {string} mensagem - Texto a ser exibido
 * @param {string} tipo - 'sucesso', 'erro' ou 'aviso'
 */
function mostrarToast(mensagem, tipo = 'sucesso') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const configs = {
    sucesso: {
      bg: 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20',
      icone: 'fa-circle-check'
    },
    erro: {
      bg: 'bg-rose-600 text-white shadow-lg shadow-rose-900/20',
      icone: 'fa-circle-exclamation'
    },
    aviso: {
      bg: 'bg-amber-600 text-white shadow-lg shadow-amber-900/20',
      icone: 'fa-triangle-exclamation'
    }
  };

  const config = configs[tipo] || configs.sucesso;

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center px-4 py-3 rounded-2xl text-xs font-semibold transition-all duration-300 transform translate-y-2 opacity-0 ${config.bg}`;
  
  toast.innerHTML = `
    <i class="fa-solid ${config.icone} text-sm mr-2.5"></i>
    <div class="flex-1">${mensagem}</div>
    <button onclick="this.parentElement.remove()" class="ml-3 text-white/80 hover:text-white font-bold text-sm cursor-pointer">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
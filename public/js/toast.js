/**
 * Exibe uma notificação Toast flutuante padronizada idêntica à de Movimentações
 * @param {string} mensagem - Texto a ser exibido
 * @param {string} tipo - 'sucesso', 'erro' ou 'aviso'
 */
function mostrarToast(mensagem, tipo = 'sucesso') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  // Configuração visual idêntica ao padrão de movimentações do sistema
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

  // Cria o elemento visual do toast com o mesmo formato pílula/arredondado
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center px-4 py-3 rounded-2xl text-xs font-semibold transition-all duration-300 transform translate-y-2 opacity-0 ${config.bg}`;
  
  toast.innerHTML = `
    <i class="fa-solid ${config.icone} text-sm mr-2.5"></i>
    <div class="flex-1">${mensagem}</div>
    <button onclick="this.parentElement.remove()" class="ml-3 text-white/80 hover:text-white font-bold text-sm cursor-pointer">&times;</button>
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
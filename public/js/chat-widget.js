(function () {
  // Injeta o HTML do Widget de Chat no corpo da página atual
  const widgetHTML = `
    <div id="nexusChatContainer" class="fixed bottom-6 right-6 z-50 font-sans">
      <!-- Botão Flutuante para Abrir/Fechar o Chat -->
      <button id="nexusChatToggleBtn" class="w-14 h-14 bg-[#0F392B] hover:bg-[#144737] dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all transform hover:scale-105 cursor-pointer border border-emerald-500/30">
        <i id="nexusChatIcon" class="fa-solid fa-robot text-xl"></i>
      </button>

      <!-- Janela do Chat (Oculta por padrão) -->
      <div id="nexusChatWindow" class="absolute bottom-20 right-0 w-80 sm:w-96 bg-white dark:bg-[#121E1A] border border-slate-200 dark:border-[#1C2C26] rounded-2xl shadow-2xl hidden flex flex-col overflow-hidden transition-all duration-300 transform scale-95 opacity-0 origin-bottom-right h-[480px]">
        
        <!-- Cabeçalho do Chat -->
        <div class="bg-[#0F392B] dark:bg-[#0E1A16] px-4 py-3.5 flex items-center justify-between border-b border-emerald-800/40 shrink-0">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">
              <i class="fa-solid fa-wand-magic-sparkles text-xs"></i>
            </div>
            <div>
              <h3 class="text-xs font-bold text-white tracking-wide">Nexus Analyst Bot</h3>
              <p class="text-[10px] text-emerald-300 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online (Supabase)
              </p>
            </div>
          </div>
          <button id="nexusChatCloseBtn" class="text-emerald-200 hover:text-white p-1 rounded-lg transition-colors cursor-pointer">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        <!-- Mensagens do Chat -->
        <div id="nexusChatMessages" class="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs bg-slate-50/50 dark:bg-[#0B1512]/50">
          <div class="flex items-start space-x-2.5">
            <div class="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">AI</div>
            <div class="bg-white dark:bg-[#182B24] text-slate-800 dark:text-slate-200 p-3 rounded-2xl max-w-[260px] leading-relaxed border border-slate-200/60 dark:border-[#1C2C26] shadow-2xs">
              Olá, Boss! Sou o seu assistente de relatórios. Como posso ajudar com o estoque ou as movimentações hoje?
            </div>
          </div>
        </div>

        <!-- Sugestões Rápidas -->
        <div class="px-3 py-2 bg-white dark:bg-[#121E1A] border-t border-slate-100 dark:border-[#1C2C26] flex gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
          <button onclick="enviarSugestaoChat('Quais produtos estão com estoque crítico?')" class="px-2.5 py-1 text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-lg whitespace-nowrap hover:bg-emerald-100 cursor-pointer">
            ⚠️ Estoque crítico
          </button>
          <button onclick="enviarSugestaoChat('Mostrar movimentações recentes')" class="px-2.5 py-1 text-[10px] font-medium bg-slate-100 dark:bg-[#15241F] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1C2C26] rounded-lg whitespace-nowrap hover:bg-slate-200 cursor-pointer">
            📋 Movimentações
          </button>
          <button onclick="enviarSugestaoChat('Resumo geral do inventário')" class="px-2.5 py-1 text-[10px] font-medium bg-slate-100 dark:bg-[#15241F] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1C2C26] rounded-lg whitespace-nowrap hover:bg-slate-200 cursor-pointer">
            📈 Resumo geral
          </button>
        </div>

        <!-- Input de Envio -->
        <form id="nexusChatForm" class="p-3 bg-white dark:bg-[#121E1A] border-t border-slate-200 dark:border-[#1C2C26] flex items-center space-x-2 shrink-0">
          <input type="text" id="nexusChatInput" placeholder="Digite sua pergunta..." 
            class="flex-1 px-3 py-2 bg-slate-50 dark:bg-[#14231E] border border-slate-200 dark:border-[#1C2C26] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0F392B] text-slate-800 dark:text-slate-100" />
          <button type="submit" class="px-3.5 py-2 bg-[#0F392B] hover:bg-[#0a271d] dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-xl text-xs transition-colors cursor-pointer shadow-sm">
            <i class="fa-solid fa-paper-plane text-[10px]"></i>
          </button>
        </form>

      </div>
    </div>
  `;

  // Insere o widget no final do body assim que o DOM carregar
  document.addEventListener('DOMContentLoaded', () => {
    const divWrapper = document.createElement('div');
    divWrapper.innerHTML = widgetHTML;
    document.body.appendChild(divWrapper);

    const toggleBtn = document.getElementById('nexusChatToggleBtn');
    const closeBtn = document.getElementById('nexusChatCloseBtn');
    const windowChat = document.getElementById('nexusChatWindow');
    const chatForm = document.getElementById('nexusChatForm');
    const chatInput = document.getElementById('nexusChatInput');
    const chatIcon = document.getElementById('nexusChatIcon');

    let isOpen = false;

    const toggleChat = () => {
      isOpen = !isOpen;
      if (isOpen) {
        windowChat.classList.remove('hidden');
        setTimeout(() => {
          windowChat.classList.remove('scale-95', 'opacity-0');
          windowChat.classList.add('scale-100', 'opacity-100');
        }, 10);
        chatIcon.className = 'fa-solid fa-xmark text-xl';
        chatInput.focus();
      } else {
        windowChat.classList.remove('scale-100', 'opacity-100');
        windowChat.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
          windowChat.classList.add('hidden');
        }, 200);
        chatIcon.className = 'fa-solid fa-robot text-xl';
      }
    };

    toggleBtn.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);

    // Envio de mensagens
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = chatInput.value.trim();
      if (!texto) return;

      adicionarMsgChat(texto, 'usuario');
      chatInput.value = '';

      const idDigitando = adicionarMsgChat('A analisar no Supabase...', 'bot', true);

      try {
        const token = localStorage.getItem('token') || localStorage.getItem('access_token') || localStorage.getItem('nexus_token');
        const res = await fetch('/api/relatorios/chat-analise', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ mensagem: texto })
        });

        const data = await res.json();
        removerMsgChat(idDigitando);

        if (res.ok) {
          adicionarMsgChat(data.resposta || 'Sem resposta.', 'bot', false, data.permitirPdf);
        } else {
          adicionarMsgChat(data.error || 'Erro ao processar.', 'bot');
        }
      } catch (err) {
        removerMsgChat(idDigitando);
        adicionarMsgChat('Erro de conexão.', 'bot');
      }
    });
  });

  window.enviarSugestaoChat = function (texto) {
    const input = document.getElementById('nexusChatInput');
    if (input) {
      input.value = texto;
      document.getElementById('nexusChatForm').requestSubmit();
    }
  };

  function adicionarMsgChat(texto, remetente, isDigitando = false, permitirPdf = false) {
    const container = document.getElementById('nexusChatMessages');
    const idMsg = 'msg_' + Date.now();
    const div = document.createElement('div');
    div.id = idMsg;

    if (remetente === 'usuario') {
      div.className = 'flex items-start justify-end space-x-2';
      div.innerHTML = `
        <div class="bg-[#0F392B] dark:bg-emerald-600 text-white p-2.5 rounded-2xl max-w-[240px] leading-relaxed shadow-xs">
          ${escaparHtmlChat(texto)}
        </div>
      `;
    } else {
      let htmlConteudo = formatarMarkdownChat(texto);

      if (permitirPdf) {
        htmlConteudo += `
          <div class="mt-3 pt-2 border-t border-slate-200 dark:border-[#1C2C26]">
            <a href="/api/relatorios/exportar-pdf" target="_blank" class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#0F392B] dark:bg-emerald-600 text-white rounded-xl text-[10px] font-semibold hover:opacity-90 transition-opacity">
              <i class="fa-solid fa-file-pdf"></i>
              <span>Baixar Relatório em PDF</span>
            </a>
          </div>
        `;
      }

      div.className = 'flex items-start space-x-2';
      div.innerHTML = `
        <div class="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">AI</div>
        <div class="bg-white dark:bg-[#182B24] text-slate-800 dark:text-slate-200 p-2.5 rounded-2xl max-w-[240px] leading-relaxed border border-slate-200/60 dark:border-[#1C2C26] shadow-2xs ${isDigitando ? 'italic text-slate-400' : ''}">
          ${htmlConteudo}
        </div>
      `;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return idMsg;
  }

  function removerMsgChat(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function escaparHtmlChat(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function formatarMarkdownChat(str) {
    let formatado = escaparHtmlChat(str);
    formatado = formatado.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-emerald-700 dark:text-emerald-400">$1</strong>');
    formatado = formatado.replace(/\n/g, '<br>');
    return formatado;
  }
})();
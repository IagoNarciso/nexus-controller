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
            <button type="button" onclick="baixarRelatorioInventarioPDF()" class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#0F392B] dark:bg-emerald-600 text-white rounded-xl text-[10px] font-semibold hover:opacity-90 transition-opacity cursor-pointer">
              <i class="fa-solid fa-file-pdf"></i>
              <span>Baixar Relatório em PDF</span>
            </button>
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

  // Função para carregar o jsPDF sob demanda e gerar o PDF do inventário diretamente no navegador
  async function carregarJsPDFSeNecessarioChat() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = () => resolve(window.jspdf.jsPDF);
      script.onerror = () => reject(new Error('Falha ao carregar biblioteca de PDF.'));
      document.head.appendChild(script);
    });
  }

  async function baixarRelatorioInventarioPDF() {
    try {
      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('access_token') ||
        localStorage.getItem('nexus_token');

      const res = await fetch('/api/produtos', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) throw new Error('Falha ao obter dados do inventário.');

      const todosProdutos = await res.json();
      const produtos = (Array.isArray(todosProdutos) ? todosProdutos : []).filter((p) => {
        const status = String(p.status || p.estado || '').toLowerCase();
        return status === 'aprovado' || status === 'ativo' || p.aprovado === true || !p.status;
      });

      const jsPDF = await carregarJsPDFSeNecessarioChat();
      const doc = new jsPDF();

      const dataAtual = new Date().toLocaleString('pt-BR');
      let totalUnidades = 0;
      let valorTotalEstoque = 0;

      produtos.forEach((p) => {
        const qtd = Number(p.estoque ?? p.quantidade ?? 0);
        const preco = Number(p.preco_venda ?? p.preco ?? 0);
        totalUnidades += qtd;
        valorTotalEstoque += qtd * preco;
      });

      // Cabeçalho Institucional Nexus Controller
      doc.setFillColor(15, 57, 43); // #0F392B
      doc.rect(0, 0, 210, 32, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('NEXUS CONTROLLER - RELATORIO DE INVENTARIO', 14, 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Gerado em: ${dataAtual}`, 14, 24);

      // Resumo Geral
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Resumo Geral do Estoque', 14, 44);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`• Total de Itens Cadastrados: ${produtos.length}`, 14, 52);
      doc.text(`• Estoque Total Fisico: ${totalUnidades} unidades`, 14, 58);
      doc.text(
        `• Valor Estimado em Estoque: R$ ${valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        14,
        64
      );

      // Linha divisória
      doc.setDrawColor(203, 213, 225);
      doc.line(14, 70, 196, 70);

      // Cabeçalho da Tabela
      let y = 80;
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y - 6, 182, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('PRODUTO', 16, y);
      doc.text('CATEGORIA', 90, y);
      doc.text('QTD', 135, y);
      doc.text('PRECO UN.', 155, y);
      doc.text('SUBTOTAL', 178, y);

      y += 8;
      doc.setFont('helvetica', 'normal');

      produtos.forEach((p) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }

        const nome = String(p.nome || 'Sem nome').substring(0, 38);
        const categoria = String(p.categoria || p.categorias?.nome || 'Geral').substring(0, 20);
        const qtd = Number(p.estoque ?? p.quantidade ?? 0);
        const preco = Number(p.preco_venda ?? p.preco ?? 0);
        const subtotal = qtd * preco;

        doc.text(nome, 16, y);
        doc.text(categoria, 90, y);
        doc.text(`${qtd} un.`, 135, y);
        doc.text(`R$ ${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 155, y);
        doc.text(`R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 178, y);

        y += 7;
      });

      doc.save(`relatorio-inventario-nexus-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Não foi possível gerar o relatório em PDF no momento.');
    }
  }
  window.baixarRelatorioInventarioPDF = baixarRelatorioInventarioPDF;
})();
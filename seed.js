require('dotenv').config();
const supabaseConfig = require('./src/config/supabase');

const supabase = supabaseConfig.supabase || supabaseConfig;

const EMPRESA_DEMO = 'Nexus Demo';

async function executarSeed() {
  console.log(`🔄 A iniciar o reset e seed da empresa: "${EMPRESA_DEMO}"...\n`);

  try {
    // 1. LIMPEZA SEGURA (Apenas dados da empresa de demonstração)
    console.log('🧹 A limpar registos antigos da conta de demonstração...');
    
    await supabase.from('movimentacoes').delete().eq('empresa', EMPRESA_DEMO);
    await supabase.from('solicitacoes').delete().eq('empresa', EMPRESA_DEMO);
    await supabase.from('produtos').delete().eq('empresa', EMPRESA_DEMO);
    await supabase.from('fornecedores').delete().eq('empresa', EMPRESA_DEMO);
    await supabase.from('convites_empresas').delete().eq('empresa', EMPRESA_DEMO);
    await supabase.from('usuarios').delete().eq('empresa', EMPRESA_DEMO);

    console.log('✅ Limpeza concluída com sucesso!\n');

    // 2. CRIAR UTILIZADORES DE DEMONSTRAÇÃO NO SUPABASE AUTH E TABELA PÚBLICA
    console.log('👤 A criar utilizadores de demonstração...');

    const usuariosDemo = [
      {
        nome: 'Admin Demonstração',
        email: 'admin@nexusdemo.com',
        senha: 'demo123',
        cargo: 'admin',
        empresa: EMPRESA_DEMO,
        cnpj: '11.222.333/0001-44',
        regiao: 'Montes Claros / MG'
      },
      {
        nome: 'Operador Demonstração',
        email: 'operador@nexusdemo.com',
        senha: 'demo123',
        cargo: 'funcionario',
        empresa: EMPRESA_DEMO,
        cnpj: '11.222.333/0001-44',
        regiao: 'Montes Claros / MG'
      }
    ];

    const usuariosCriados = [];

    for (const u of usuariosDemo) {
      // Cria ou recupera no Supabase Auth usando o admin API
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.senha,
        email_confirm: true,
        user_metadata: {
          nome: u.nome,
          empresa: u.empresa,
          cnpj: u.cnpj,
          regiao: u.regiao,
          cargo: u.cargo
        }
      });

      if (authError && !authError.message.includes('already registered')) {
        throw new Error(`Erro ao criar utilizador Auth (${u.email}): ${authError.message}`);
      }

      // Se já existir no Auth, buscamos o ID na tabela pública ou criamos
      let userId = authData?.user?.id;
      
      if (!userId) {
        const { data: existingUser } = await supabase.from('usuarios').select('id').eq('email', u.email).maybeSingle();
        userId = existingUser?.id;
      }

      // Sincroniza na tabela pública `usuarios` (compatível com a sua rota /login e /perfil)
      const { data: dbData, error: dbError } = await supabase
        .from('usuarios')
        .upsert([
          {
            ...(userId ? { id: userId } : {}),
            nome: u.nome,
            email: u.email,
            senha: u.senha, // Mantido para compatibilidade com rotas como a de exclusão
            cargo: u.cargo,
            empresa: u.empresa,
            cnpj: u.cnpj,
            regiao: u.regiao,
            data_cadastro: new Date().toISOString()
          }
        ], { onConflict: 'email' })
        .select()
        .single();

      if (dbError) throw new Error(`Erro ao inserir utilizador na tabela pública: ${dbError.message}`);
      usuariosCriados.push(dbData);
    }

    const adminId = usuariosCriados[0].id;
    const operadorId = usuariosCriados[1].id;
    console.log('✅ Utilizadores de demonstração criados com sucesso (Senha padrão: demo123)');

    // 3. CRIAR FORNECEDORES (Vinculados ao adminId)
    console.log('🚚 A registar fornecedores padrão...');
    const { data: fornecedoresCriados, error: errFornecedores } = await supabase
      .from('fornecedores')
      .insert([
        {
          nome: 'TechLog Distribuidora',
          email: 'contato@techlog.com',
          telefone: '(11) 98765-4321',
          categoria: 'Hardware',
          usuario_id: adminId,
          empresa: EMPRESA_DEMO
        },
        {
          nome: 'Global Suprimentos',
          email: 'vendas@globalsupri.com',
          telefone: '(38) 99876-1234',
          categoria: 'Periféricos',
          usuario_id: adminId,
          empresa: EMPRESA_DEMO
        }
      ])
      .select();

    if (errFornecedores) throw new Error(`Erro ao criar fornecedores: ${errFornecedores.message}`);
    console.log('✅ Fornecedores registados!');

    // 4. CRIAR PRODUTOS (Com sku, preco_venda, estoque, ativo e status)
    console.log('📦 A cadastrar catálogo de produtos...');
    const { data: produtosCriados, error: errProdutos } = await supabase
      .from('produtos')
      .insert([
        {
          nome: 'Monitor Gamer 27" 144Hz',
          sku: 'HAR-10452',
          categoria: 'Hardware',
          preco_venda: 1450.00,
          estoque: 18,
          usuario_id: adminId,
          empresa: EMPRESA_DEMO,
          ativo: true,
          status: 'aprovado'
        },
        {
          nome: 'Teclado Mecânico Sem Fio',
          sku: 'PER-28910',
          categoria: 'Periféricos',
          preco_venda: 380.00,
          estoque: 28,
          usuario_id: adminId,
          empresa: EMPRESA_DEMO,
          ativo: true,
          status: 'aprovado'
        },
        {
          nome: 'SSD NVMe 1TB PCIe 4.0',
          sku: 'ARM-55320',
          categoria: 'Armazenamento',
          preco_venda: 520.00,
          estoque: 4, // <= 12 para acionar o alerta de Estoque Baixo!
          usuario_id: adminId,
          empresa: EMPRESA_DEMO,
          ativo: true,
          status: 'aprovado'
        },
        {
          nome: 'Headset Wireless 7.1',
          sku: 'PER-77412',
          categoria: 'Periféricos',
          preco_venda: 490.00,
          estoque: 15,
          usuario_id: operadorId,
          empresa: EMPRESA_DEMO,
          ativo: true,
          status: 'pendente' // Fica na fila de aprovação para demonstração!
        }
      ])
      .select();

    if (errProdutos) throw new Error(`Erro ao criar produtos: ${errProdutos.message}`);
    console.log('✅ Produtos cadastrados!');

    // 5. CRIAR MOVIMENTAÇÕES INICIAIS (Com tipo compra/venda e valor_unitario)
    console.log('📊 A gerar histórico de movimentações...');
    const produtoMonitor = produtosCriados[0];
    const produtoTeclado = produtosCriados[1];

    async function inserirMovimentacao(produto, opcoesTipo, quantidade, observacao) {
      let ultimoErro = null;
      for (const formatoTipo of opcoesTipo) {
        const { error } = await supabase
          .from('movimentacoes')
          .insert([
            {
              produto_id: produto.id,
              tipo: formatoTipo,
              quantidade: quantidade,
              valor_unitario: produto.preco_venda,
              observacao: observacao,
              lida: false,
              usuario_id: adminId,
              empresa: EMPRESA_DEMO
            }
          ]);
        if (!error) return;
        ultimoErro = error;
      }
      throw new Error(`Erro ao criar movimentações: ${ultimoErro.message}`);
    }

    await inserirMovimentacao(
      produtoMonitor,
      ['compra', 'COMPRA', 'Compra'],
      18,
      'Reposição de lote inicial para demonstração'
    );

    await inserirMovimentacao(
      produtoTeclado,
      ['venda', 'VENDA', 'Venda'],
      5,
      'Venda corporativa de demonstração'
    );

    console.log('✅ Movimentações registadas!\n');

    console.log('🎉 SEED CONCLUÍDO COM SUCESSO!');
    console.log('------------------------------------------------');
    console.log(`🏢 Empresa: ${EMPRESA_DEMO}`);
    console.log('🔑 Login Admin: admin@nexusdemo.com | Senha: demo123');
    console.log('🔑 Login Operador: operador@nexusdemo.com | Senha: demo123');
    console.log('------------------------------------------------');

    process.exit(0);
  } catch (erro) {
    console.error('\n❌ Erro durante a execução do Seed:', erro.message);
    process.exit(1);
  }
}

executarSeed();
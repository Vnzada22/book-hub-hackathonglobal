const STORAGE_KEY = 'bookhub_wallet_user';

// 0. VERIFICAÇÃO DE SEGURANÇA BASEADA NO TIPO DO BANCO DE DADOS
function verificarAcessoAdmin() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      alert('Faça login para acessar o painel administrativo.');
      window.location.href = '/login/login.html';
      return;
    }
    const user = JSON.parse(raw);
    // Permite acesso se o tipo for admin ou professor
    if (!user.tipo || (user.tipo !== 'admin' && user.tipo !== 'professor')) {
      alert('Acesso restrito: apenas administradores ou professores podem entrar no painel.');
      window.location.href = '/';
    }
  } catch (e) {
    window.location.href = '/login/login.html';
  }
}
verificarAcessoAdmin();

const form = document.getElementById('formLivro');
const tbody = document.querySelector('#tabelaLivros tbody');
const filtroGenero = document.getElementById('filtroGenero');
const filtroDisponivel = document.getElementById('filtroDisponivel');
const filtroBuscaLivros = document.getElementById('filtroBuscaLivros');
const btnLimparFiltrosLivros = document.getElementById('btnLimparFiltrosLivros');
let livrosCarregados = [];

function normalizarBusca(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

// Tradução apenas para apresentação: mantemos os valores originais no banco e no filtro.
const GENEROS_PT = {
  'fiction':'Ficção', 'non-fiction':'Não ficção', 'nonfiction':'Não ficção',
  'fantasy':'Fantasia', 'science fiction':'Ficção científica', 'sci-fi':'Ficção científica',
  'romance':'Romance', 'romantic fiction':'Romance', 'mystery':'Mistério',
  'thriller':'Suspense', 'horror':'Terror', 'adventure':'Aventura',
  'biography':'Biografia', 'autobiography':'Autobiografia', 'memoir':'Memórias',
  'history':'História', 'historical fiction':'Ficção histórica',
  'poetry':'Poesia', 'drama':'Drama', 'comics':'Quadrinhos', 'graphic novel':'Romance gráfico',
  'young adult':'Literatura juvenil', 'children':'Infantil', "children's literature":'Literatura infantil',
  "children's stories, danish":'Contos infantis', "children's stories":'Contos infantis',
  'self-help':'Autoajuda', 'philosophy':'Filosofia', 'psychology':'Psicologia',
  'religion':'Religião', 'spirituality':'Espiritualidade', 'science':'Ciência',
  'technology':'Tecnologia', 'business':'Negócios', 'education':'Educação',
  'classics':'Clássicos', 'classic':'Clássicos', 'literature':'Literatura',
  'literary fiction':'Ficção literária', 'crime':'Policial', 'crime fiction':'Ficção policial',
  'dystopian':'Distopia', 'dystopia':'Distopia', 'politics':'Política',
  'social science':'Ciências sociais', 'travel':'Viagem', 'art':'Arte',
  'humor':'Humor', 'cookbooks':'Culinária', 'cooking':'Culinária',
  'health':'Saúde', 'sports':'Esportes', 'short stories':'Contos',
  'essays':'Ensaios', 'reference':'Referência', 'language':'Linguagem',
  'spanish language books':'Livros em espanhol', 'totalitarianism':'Totalitarismo',
  'culpabilité':'Culpa', 'general':'Geral', 'other':'Outros'
};
function nomeGeneroPT(valor) {
  const original = String(valor ?? '').trim();
  const normalizado = normalizarBusca(original);
  if (GENEROS_PT[normalizado]) return GENEROS_PT[normalizado];
  if (/children.s stories/i.test(original)) return 'Contos infantis';
  if (/fairy tales/i.test(original)) return 'Contos de fadas';
  // Mantém valores antigos para consulta administrativa; novos cadastros
  // já recebem exclusivamente gêneros normalizados no servidor.
  return original || 'Não informado';
}

function atualizarFiltroGeneros() {
  if (!filtroGenero) return;
  const anterior = filtroGenero.value;
  const generos = [...new Set(livrosCarregados.map(livro => String(livro.genero ?? '').trim()).filter(Boolean))]
    .sort((a, b) => nomeGeneroPT(a).localeCompare(nomeGeneroPT(b), 'pt-BR'));
  filtroGenero.replaceChildren(new Option('Todos', ''));
  generos.forEach(genero => filtroGenero.add(new Option(nomeGeneroPT(genero), genero)));
  filtroGenero.value = generos.includes(anterior) ? anterior : '';
}

function livrosFiltrados() {
  const termo = normalizarBusca(filtroBuscaLivros?.value);
  const genero = filtroGenero?.value || '';
  const disponivel = filtroDisponivel?.value || '';
  return livrosCarregados.filter(livro => {
    const texto = normalizarBusca([livro.titulo, livro.autor, livro.editora, livro.genero, nomeGeneroPT(livro.genero)].join(' '));
    const coincideBusca = !termo || texto.includes(termo);
    const coincideGenero = !genero || livro.genero === genero;
    const coincideDisponivel = !disponivel || String(livro.disponivel === true || livro.disponivel === 'true') === disponivel;
    return coincideBusca && coincideGenero && coincideDisponivel;
  });
}

[filtroGenero, filtroDisponivel].forEach(el => el?.addEventListener('change', renderizarTabelaLivros));
filtroBuscaLivros?.addEventListener('input', renderizarTabelaLivros);
btnLimparFiltrosLivros?.addEventListener('click', () => {
  if (filtroGenero) filtroGenero.value = '';
  if (filtroDisponivel) filtroDisponivel.value = '';
  if (filtroBuscaLivros) filtroBuscaLivros.value = '';
  renderizarTabelaLivros();
});

const btnIA = document.getElementById('btnIA');
const iaFeedback = document.getElementById('iaFeedback');
const btnProcessarMultiplos = document.getElementById('btnProcessarMultiplos');
const btnSalvarTodosMultiplos = document.getElementById('btnSalvarTodosMultiplos');
const multiIASaveAllStatus = document.getElementById('multiIASaveAllStatus');
const btnCancelar = document.getElementById('btnCancelar');
const inputListaTitulosIA = document.getElementById('listaTitulosIA');
const multiIAReview = document.getElementById('multiIAReview');
const multiIAResults = document.getElementById('multiIAResults');
const multiIASkipped = document.getElementById('multiIASkipped');

// Conectando os campos do HTML ao Javascript
const inputId = document.getElementById('livroId');
const inputTitulo = document.getElementById('titulo');
const inputAutor = document.getElementById('autor');
const inputEditora = document.getElementById('editora');
const inputCapa = document.getElementById('url_capa');
const inputAno = document.getElementById('ano_publicacao');
const inputGenero = document.getElementById('genero');
const inputPaginas = document.getElementById('numero_paginas');
const inputIdioma = document.getElementById('idioma');
const inputResumo = document.getElementById('resumo');
const btnAlternarMultiplos = document.getElementById('btnAlternarMultiplos');
const btnFecharMultiplos = document.getElementById('btnFecharMultiplos');
const multiIABox = document.getElementById('multiIABox');
const avisoPaginas = document.getElementById('avisoPaginas');
const avisoResumo = document.getElementById('avisoResumo');
const dadosLivroTitulo = document.getElementById('dadosLivroTitulo');

function alternarBuscaEmLote(abrir) {
  if (!multiIABox || !btnAlternarMultiplos) return;
  multiIABox.hidden = !abrir;
  btnAlternarMultiplos.setAttribute('aria-expanded', String(abrir));
  btnAlternarMultiplos.textContent = abrir ? '− Ocultar busca de vários livros' : '+ Adicionar vários livros';
  if (abrir) {
    multiIABox.scrollIntoView({behavior:'smooth', block:'nearest'});
    inputListaTitulosIA?.focus({preventScroll:true});
  } else btnAlternarMultiplos.focus({preventScroll:true});
}
btnAlternarMultiplos?.addEventListener('click', () => alternarBuscaEmLote(multiIABox.hidden));
btnFecharMultiplos?.addEventListener('click', () => alternarBuscaEmLote(false));

function limparSugestoesIA() {
  if (avisoPaginas) { avisoPaginas.replaceChildren(); avisoPaginas.hidden = true; }
  if (avisoResumo) { avisoResumo.textContent = ''; avisoResumo.hidden = true; }
}


// 1. CARREGAR, FILTRAR E EXIBIR LIVROS DO BANCO
function criarCelula(texto, classe = '') {
  const td = document.createElement('td');
  if (classe) td.className = classe;
  td.textContent = String(texto ?? '—');
  return td;
}

function renderizarTabelaLivros() {
  if (!tbody) return;
  tbody.replaceChildren();
  const livros = livrosFiltrados();
  if (!livros.length) {
    const tr = document.createElement('tr');
    const td = criarCelula(livrosCarregados.length ? 'Nenhum livro corresponde aos filtros selecionados.' : 'Nenhum livro cadastrado.');
    td.colSpan = 8;
    td.className = 'admin-empty-state';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  livros.forEach(livro => {
    const tr = document.createElement('tr');
    tr.dataset.bookId = String(livro.id);
    const tdCapa = document.createElement('td');
    tdCapa.className = 'admin-book-cover-cell';
    const fallback = () => {
      const div = document.createElement('div');
      div.className = 'capa-miniatura';
      div.textContent = String(livro.titulo || 'Livro').split(' ')[0];
      return div;
    };
    if (livro.url_capa) {
      const img = document.createElement('img');
      img.src = livro.url_capa;
      img.className = 'capa-miniatura';
      img.alt = `Capa de ${livro.titulo || 'livro'}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
      tdCapa.appendChild(img);
    } else tdCapa.appendChild(fallback());

    const tdTitulo = criarCelula(livro.titulo, 'admin-book-title');
    const tdAutor = criarCelula(livro.autor, 'admin-book-author');
    const tdEditora = criarCelula(livro.editora, 'admin-book-publisher');
    const tdGenero = criarCelula(nomeGeneroPT(livro.genero), 'admin-book-genre');
    const tdAno = criarCelula(livro.ano_publicacao, 'admin-book-year');
    const tdDisponivel = document.createElement('td');
    const status = document.createElement('span');
    const disponivel = livro.disponivel === true || livro.disponivel === 'true';
    status.className = `admin-availability ${disponivel ? 'is-available' : 'is-unavailable'}`;
    status.textContent = disponivel ? 'Sim' : 'Não';
    tdDisponivel.appendChild(status);

    const tdAcoes = document.createElement('td');
    tdAcoes.className = 'admin-book-actions-cell';
    const divAcoes = document.createElement('div');
    divAcoes.className = 'admin-book-actions';
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'btn-editar';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => editarLivro(livro.id));
    const btnExcluir = document.createElement('button');
    btnExcluir.type = 'button';
    btnExcluir.className = 'btn-excluir';
    btnExcluir.textContent = 'Excluir';
    btnExcluir.addEventListener('click', () => excluirLivro(livro.id));
    divAcoes.append(btnEditar, btnExcluir);
    tdAcoes.appendChild(divAcoes);
    tr.append(tdCapa, tdTitulo, tdAutor, tdEditora, tdGenero, tdAno, tdDisponivel, tdAcoes);
    tbody.appendChild(tr);
  });
}

async function carregarLivros() {
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" role="status">Carregando livros...</td></tr>';
  try {
    const res = await fetch('/api/livros');
    if (!res.ok) throw new Error('Falha ao carregar o catálogo.');
    const livros = await res.json();
    if (!Array.isArray(livros)) throw new Error('Resposta inválida do catálogo.');
    livrosCarregados = livros;
    atualizarFiltroGeneros();
    renderizarTabelaLivros();
  } catch (erro) {
    console.error('Erro ao carregar livros:', erro);
    if (tbody) {
      tbody.replaceChildren();
      const tr = document.createElement('tr');
      const td = criarCelula('Não foi possível carregar os livros. Atualize a página para tentar novamente.');
      td.colSpan = 8;
      td.setAttribute('role', 'alert');
      td.className = 'admin-empty-state';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }
}

function extrairTitulosMultiplos(texto) {
  return String(texto || '')
    .split(/[\n,]/)
    .map((titulo) => titulo.trim())
    .filter(Boolean)
    .filter((titulo, index, lista) => lista.indexOf(titulo) === index);
}

function criarCampoRevisaoLivro(livro, campo, rotulo, { tipo = 'text', obrigatorio = false, larguraCompleta = false } = {}) {
  const grupo = document.createElement('div');
  grupo.className = `input-group${larguraCompleta ? ' full-width' : ''}`;
  const label = document.createElement('label');
  const input = tipo === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  const id = `review-${campo}-${Math.random().toString(36).slice(2)}`;
  label.htmlFor = id;
  label.textContent = `${rotulo}${obrigatorio ? ' *' : ''}`;
  input.id = id;
  input.dataset.field = campo;
  if (tipo !== 'textarea') input.type = tipo;
  if (tipo === 'number') input.step = '1';
  input.value = livro[campo] ?? '';
  input.required = obrigatorio;
  grupo.append(label, input);
  return grupo;
}

function renderizarRevisaoLote(payload) {
  multiIAResults.replaceChildren();
  multiIASkipped.replaceChildren();
  multiIASaveAllStatus.textContent = '';
  multiIASaveAllStatus.className = 'multi-ia-save-all-status';
  multiIAReview.hidden = false;

  for (const [indice, livro] of (payload.livros || []).entries()) {
    const card = document.createElement('article');
    card.className = 'multi-ia-book';
    card.dataset.batchIndex = String(indice);
    const titulo = document.createElement('h4');
    titulo.textContent = livro.titulo_catalogo && livro.titulo_catalogo !== livro.titulo
      ? `${livro.titulo} — ${livro.titulo_catalogo}`
      : livro.titulo;
    const fonte = document.createElement('p');
    fonte.className = 'book-source';
    fonte.textContent = livro.dados_confirmados
      ? `Fontes consultadas: ${(livro.fontes || []).map(item => item.nome).join(', ') || livro.fonte_dados || 'Catálogo externo'}. Confira título e dados antes de salvar.`
      : `${livro.fonte_dados}. Confira e preencha os dados antes de salvar.`;
    const status = document.createElement('p');
    status.className = 'book-review-status';
    status.textContent = !livro.dados_confirmados
      ? 'Nenhum dado foi inventado. Você pode preencher esta ficha manualmente e salvar depois.'
      : livro.campos_ausentes?.length
      ? `Complete os campos sem informação: ${livro.campos_ausentes.join(', ')}.`
      : 'Revise os dados e confirme para adicionar ao acervo.';

    const fields = [
      ['titulo', 'Título', { obrigatorio: true }],
      ['autor', 'Autor', { obrigatorio: true }],
      ['editora', 'Editora', { obrigatorio: true }],
      ['ano_publicacao', 'Ano', { tipo: 'number' }],
      ['genero', 'Gênero', {}],
      ['numero_paginas', 'Páginas', { tipo: 'number' }],
      ['idioma', 'Idioma', {}],
      ['url_capa', 'URL da capa', { tipo: 'url', larguraCompleta: true }],
      ['resumo', 'Resumo em português (Brasil)', { tipo: 'textarea', obrigatorio: true, larguraCompleta: true }]
    ];
    for (const [campo, rotulo, opcoes] of fields) {
      card.appendChild(criarCampoRevisaoLivro(livro, campo, rotulo, opcoes));
    }

    const botaoSalvar = document.createElement('button');
    botaoSalvar.type = 'button';
    botaoSalvar.className = 'btn-salvar btn-save-review';
    botaoSalvar.textContent = 'Confirmar e salvar este livro';
    botaoSalvar.addEventListener('click', async () => {
      const campos = [...card.querySelectorAll('[data-field]')];
      const invalido = campos.find(campo => !campo.reportValidity());
      if (invalido) return;

      botaoSalvar.disabled = true;
      botaoSalvar.textContent = 'Salvando...';
      status.textContent = 'Salvando livro...';
      const dados = Object.fromEntries(campos.map(campo => [campo.dataset.field, campo.value.trim()]));
      for (const campo of ['ano_publicacao', 'numero_paginas']) {
        dados[campo] = dados[campo] ? Number(dados[campo]) : null;
      }

      try {
        const resposta = await fetch('/api/livros', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        });
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível salvar o livro.');
        status.classList.add('is-saved');
        status.textContent = 'Livro salvo no acervo.';
        botaoSalvar.textContent = 'Salvo';
        carregarLivros();
      } catch (erro) {
        status.textContent = erro.message || 'Erro ao salvar o livro.';
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = 'Tentar salvar novamente';
      }
    });
    card.append(fonte, status, botaoSalvar);
    if (livro.fontes?.some(item => item.url)) {
      const links = document.createElement('p');
      links.className = 'book-source-links';
      links.append(document.createTextNode('Ver fontes: '));
      livro.fontes.filter(item => item.url).forEach((item, index) => {
        if (index) links.append(document.createTextNode(' · '));
        const link = document.createElement('a');
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.nome;
        links.appendChild(link);
      });
      card.insertBefore(links, botaoSalvar);
    }
    multiIAResults.appendChild(card);
  }

  const avisos = [
    ...(payload.naoEncontrados || []).map(titulo => `Sem correspondência segura: ${titulo}.`),
    ...(payload.falhas || []).map(item => `Falha ao consultar "${item.titulo}": ${item.erro}`)
  ];
  if (avisos.length) {
    const lista = document.createElement('p');
    lista.textContent = avisos.join(' ');
    multiIASkipped.appendChild(lista);
  }
  multiIAReview.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function obterDadosDoCard(card) {
  const campos = [...card.querySelectorAll('[data-field]')];
  const invalido = campos.find((campo) => !campo.reportValidity());
  if (invalido) return null;
  const dados = Object.fromEntries(campos.map((campo) => [campo.dataset.field, campo.value.trim()]));
  for (const campo of ['ano_publicacao', 'numero_paginas']) {
    dados[campo] = dados[campo] ? Number(dados[campo]) : null;
  }
  return dados;
}

btnSalvarTodosMultiplos.addEventListener('click', async () => {
  const cards = [...multiIAResults.querySelectorAll('.multi-ia-book')]
    .filter((card) => !card.querySelector('.book-review-status')?.classList.contains('is-saved'));
  if (!cards.length) {
    multiIASaveAllStatus.textContent = 'Todos os livros desta busca já foram salvos.';
    multiIASaveAllStatus.className = 'multi-ia-save-all-status is-success';
    return;
  }

  const livros = [];
  for (const card of cards) {
    const dados = obterDadosDoCard(card);
    if (!dados) {
      multiIASaveAllStatus.textContent = 'Preencha os campos obrigatórios destacados antes de salvar.';
      multiIASaveAllStatus.className = 'multi-ia-save-all-status is-error';
      return;
    }
    livros.push(dados);
  }

  btnSalvarTodosMultiplos.disabled = true;
  cards.forEach((card) => {
    const botao = card.querySelector('.btn-save-review');
    if (botao) botao.disabled = true;
  });
  multiIASaveAllStatus.textContent = `Salvando ${livros.length} livro(s)...`;
  multiIASaveAllStatus.className = 'multi-ia-save-all-status';

  try {
    const resposta = await fetch('/api/livros/lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ livros })
    });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível salvar os livros.');

    for (const salvo of resultado.salvos || []) {
      const card = cards[salvo.indice];
      if (!card) continue;
      const status = card.querySelector('.book-review-status');
      status.classList.add('is-saved');
      status.textContent = 'Livro salvo no acervo.';
      const botao = card.querySelector('.btn-save-review');
      botao.textContent = 'Salvo';
      botao.disabled = true;
    }
    for (const falha of resultado.falhas || []) {
      const card = cards[falha.indice];
      if (!card) continue;
      const status = card.querySelector('.book-review-status');
      status.textContent = falha.erro || 'Não foi possível salvar este livro.';
      const botao = card.querySelector('.btn-save-review');
      botao.textContent = 'Tentar salvar novamente';
      botao.disabled = false;
    }

    const quantSalvos = resultado.salvos?.length || 0;
    const quantFalhas = resultado.falhas?.length || 0;
    multiIASaveAllStatus.textContent = quantFalhas
      ? `${quantSalvos} salvo(s); ${quantFalhas} com erro. Você pode tentar novamente os que falharam.`
      : `${quantSalvos} livro(s) salvo(s) com sucesso.`;
    multiIASaveAllStatus.className = `multi-ia-save-all-status ${quantFalhas ? 'is-error' : 'is-success'}`;
    await carregarLivros();
  } catch (erro) {
    multiIASaveAllStatus.textContent = erro.message || 'Erro ao salvar os livros.';
    multiIASaveAllStatus.className = 'multi-ia-save-all-status is-error';
    cards.forEach((card) => {
      const botao = card.querySelector('.btn-save-review');
      if (botao && !card.querySelector('.book-review-status')?.classList.contains('is-saved')) botao.disabled = false;
    });
  } finally {
    btnSalvarTodosMultiplos.disabled = false;
  }
});

btnProcessarMultiplos.addEventListener('click', async () => {
  const titulos = extrairTitulosMultiplos(inputListaTitulosIA.value);

  if (!titulos.length) {
    alert('⚠️ Digite pelo menos um título para gerar vários livros pela IA.');
    return;
  }

  btnProcessarMultiplos.disabled = true;
  btnProcessarMultiplos.textContent = '⏳ Buscando em vários catálogos...';
  multiIAReview.hidden = true;

  try {
    const res = await fetch('/api/ia/preencher-multiplo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulos })
    });

    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.erro || 'Falha ao gerar livros em lote.');
    }

    renderizarRevisaoLote(payload);
  } catch (erro) {
    console.error(erro);
    alert(erro.message || 'Erro ao gerar vários livros pela IA.');
  } finally {
    btnProcessarMultiplos.disabled = false;
    btnProcessarMultiplos.textContent = 'Buscar vários livros';
  }
});

// 2. Pesquisa bibliográfica: fontes oficiais, correspondência de título e revisão manual.
function mostrarEstadoIA(mensagem, classe = '') {
  if (!iaFeedback) return;
  iaFeedback.hidden = false;
  iaFeedback.className = `ia-feedback ${classe}`;
  iaFeedback.replaceChildren();
  const paragrafo = document.createElement('p');
  paragrafo.textContent = mensagem;
  iaFeedback.appendChild(paragrafo);
}

btnIA.addEventListener('click', async () => {
  const titulo = inputTitulo.value.trim();
  if (!titulo) { mostrarEstadoIA('Informe um título ou ISBN para iniciar a pesquisa.', 'is-error'); return; }

  limparSugestoesIA();
  btnIA.disabled = true;
  btnIA.textContent = 'Consultando catálogos...';
  mostrarEstadoIA('Pesquisando Google Books, Open Library e títulos alternativos quando necessário. Isso pode levar alguns segundos.');
  try {
    const res = await fetch('/api/ia/preencher', {
      method: 'POST', headers: { 'Content-Type':'application/json' }, body:JSON.stringify({titulo})
    });
    const dados = await res.json();
    if (!res.ok) {
      const etapas = Array.isArray(dados.tentativas) ? dados.tentativas.length : 0;
      throw new Error(`${dados.erro || 'Livro não encontrado.'}${etapas ? ` (${etapas} etapas de consulta realizadas)` : ''} Preencha manualmente ou tente usar o ISBN.`);
    }

    // Atualiza o formulário apenas depois de encontrar uma correspondência segura.
    // Campos ausentes ficam vazios; não substituímos por informações fictícias.
    inputTitulo.value = dados.titulo || titulo;
    inputAutor.value = dados.autor || '';
    inputEditora.value = dados.editora || '';
    inputAno.value = dados.ano_publicacao || '';
    inputGenero.value = nomeGeneroPT(dados.genero || '');
    inputPaginas.value = dados.numero_paginas || '';
    inputIdioma.value = dados.idioma || '';
    inputResumo.value = dados.resumo || '';
    inputCapa.value = dados.url_capa || '';
    limparSugestoesIA();
    if (dados.paginas_sugeridas?.numero && !dados.numero_paginas && avisoPaginas) {
      const sugestao = dados.paginas_sugeridas;
      avisoPaginas.hidden = false;
      const frase = document.createElement('span');
      frase.textContent = `Outra edição pode ter cerca de ${sugestao.numero} páginas (${sugestao.fonte}). Confira seu exemplar. `;
      const usar = document.createElement('button');
      usar.type = 'button';
      usar.className = 'btn-use-estimated-pages';
      usar.textContent = 'Usar como estimativa';
      usar.addEventListener('click', () => {
        inputPaginas.value = sugestao.numero;
        avisoPaginas.textContent = `Estimativa aplicada: ${sugestao.numero} páginas. Confirme na edição antes de salvar.`;
      });
      avisoPaginas.append(frase, usar);
    }
    if (avisoResumo) {
      avisoResumo.hidden = false;
      avisoResumo.className = `ia-summary-note ${dados.resumo_revisao_obrigatoria ? 'needs-review' : ''}`;
      const fonteResumo = String(dados.campos_fonte?.resumo || '');
      avisoResumo.textContent = !dados.resumo
        ? 'Não foi encontrado um resumo confiável em português do Brasil. Escreva uma apresentação original da obra antes de salvar.'
        : fonteResumo.startsWith('Resumo editorial')
          ? 'Resumo editorial original em português do Brasil. Confira se corresponde ao conto ou livro que será cadastrado.'
          : dados.resumo_revisao_obrigatoria
            ? 'Resumo em português obtido de fonte complementar ou elaborado com apoio de IA. Revise os fatos antes de publicar.'
            : 'Resumo recuperado de catálogo bibliográfico em português. Confira se descreve a mesma obra e respeite os direitos da fonte.';
    }

    const ausentes = dados.campos_ausentes || [];
    const traduzir = {url_capa:'capa', ano_publicacao:'ano', numero_paginas:'número de páginas', resumo:'resumo', genero:'gênero', idioma:'idioma', editora:'editora', autor:'autor'};
    mostrarEstadoIA(`Livro localizado: ${dados.titulo || titulo}. Fontes: ${(dados.fontes || []).map(f=>f.nome).join(', ') || dados.fonte_dados || 'catálogo'}. ${ausentes.length ? `Preencha ou confirme os campos pendentes: ${ausentes.map(c=>traduzir[c] || c).join(', ')}.` : 'Todos os campos principais foram encontrados.'} ${dados.aviso || 'Confira a edição antes de salvar.'}`, ausentes.length ? 'is-warning' : 'is-success');
    // Campos da busca individual ficam logo abaixo, sem a busca em lote separando o formulário.
    dadosLivroTitulo?.classList.add('has-search-results');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dadosLivroTitulo?.scrollIntoView({block:'start'});
    } else {
      dadosLivroTitulo?.scrollIntoView({behavior:'smooth', block:'start'});
    }
    if (Array.isArray(dados.fontes) && iaFeedback) {
      const links = document.createElement('div');
      links.className = 'ia-feedback-sources';
      for (const fonte of dados.fontes.filter(f=>/^https:\/\//.test(f.url || ''))) {
        const a = document.createElement('a');
        a.href = fonte.url;
        a.rel = 'noopener noreferrer';
        a.target = '_blank';
        a.textContent = `Conferir ${fonte.nome}`;
        links.append(a);
      }
      iaFeedback.appendChild(links);
    }
  } catch (erro) {
    console.error('Erro na pesquisa bibliográfica:', erro);
    mostrarEstadoIA(erro.message || 'Falha ao consultar o catálogo. Tente novamente ou preencha manualmente.', 'is-error');
  } finally {
    btnIA.textContent = 'Procurar um livro';
    btnIA.disabled = false;
  }
});

// 3. SALVAR OU EDITAR NO BANCO DE DADOS
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const dados = {
    titulo: inputTitulo.value,
    autor: inputAutor.value,
    editora: inputEditora.value,
    url_capa: inputCapa.value,
    ano_publicacao: inputAno.value ? parseInt(inputAno.value) : null,
    genero: inputGenero.value,
    idioma: inputIdioma.value,
    numero_paginas: inputPaginas.value ? parseInt(inputPaginas.value) : null,
    resumo: inputResumo.value.trim()
  };

  const id = inputId.value;
  const metodo = id ? 'PUT' : 'POST';
  const url = id ? `/api/livros/${id}` : '/api/livros';

  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });

    if(res.ok) {
      alert('✅ Livro salvo com sucesso!');
      limparFormulario();
      carregarLivros();
    } else {
      const erro = await res.json();
      alert('Erro ao salvar no banco de dados: ' + erro.erro);
    }
  } catch (erro) {
    alert('Erro de conexão ao tentar salvar o livro.');
  }
});

// 4. EXCLUIR LIVRO
window.excluirLivro = async (id) => {
  if(confirm('Tem certeza que deseja excluir este livro permanentemente?')) {
    const linha = tbody.querySelector(`tr[data-book-id="${id}"]`);
    const botao = linha?.querySelector('.btn-excluir');
    if (botao) {
      botao.disabled = true;
      botao.textContent = 'Excluindo...';
    }
    try {
      const res = await fetch(`/api/livros/${id}`, { method: 'DELETE' });
      const resultado = await res.json();
      if (!res.ok) throw new Error(resultado.erro || 'Não foi possível excluir o livro.');
      await carregarLivros();
    } catch(erro) {
      alert(erro.message || 'Erro ao excluir o livro.');
      if (botao) {
        botao.disabled = false;
        botao.textContent = 'Excluir';
      }
    }
  }
};

// 5. EDITAR LIVRO
window.editarLivro = async (id) => {
  try {
    const res = await fetch(`/api/livros/${id}`);
    const livro = await res.json();
    if (!res.ok) throw new Error(livro.erro || 'Não foi possível carregar o livro.');

    if(livro) {
      inputId.value = livro.id;
      inputTitulo.value = livro.titulo;
      inputAutor.value = livro.autor;
      inputEditora.value = livro.editora;
      inputCapa.value = livro.url_capa || '';
      inputAno.value = livro.ano_publicacao || '';
      inputGenero.value = livro.genero || '';
      inputPaginas.value = livro.numero_paginas || '';
      inputIdioma.value = livro.idioma || 'Português';
      inputResumo.value = livro.resumo || livro.descricao || '';
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch(erro) {
    alert(erro.message || 'Erro ao carregar o livro para edição.');
  }
};

// 6. LIMPAR FORMULÁRIO
function limparFormulario() {
  inputId.value = '';
  form.reset();
  inputIdioma.value = 'Português';
}

btnCancelar.addEventListener('click', limparFormulario);

carregarLivros();

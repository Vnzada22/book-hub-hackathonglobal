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
const btnIA = document.getElementById('btnIA');
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

// 1. CARREGAR LIVROS DO BANCO DE DADOS
async function carregarLivros() {
  try {
    const res = await fetch('/api/livros');
    const livros = await res.json();
    tbody.innerHTML = '';
    
    livros.forEach(livro => {
      const tr = document.createElement('tr');
      tr.dataset.bookId = String(livro.id);
      const primeiraPalavra = livro.titulo.split(' ')[0];
      
      const capaHTML = livro.url_capa 
        ? `<img src="${livro.url_capa}" class="capa-miniatura" alt="capa" loading="lazy" decoding="async" onerror="this.outerHTML='<div class=\\'capa-miniatura\\'>${primeiraPalavra}</div>'">`
        : `<div class="capa-miniatura">${primeiraPalavra}</div>`;
      
      tr.innerHTML = `
        <td class="admin-book-cover-cell">${capaHTML}</td>
        <td><strong class="admin-book-title" title="${livro.titulo}">${livro.titulo}</strong></td>
        <td><span class="admin-book-author" title="${livro.autor}">${livro.autor}</span></td>
        <td><span class="admin-book-genre" title="${livro.genero || '-'}">${livro.genero || '-'}</span></td>
        <td class="admin-book-actions-cell">
          <div class="admin-book-actions">
            <button class="btn-editar" onclick="editarLivro(${livro.id})">Editar</button>
            <button class="btn-excluir" onclick="excluirLivro(${livro.id})">Excluir</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (erro) {
    console.error('Erro ao carregar livros:', erro);
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

// 2. A MÁGICA DA INTELIGÊNCIA ARTIFICIAL
btnIA.addEventListener('click', async () => {
  const titulo = inputTitulo.value.trim();
  
  if(!titulo) {
    alert('⚠️ Por favor, digite o título do livro primeiro!');
    return;
  }

  btnIA.textContent = 'Consultando...';
  btnIA.disabled = true;

  inputAutor.value = '';
  inputEditora.value = '';
  inputAno.value = '';
  inputGenero.value = '';
  inputPaginas.value = '';
  inputIdioma.value = '';
  inputResumo.value = '';
  inputCapa.value = '';

  try {
    const res = await fetch('/api/ia/preencher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo })
    });

    const dados = await res.json();
    if (res.ok) {
      inputTitulo.value = dados.titulo || titulo;
      inputAutor.value = dados.autor || '';
      inputEditora.value = dados.editora || '';
      inputAno.value = dados.ano_publicacao || '';
      inputGenero.value = dados.genero || '';
      inputPaginas.value = dados.numero_paginas || '';
      inputIdioma.value = dados.idioma || '';
      inputResumo.value = dados.resumo || dados.descricao || '';
      inputCapa.value = dados.url_capa || '';

      const camposAusentes = [
        !dados.autor && 'autor',
        !dados.editora && 'editora',
        !dados.ano_publicacao && 'ano de publicação',
        !dados.genero && 'gênero',
        !dados.numero_paginas && 'número de páginas',
        !dados.resumo && 'resumo',
        !dados.url_capa && 'capa'
      ].filter(Boolean);
      const avisoCampos = camposAusentes.length
        ? `\n\nA fonte não fornece: ${camposAusentes.join(', ')}. Complete esses campos manualmente antes de salvar.`
        : '';
      alert(`✨ Dados encontrados em ${dados.fonte_dados || 'um catálogo de livros'}. Confira as informações antes de salvar.${avisoCampos}`);
    } else {
      throw new Error(dados.erro || 'Não foi possível localizar esse livro.');
    }
  } catch (erro) {
    console.error(erro);
    alert(erro.message || 'Erro de conexão ao consultar o catálogo de livros.');
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
      linha?.remove();
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

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
const btnIAVarios = document.getElementById('btnIAVarios');
const btnProcessarMultiplos = document.getElementById('btnProcessarMultiplos');
const btnCancelar = document.getElementById('btnCancelar');
const multiIABox = document.getElementById('multiIABox');
const inputListaTitulosIA = document.getElementById('listaTitulosIA');

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
      const primeiraPalavra = livro.titulo.split(' ')[0];
      
      const capaHTML = livro.url_capa 
        ? `<img src="${livro.url_capa}" class="capa-miniatura" alt="capa" onerror="this.outerHTML='<div class=\\'capa-miniatura\\'>${primeiraPalavra}</div>'">`
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

btnIAVarios.addEventListener('click', () => {
  const aberta = multiIABox.style.display !== 'none';
  multiIABox.style.display = aberta ? 'none' : 'block';
  if (!aberta) {
    inputListaTitulosIA.focus();
  }
});

btnProcessarMultiplos.addEventListener('click', async () => {
  const titulos = extrairTitulosMultiplos(inputListaTitulosIA.value);

  if (!titulos.length) {
    alert('⚠️ Digite pelo menos um título para gerar vários livros pela IA.');
    return;
  }

  btnProcessarMultiplos.disabled = true;
  btnProcessarMultiplos.textContent = '⏳ Consultando catálogos...';

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

    const avisoNaoEncontrados = payload.naoEncontrados?.length
      ? `\n\nSem correspondência confiável nos catálogos: ${payload.naoEncontrados.join(', ')}`
      : '';
    const avisoIncompletos = payload.incompletos?.length
      ? `\n\nNão adicionados por falta de dados confiáveis (autor, editora ou resumo): ${payload.incompletos.map((livro) => livro.titulo).join(', ')}`
      : '';
    alert(`✅ ${payload.total} livro(s) encontrado(s) e adicionado(s).${avisoNaoEncontrados}${avisoIncompletos}`);
    inputListaTitulosIA.value = '';
    multiIABox.style.display = 'none';
    carregarLivros();
  } catch (erro) {
    console.error(erro);
    alert(erro.message || 'Erro ao gerar vários livros pela IA.');
  } finally {
    btnProcessarMultiplos.disabled = false;
    btnProcessarMultiplos.textContent = 'Buscar e adicionar livros';
  }
});

// 2. A MÁGICA DA INTELIGÊNCIA ARTIFICIAL
btnIA.addEventListener('click', async () => {
  const titulo = inputTitulo.value.trim();
  
  if(!titulo) {
    alert('⚠️ Por favor, digite o título do livro primeiro!');
    return;
  }

  btnIA.textContent = '⏳ Consultando catálogos...';
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
    btnIA.textContent = '🔎 Buscar dados verificados';
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
    try {
      await fetch(`/api/livros/${id}`, { method: 'DELETE' });
      carregarLivros();
    } catch(erro) {
      alert('Erro ao excluir o livro.');
    }
  }
};

// 5. EDITAR LIVRO
window.editarLivro = async (id) => {
  try {
    const res = await fetch('/api/livros');
    const livros = await res.json();
    const livro = livros.find(l => l.id === id);
    
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
    console.error(erro);
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

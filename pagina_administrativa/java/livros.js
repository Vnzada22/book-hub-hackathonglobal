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
const btnCancelar = document.getElementById('btnCancelar');

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
        <td>${capaHTML}</td>
        <td><strong>${livro.titulo}</strong></td>
        <td>${livro.autor}</td>
        <td>${livro.genero || '-'}</td>
        <td>
          <button class="btn-editar" onclick="editarLivro(${livro.id})">Editar</button>
          <button class="btn-excluir" onclick="excluirLivro(${livro.id})">Excluir</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (erro) {
    console.error('Erro ao carregar livros:', erro);
  }
}

// 2. A MÁGICA DA INTELIGÊNCIA ARTIFICIAL
btnIA.addEventListener('click', async () => {
  const titulo = inputTitulo.value.trim();
  
  if(!titulo) {
    alert('⚠️ Por favor, digite o título do livro primeiro!');
    return;
  }

  btnIA.textContent = '⏳ Buscando dados e capa...';
  btnIA.disabled = true;

  try {
    const res = await fetch('/api/ia/preencher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo })
    });

    if(res.ok) {
      const dados = await res.json();
      
      inputAutor.value = dados.autor || '';
      inputEditora.value = dados.editora || '';
      inputAno.value = dados.ano_publicacao || '';
      inputGenero.value = dados.genero || '';
      inputPaginas.value = dados.numero_paginas || '';
      
      if (dados.url_capa) {
        inputCapa.value = dados.url_capa;
      }
      
      alert('✨ Concluído! Verifique se os dados estão corretos e clique em "Salvar Livro no Banco".');
    } else {
      alert('Falha ao processar IA. O servidor pode estar desligado ou com problema na Chave de API.');
    }
  } catch (erro) {
    console.error(erro);
    alert('Erro de conexão ao tentar buscar dados com a IA.');
  } finally {
    btnIA.textContent = '✨ Autocompletar IA';
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
    numero_paginas: inputPaginas.value ? parseInt(inputPaginas.value) : null
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
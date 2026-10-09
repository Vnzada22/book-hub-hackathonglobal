<<<<<<< HEAD
﻿const mainContentRows = document.getElementById('mainContentRows');
const searchResultsGrid = document.getElementById('searchResults');
const searchEl = document.getElementById('search');
const connectBtn = document.getElementById('connect');
const filterChipsContainer = document.getElementById('filterChips');
const STORAGE_KEY = 'bookhub_wallet_user';

let books = [];
let minhaListaLivros = [];
let categoriaAtiva = 'todos';

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (erro) {
    console.error('Erro ao carregar usuário:', erro);
    return null;
  }
}

function renderUserState() {
  const profileMenu = document.getElementById('profileMenu');
  const btnLoginFallback = document.getElementById('btnLoginFallback');
  const usuarioAtualNome = document.getElementById('usuarioAtualNome');
  const user = getCurrentUser();

  if (user && (user.username || user.login || user.nome)) {
    const nomeExibicao = user.username || user.login || user.nome;
    if (usuarioAtualNome) usuarioAtualNome.textContent = nomeExibicao;
    
    // ATUALIZA AS IMAGENS DE AVATAR DO TOPO
    const avatarImg = user.avatar || '/img/avatar1.png';
    document.querySelectorAll('.profile-avatar img, .dropdown-header img').forEach(img => {
      img.src = avatarImg;
    });

    if (profileMenu) profileMenu.style.display = 'inline-block';
    if (btnLoginFallback) btnLoginFallback.style.display = 'none';
  } else {
    if (profileMenu) profileMenu.style.display = 'none';
    if (btnLoginFallback) btnLoginFallback.style.display = 'inline-block';
  }
}

function ensureAuthenticated() {
  return getCurrentUser();
}

function fazerLogout(e) {
  e.preventDefault();
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

function irParaPerfil(e) {
  e.preventDefault();
  window.location.href = '/perfil/perfil.html';
}

function getMinhaListaIds() {
  const user = getCurrentUser();
  if (!user) return [];
  const wallet = user.walletAddress || user.wallet_address;
  const raw = localStorage.getItem(`bookhub_lista_${wallet}`);
  return raw ? JSON.parse(raw) : [];
}

function toggleMinhaLista(e, idLivro) {
  e.stopPropagation();
  const user = getCurrentUser();
  if (!user) {
    alert('Faça login para adicionar livros à sua lista.');
    window.location.href = '/login/login.html';
    return;
  }
  
  const wallet = user.walletAddress || user.wallet_address;
  const key = `bookhub_lista_${wallet}`;
  let idsLista = getMinhaListaIds();
  
  if (idsLista.includes(idLivro)) {
    idsLista = idsLista.filter(id => id !== idLivro);
  } else {
    idsLista.push(idLivro);
  }
  
  localStorage.setItem(key, JSON.stringify(idsLista));
  carregarMinhaListaLocal();
}

function carregarMinhaListaLocal() {
  const ids = getMinhaListaIds();
  minhaListaLivros = books.filter(b => ids.includes(b.id));
  
  if (categoriaAtiva === 'todos' && (!searchEl || !searchEl.value)) {
    renderRowsInterface();
  } else {
    aplicarFiltros();
  }
}

function criarCartaoLivro(b) {
  const card = document.createElement('article');
  card.className = 'book-card';

  const idsLista = getMinhaListaIds();
  const isLiked = idsLista.includes(b.id);
  const likeIcon = isLiked ? '❤️' : '🤍';

  const primeiraPalavra = b.titulo ? b.titulo.split(' ')[0] : 'Livro';
  const capaHTML = b.url_capa
    ? `<img src="${b.url_capa}" alt="${b.titulo}" onerror="this.outerHTML='<span style=\'font-size:14px; font-weight:bold; color:#fff;\'>${primeiraPalavra}</span>'">`
    : `<span style="font-size:14px; font-weight:bold; color:#fff;">${primeiraPalavra}</span>`;

  const generoTexto = b.genero ? b.genero : 'Geral';
  const disponivel = b.disponivel !== false;
  const statusBadge = disponivel
    ? '<span class="badge-disponivel">Disponível</span>'
    : '<span class="badge-indisponivel">Indisponível</span>';

  const botaoReserva = disponivel
    ? `<button class="btn-reservar" onclick="fazerPreReserva(${b.id}, '${b.titulo.replace(/'/g, "")}')">Pré-Reservar</button>`
    : '<button class="btn-reservar" disabled style="opacity: 0.5; cursor: not-allowed;">Reservado</button>';

  card.innerHTML = `
    <div class="book-cover">
      ${capaHTML}
      <button class="btn-like ${isLiked ? 'liked' : ''}" onclick="toggleMinhaLista(event, ${b.id})" title="Adicionar à Minha Lista">${likeIcon}</button>
    </div>
    <div class="book-details">
      <div class="book-meta-top">
        <span class="book-genre" title="${generoTexto}">${generoTexto}</span>
        ${statusBadge}
      </div>
      <h4 class="book-title" title="${b.titulo}">${b.titulo}</h4>
      <p class="book-author" title="${b.autor}">${b.autor}</p>
      ${botaoReserva}
    </div>
  `;
  return card;
}

function criarCarrossel(titulo, listaLivros) {
  const rowDiv = document.createElement('div');
  rowDiv.className = 'netflix-row';

  const rowTitle = document.createElement('h3');
  rowTitle.className = 'row-title';
  rowTitle.textContent = titulo;

  const rowContainer = document.createElement('div');
  rowContainer.className = 'row-container';

  const btnPrev = document.createElement('button');
  btnPrev.className = 'slider-btn prev';
  btnPrev.innerHTML = '‹';

  const rowSliders = document.createElement('div');
  rowSliders.className = 'row-sliders';

  listaLivros.forEach(b => {
    rowSliders.appendChild(criarCartaoLivro(b));
  });

  const btnNext = document.createElement('button');
  btnNext.className = 'slider-btn next';
  btnNext.innerHTML = '›';

  btnPrev.addEventListener('click', () => {
    rowSliders.scrollBy({ left: -window.innerWidth / 1.5, behavior: 'smooth' });
  });
  btnNext.addEventListener('click', () => {
    rowSliders.scrollBy({ left: window.innerWidth / 1.5, behavior: 'smooth' });
  });

  rowContainer.appendChild(btnPrev);
  rowContainer.appendChild(rowSliders);
  rowContainer.appendChild(btnNext);

  rowDiv.appendChild(rowTitle);
  rowDiv.appendChild(rowContainer);

  return rowDiv;
}

function renderRowsInterface() {
  if (!mainContentRows) return;
  mainContentRows.innerHTML = '';
  mainContentRows.style.display = 'block';
  if (searchResultsGrid) searchResultsGrid.style.display = 'none';

  if (books.length === 0) {
    mainContentRows.innerHTML = '<p style="color: #737373; padding: 0 4%;">Nenhum título cadastrado.</p>';
    return;
  }

  if (minhaListaLivros.length > 0) {
    mainContentRows.appendChild(criarCarrossel('Minha Lista', minhaListaLivros));
  }

  const recentes = [...books].slice(0, 15);
  mainContentRows.appendChild(criarCarrossel('Descubra suas próximas histórias', recentes));

  const generos = [...new Set(books.map(b => b.genero).filter(Boolean))];
  generos.forEach(genero => {
    const livrosDaCategoria = books.filter(b => b.genero === genero);
    if (livrosDaCategoria.length >= 2) {
      mainContentRows.appendChild(criarCarrossel(`Nostalgia ${genero}`, livrosDaCategoria));
    }
  });
}

function renderGridInterface(lista) {
  if (!searchResultsGrid) return;
  mainContentRows.style.display = 'none';
  searchResultsGrid.style.display = 'grid';
  searchResultsGrid.innerHTML = '';

  if (lista.length === 0) {
    searchResultsGrid.innerHTML = '<p style="color: #737373;">Nenhum título encontrado.</p>';
    return;
  }

  lista.forEach(b => searchResultsGrid.appendChild(criarCartaoLivro(b)));
}

async function fazerPreReserva(idLivro, tituloLivro) {
  const usuario = ensureAuthenticated();
  if (!usuario || (!usuario.walletAddress && !usuario.wallet_address)) {
    window.location.href = '/login/login.html';
    return;
  }

  const identificador = usuario.walletAddress || usuario.wallet_address;
=======
const booksEl = document.getElementById('books');
const searchEl = document.getElementById('search');
const connectBtn = document.getElementById('connect');
const filterChipsContainer = document.getElementById('filterChips');

let books = [];
let categoriaAtiva = 'todos';

// 1. RENDERIZAR LIVROS NA VITRINE
function renderBooks(list){
  if (!booksEl) return;
  booksEl.innerHTML = '';
  
  if(list.length === 0){
    booksEl.innerHTML = '<p style="color: var(--net-gray);">Nenhum título encontrado.</p>';
    return;
  }

  list.forEach(b => {
    const card = document.createElement('article');
    card.className = 'book-card';
    
    const primeiraPalavra = b.titulo ? b.titulo.split(' ')[0] : 'Livro';
    const capaHTML = b.url_capa 
      ? `<img src="${b.url_capa}" alt="${b.titulo}" onerror="this.outerHTML='<span style=\\'font-size:14px; font-weight:bold; color:#fff;\\'>${primeiraPalavra}</span>'">` 
      : `<span style="font-size:14px; font-weight:bold; color:#fff;">${primeiraPalavra}</span>`;

    const generoTexto = b.genero ? b.genero : 'Geral';
    
    // Verifica disponibilidade do livro
    const disponivel = b.disponivel !== false; 
    const statusBadge = disponivel 
      ? `<span class="badge-disponivel">Disponível</span>` 
      : `<span class="badge-indisponivel">Indisponível</span>`;
      
    const botaoReserva = disponivel 
      ? `<button class="btn-reservar" onclick="fazerPreReserva(${b.id}, '${b.titulo.replace(/'/g, "")}')">Pré-Reservar</button>`
      : `<button class="btn-reservar" disabled style="opacity: 0.5; cursor: not-allowed;">Reservado</button>`;

    card.innerHTML = `
      <div class="book-cover">${capaHTML}</div>
      <div class="book-details">
        <div class="book-meta-top">
          <span class="book-genre" title="${generoTexto}">${generoTexto}</span>
          ${statusBadge}
        </div>
        <h4 class="book-title">${b.titulo}</h4>
        <p class="book-author">${b.autor}</p>
        ${botaoReserva}
      </div>
    `;
    booksEl.appendChild(card);
  });
}

// 2. FUNÇÃO DE PRÉ-RESERVA
async function fazerPreReserva(idLivro, tituloLivro) {
  const nomeAluno = prompt(`Digite seu nome para solicitar a pré-reserva de "${tituloLivro}":`);
  if (!nomeAluno) return;
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee

  try {
    const res = await fetch('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
<<<<<<< HEAD
      body: JSON.stringify({ id_livro: idLivro, login: identificador, usuario_nome: identificador })
    });

    if (res.ok) {
      alert(`✨ Pré-reserva solicitada com sucesso para o livro "${tituloLivro}".`);
      carregarLivros();
=======
      body: JSON.stringify({ id_livro: idLivro, usuario_nome: nomeAluno })
    });

    if (res.ok) {
      alert('✨ Pré-reserva solicitada com sucesso! Aguarde a aprovação da bibliotecária.');
      carregarLivros(); // Atualiza a vitrine
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
    } else {
      alert('Erro ao solicitar pré-reserva.');
    }
  } catch (err) {
    console.error(err);
    alert('Erro de conexão.');
  }
}

<<<<<<< HEAD
function atualizarFiltrosCategorias(listaLivros) {
  const generos = ['todos', ...new Set(listaLivros.map(b => b.genero).filter(Boolean))];

  if (!filterChipsContainer) return;
  filterChipsContainer.innerHTML = '';

=======
// 3. FILTROS DE CATEGORIA
function atualizarFiltrosCategorias(listaLivros) {
  const generos = ['todos', ...new Set(listaLivros.map(b => b.genero).filter(Boolean))];
  
  if (!filterChipsContainer) return;
  filterChipsContainer.innerHTML = '';
  
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
  generos.forEach(genero => {
    const btn = document.createElement('button');
    btn.className = `chip ${genero === categoriaAtiva ? 'active' : ''}`;
    btn.textContent = genero.charAt(0).toUpperCase() + genero.slice(1);
<<<<<<< HEAD

=======
    
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      categoriaAtiva = genero;
      aplicarFiltros();
    });

    filterChipsContainer.appendChild(btn);
  });
}

function aplicarFiltros() {
  const termoBusca = searchEl ? searchEl.value.toLowerCase().trim() : '';

<<<<<<< HEAD
  if (!termoBusca && categoriaAtiva === 'todos') {
    renderRowsInterface();
    return;
  }

  const livrosFiltrados = books.filter(b => {
    const matchCategoria = categoriaAtiva === 'todos' || (b.genero && b.genero.toLowerCase() === categoriaAtiva.toLowerCase());
    const matchBusca = !termoBusca ||
      b.titulo.toLowerCase().includes(termoBusca) ||
      b.autor.toLowerCase().includes(termoBusca) ||
=======
  const livrosFiltrados = books.filter(b => {
    const matchCategoria = categoriaAtiva === 'todos' || (b.genero && b.genero.toLowerCase() === categoriaAtiva.toLowerCase());
    const matchBusca = !termoBusca || 
      b.titulo.toLowerCase().includes(termoBusca) || 
      b.autor.toLowerCase().includes(termoBusca) || 
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
      (b.genero && b.genero.toLowerCase().includes(termoBusca));

    return matchCategoria && matchBusca;
  });

<<<<<<< HEAD
  renderGridInterface(livrosFiltrados);
}

searchEl && searchEl.addEventListener('input', aplicarFiltros);

if (connectBtn) {
  connectBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      window.location.href = '/login/login.html';
      return;
    }

    const identificador = user.walletAddress || user.wallet_address;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: identificador })
      });
      const data = await res.json();
      const tipoAtual = data.usuario ? data.usuario.tipo : user.tipo;

      if (tipoAtual !== 'admin' && tipoAtual !== 'professor') {
        alert('Acesso restrito: apenas administradores ou professores podem entrar no painel.');
        return;
      }
      window.location.href = '/admin/livros.html';
    } catch (e) {
      if (user.tipo !== 'admin' && user.tipo !== 'professor') {
        alert('Acesso restrito: apenas administradores ou professores podem entrar no painel.');
        return;
      }
      window.location.href = '/admin/livros.html';
    }
  });
}

async function carregarLivros() {
  try {
    const resposta = await fetch('/api/livros');
    books = await resposta.json();
    
    carregarMinhaListaLocal();
    atualizarFiltrosCategorias(books);
  } catch (erro) {
    if (mainContentRows) {
      mainContentRows.innerHTML = '<p style="color: #737373; padding: 0 4%;">Não foi possível carregar os livros do servidor.</p>';
=======
  renderBooks(livrosFiltrados);
}

// 4. EVENTOS DE PESQUISA E BOTÃO ADMIN
searchEl && searchEl.addEventListener('input', () => {
  aplicarFiltros();
});

if (connectBtn) {
  connectBtn.addEventListener('click', () => {
    window.location.href = '/admin/livros.html';
  });
}

// 5. CARREGAR LIVROS DO SERVIDOR
async function carregarLivros(){
  try {
    const resposta = await fetch('/api/livros');
    books = await resposta.json();
    atualizarFiltrosCategorias(books);
    renderBooks(books);
  } catch (erro) {
    if (booksEl) {
      booksEl.innerHTML = '<p style="color: var(--net-gray);">Não foi possível carregar os livros do servidor.</p>';
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
    }
    console.error('Erro ao carregar livros:', erro);
  }
}

<<<<<<< HEAD
renderUserState();
=======
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
carregarLivros();
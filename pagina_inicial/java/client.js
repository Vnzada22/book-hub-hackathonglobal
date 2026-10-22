const mainContentRows = document.getElementById('mainContentRows');
const searchResultsGrid = document.getElementById('searchResults');
const searchEl = document.getElementById('search');
const connectBtn = document.getElementById('connect');
const filterChipsContainer = document.getElementById('filterChips');
const STORAGE_KEY = 'bookhub_wallet_user';

let books = [];
let minhaListaLivros = [];
let categoriaAtiva = 'todos';
let activeBookFocus = null;
let bookFocusCloseTimer = null;

function posicionarResumoEmFoco(card, resumo) {
  const margem = 16;
  const intervalo = 18;
  const larguraTela = window.innerWidth;
  const alturaTela = window.innerHeight;
  const compacto = larguraTela < 760;
  const larguraPainel = Math.min(compacto ? 420 : 360, larguraTela - margem * 2);
  const cardRect = card.getBoundingClientRect();

  resumo.classList.toggle('book-summary-floating--stacked', compacto);
  resumo.style.width = `${larguraPainel}px`;
  resumo.style.visibility = 'hidden';

  const alturaPainel = resumo.offsetHeight;
  let left;
  let top;

  if (compacto) {
    left = cardRect.left + (cardRect.width - larguraPainel) / 2;
    left = Math.max(margem, Math.min(left, larguraTela - larguraPainel - margem));
    top = cardRect.bottom + intervalo;
    if (top + alturaPainel > alturaTela - margem) {
      top = Math.max(margem, cardRect.top - alturaPainel - intervalo);
    }
  } else {
    const espacoDireita = larguraTela - cardRect.right - intervalo - margem;
    const espacoEsquerda = cardRect.left - intervalo - margem;

    if (espacoDireita >= Math.min(larguraPainel, 300)) {
      left = cardRect.right + intervalo;
    } else if (espacoEsquerda >= larguraPainel) {
      left = cardRect.left - larguraPainel - intervalo;
    } else if (espacoDireita >= espacoEsquerda) {
      left = cardRect.right + intervalo;
    } else {
      left = cardRect.left - larguraPainel - intervalo;
    }

    left = Math.max(margem, Math.min(left, larguraTela - larguraPainel - margem));
    top = Math.max(margem, Math.min(cardRect.top, alturaTela - alturaPainel - margem));
  }

  resumo.style.left = `${left}px`;
  resumo.style.top = `${top}px`;
  resumo.style.visibility = '';
}

function fecharResumoEmFoco() {
  if (bookFocusCloseTimer) {
    clearTimeout(bookFocusCloseTimer);
    bookFocusCloseTimer = null;
  }
  if (!activeBookFocus) return;

  const foco = activeBookFocus;
  activeBookFocus = null;
  window.removeEventListener('resize', foco.reposicionar);
  window.removeEventListener('scroll', foco.reposicionar, true);
  foco.card.classList.remove('is-book-focused');
  document.body.classList.remove('book-focus-active');
  foco.backdrop.remove();
  foco.resumo.classList.remove('book-summary-floating', 'book-summary-floating--stacked');
  foco.resumo.style.removeProperty('width');
  foco.resumo.style.removeProperty('left');
  foco.resumo.style.removeProperty('top');
  foco.resumo.style.removeProperty('visibility');
  foco.parent.insertBefore(foco.resumo, foco.proximoIrmao && foco.proximoIrmao.parentNode === foco.parent ? foco.proximoIrmao : null);
}

function abrirResumoEmFoco(card, resumo) {
  if (activeBookFocus && activeBookFocus.card === card) {
    posicionarResumoEmFoco(card, resumo);
    return;
  }
  fecharResumoEmFoco();

  const parent = resumo.parentNode;
  const proximoIrmao = resumo.nextSibling;
  const backdrop = document.createElement('div');
  backdrop.className = 'book-focus-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.addEventListener('click', fecharResumoEmFoco);

  const foco = {
    card,
    resumo,
    parent,
    proximoIrmao,
    backdrop,
    reposicionar: () => posicionarResumoEmFoco(card, resumo)
  };
  activeBookFocus = foco;

  document.body.classList.add('book-focus-active');
  document.body.appendChild(backdrop);
  card.classList.add('is-book-focused');
  resumo.classList.add('book-summary-floating');
  document.body.appendChild(resumo);
  foco.reposicionar();

  resumo.addEventListener('pointerenter', cancelarFechamentoResumo);
  window.addEventListener('resize', foco.reposicionar);
  window.addEventListener('scroll', foco.reposicionar, true);
}

function cancelarFechamentoResumo() {
  if (!bookFocusCloseTimer) return;
  clearTimeout(bookFocusCloseTimer);
  bookFocusCloseTimer = null;
}

function agendarFechamentoResumo() {
  cancelarFechamentoResumo();
  bookFocusCloseTimer = setTimeout(fecharResumoEmFoco, 450);
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeBookFocus) fecharResumoEmFoco();
});

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
  card.tabIndex = 0;

  const idsLista = getMinhaListaIds();
  const isLiked = idsLista.includes(b.id);
  const likeIcon = isLiked ? '❤️' : '🤍';

  const primeiraPalavra = b.titulo ? b.titulo.split(' ')[0] : 'Livro';
  const capaHTML = b.url_capa
    ? `<img src="${b.url_capa}" alt="${b.titulo}" onerror="this.outerHTML='<span style=\'font-size:14px; font-weight:bold; color:#fff;\'>${primeiraPalavra}</span>'">`
    : `<span style="font-size:14px; font-weight:bold; color:#fff;">${primeiraPalavra}</span>`;

  const generoTexto = obterGeneroLivro(b);
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

  const resumo = document.createElement('div');
  resumo.className = 'book-summary';
  resumo.setAttribute('role', 'note');
  resumo.setAttribute('aria-label', `Resumo de ${b.titulo || 'livro'}`);

  const tituloResumo = document.createElement('span');
  tituloResumo.className = 'book-summary-heading';
  tituloResumo.textContent = 'Sobre este livro';

  const textoResumo = document.createElement('p');
  textoResumo.className = 'book-summary-text';
  textoResumo.textContent = String(b.resumo || b.descricao || '').trim() || 'Resumo ainda não disponível.';

  resumo.append(tituloResumo, textoResumo);
  card.querySelector('.book-details').appendChild(resumo);

  card.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      cancelarFechamentoResumo();
      abrirResumoEmFoco(card, resumo);
    }
  });
  card.addEventListener('pointerleave', event => {
    if (!resumo.contains(event.relatedTarget)) agendarFechamentoResumo();
  });
  card.addEventListener('focusin', () => {
    cancelarFechamentoResumo();
    abrirResumoEmFoco(card, resumo);
  });
  card.addEventListener('focusout', event => {
    if (!card.contains(event.relatedTarget)) agendarFechamentoResumo();
  });
  card.addEventListener('click', event => {
    if (event.target.closest('button, a') || !window.matchMedia('(hover: none)').matches) return;
    if (!activeBookFocus || activeBookFocus.card !== card) abrirResumoEmFoco(card, resumo);
  });
  resumo.addEventListener('pointerleave', agendarFechamentoResumo);
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

  requestAnimationFrame(() => {
    const temMaisConteudo = rowSliders.scrollWidth > rowSliders.clientWidth + 1;
    btnPrev.hidden = !temMaisConteudo;
    btnNext.hidden = !temMaisConteudo;
  });

  return rowDiv;
}

function obterGeneroLivro(livro) {
  const genero = typeof livro.genero === 'string' ? livro.genero.trim() : '';
  return genero || 'Geral';
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

  const generos = [...new Map(books.map(livro => {
    const genero = obterGeneroLivro(livro);
    return [genero.toLocaleLowerCase('pt-BR'), genero];
  })).values()];

  generos.forEach(genero => {
    const livrosDaCategoria = books.filter(livro => obterGeneroLivro(livro).toLocaleLowerCase('pt-BR') === genero.toLocaleLowerCase('pt-BR'));
    if (livrosDaCategoria.length > 0) mainContentRows.appendChild(criarCarrossel(genero, livrosDaCategoria));
  });
}

function renderCategoryInterface(lista, genero) {
  if (!mainContentRows) return;
  mainContentRows.innerHTML = '';
  mainContentRows.style.display = 'block';
  if (searchResultsGrid) searchResultsGrid.style.display = 'none';

  if (lista.length === 0) {
    const mensagem = document.createElement('p');
    mensagem.className = 'catalog-empty-state';
    mensagem.textContent = `Nenhum livro encontrado em ${genero}.`;
    mainContentRows.appendChild(mensagem);
    return;
  }

  mainContentRows.appendChild(criarCarrossel(genero, lista));
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

  try {
    const res = await fetch('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_livro: idLivro, login: identificador, usuario_nome: identificador })
    });

    if (res.ok) {
      alert(`✨ Pré-reserva solicitada com sucesso para o livro "${tituloLivro}".`);
      carregarLivros();
    } else {
      alert('Erro ao solicitar pré-reserva.');
    }
  } catch (err) {
    console.error(err);
    alert('Erro de conexão.');
  }
}

function atualizarFiltrosCategorias(listaLivros) {
  const generosUnicos = [...new Map(listaLivros.map(livro => {
    const genero = obterGeneroLivro(livro);
    return [genero.toLocaleLowerCase('pt-BR'), genero];
  })).values()];
  const generos = ['todos', ...generosUnicos];

  if (!filterChipsContainer) return;
  filterChipsContainer.innerHTML = '';

  generos.forEach(genero => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip ${genero === categoriaAtiva ? 'active' : ''}`;
    btn.textContent = genero.charAt(0).toUpperCase() + genero.slice(1);
    btn.setAttribute('aria-pressed', String(genero === categoriaAtiva));

    btn.addEventListener('click', () => {
      filterChipsContainer.querySelectorAll('.chip').forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      categoriaAtiva = genero;
      aplicarFiltros();
    });

    filterChipsContainer.appendChild(btn);
  });
}

function aplicarFiltros() {
  const termoBusca = searchEl ? searchEl.value.toLowerCase().trim() : '';

  if (!termoBusca && categoriaAtiva === 'todos') {
    renderRowsInterface();
    return;
  }

  const livrosFiltrados = books.filter(b => {
    const matchCategoria = categoriaAtiva === 'todos' || obterGeneroLivro(b).toLowerCase() === categoriaAtiva.toLowerCase();
    const matchBusca = !termoBusca ||
      b.titulo.toLowerCase().includes(termoBusca) ||
      b.autor.toLowerCase().includes(termoBusca) ||
      (b.genero && b.genero.toLowerCase().includes(termoBusca));

    return matchCategoria && matchBusca;
  });

  if (!termoBusca && categoriaAtiva !== 'todos') {
    renderCategoryInterface(livrosFiltrados, categoriaAtiva);
    return;
  }

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
    }
    console.error('Erro ao carregar livros:', erro);
  }
}

renderUserState();
carregarLivros();

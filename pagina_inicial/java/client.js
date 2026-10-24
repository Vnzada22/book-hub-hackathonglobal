const mainContentRows = document.getElementById('mainContentRows');
const searchResultsGrid = document.getElementById('searchResults');
const searchEl = document.getElementById('search');
const categoriesSection = document.getElementById('categoriesSection');
const connectBtn = document.getElementById('connect');
const filterChipsContainer = document.getElementById('filterChips');
const STORAGE_KEY = 'bookhub_wallet_user';
const BOOKS_CACHE_KEY = 'bookhub_catalog_cache';

let books = [];
let minhaListaLivros = [];
let categoriaAtiva = 'todos';
let activeBookFocus = null;

const heroSection = document.querySelector('.netflix-hero');
const heroArt = heroSection?.querySelector('.hero-art');
const heroPointerEnabled = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (heroSection && heroArt && heroPointerEnabled) {
  let pointerFrame = null;
  let pendingPointer = null;
  const clampPointer = value => Math.max(-1, Math.min(1, value));

  const resetHeroPointer = () => {
    if (pointerFrame !== null) {
      cancelAnimationFrame(pointerFrame);
      pointerFrame = null;
    }
    pendingPointer = null;
    heroSection.classList.remove('is-book-focused');
    heroArt.style.setProperty('--arc-offset-x', '0px');
    heroArt.style.setProperty('--arc-offset-y', '0px');
    heroArt.style.setProperty('--glow-offset-x', '0px');
    heroArt.style.setProperty('--glow-offset-y', '0px');
  };

  heroSection.addEventListener('mousemove', event => {
    pendingPointer = {
      arcX: `${-clampPointer((event.clientX / window.innerWidth - 0.5) * 2) * 15}px`,
      arcY: `${-clampPointer((event.clientY / window.innerHeight - 0.5) * 2) * 15}px`,
      glowX: `${-clampPointer((event.clientX / window.innerWidth - 0.5) * 2) * 5}px`,
      glowY: `${-clampPointer((event.clientY / window.innerHeight - 0.5) * 2) * 5}px`
    };
    if (pointerFrame !== null) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = null;
      if (!pendingPointer) return;

      heroArt.style.setProperty('--arc-offset-x', pendingPointer.arcX);
      heroArt.style.setProperty('--arc-offset-y', pendingPointer.arcY);
      heroArt.style.setProperty('--glow-offset-x', pendingPointer.glowX);
      heroArt.style.setProperty('--glow-offset-y', pendingPointer.glowY);
    });
  });

  heroSection.addEventListener('mouseleave', resetHeroPointer);
  heroArt.addEventListener('mouseover', event => {
    if (event.target.closest('.hero-book')) {
      heroSection.classList.add('is-book-focused');
    }
  });
  heroArt.addEventListener('mouseout', event => {
    if (!event.target.closest('.hero-book')) return;
    if (!event.relatedTarget?.closest?.('.hero-book')) {
      heroSection.classList.remove('is-book-focused');
    }
  });
}

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

  window.addEventListener('resize', foco.reposicionar);
  window.addEventListener('scroll', foco.reposicionar, true);
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
  const profileTrigger = profileMenu?.querySelector('.profile-avatar');
  const btnLoginFallback = document.getElementById('btnLoginFallback');
  const usuarioAtualNome = document.getElementById('usuarioAtualNome');
  const user = getCurrentUser();

  if (profileTrigger && !profileTrigger.dataset.menuReady) {
    const toggleProfileMenu = () => {
      const isOpen = profileMenu.classList.toggle('is-open');
      profileTrigger.setAttribute('aria-expanded', String(isOpen));
    };
    profileTrigger.addEventListener('click', toggleProfileMenu);
    profileTrigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleProfileMenu();
      }
    });
    document.addEventListener('click', event => {
      if (!profileMenu.contains(event.target)) {
        profileMenu.classList.remove('is-open');
        profileTrigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        profileMenu.classList.remove('is-open');
        profileTrigger.setAttribute('aria-expanded', 'false');
      }
    });
    profileTrigger.dataset.menuReady = 'true';
  }

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

async function fazerLogout(e) {
  e.preventDefault();
  try {
    const resposta = await fetch('/api/auth/logout', { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível encerrar a sessão.');
  } catch (erro) {
    console.error('Erro ao encerrar sessão:', erro);
    alert(erro.message || 'Não foi possível encerrar a sessão no servidor.');
    return;
  }
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
  const wallet = user.walletAddress || user.wallet_address || user.login || user.email;
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
  
  const wallet = user.walletAddress || user.wallet_address || user.login || user.email;
  const key = `bookhub_lista_${wallet}`;
  let idsLista = getMinhaListaIds();
  
  if (idsLista.includes(idLivro)) {
    idsLista = idsLista.filter(id => id !== idLivro);
  } else {
    idsLista.push(idLivro);
  }
  
  localStorage.setItem(key, JSON.stringify(idsLista));
  const activeCard = activeBookFocus?.card;
  const reopenSummary = activeCard?.dataset.bookId === String(idLivro);
  if (activeBookFocus) fecharResumoEmFoco();
  carregarMinhaListaLocal();
  if (reopenSummary) {
    requestAnimationFrame(() => {
      const refreshedCard = [...document.querySelectorAll('.book-card')]
        .find(card => card.dataset.bookId === String(idLivro));
      const refreshedSummary = refreshedCard?.querySelector('.book-summary');
      if (refreshedCard && refreshedSummary) abrirResumoEmFoco(refreshedCard, refreshedSummary);
    });
  }
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

function escaparHTML(valor) {
  return String(valor).replace(/[&<>"']/g, caractere => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[caractere]);
}

function obterTituloLivro(livro) {
  const candidatos = [
    livro.titulo,
    livro.titulo_original,
    livro.original_title,
    livro.titulo_catalogo,
    livro.title
  ];
  const titulo = candidatos
    .map(valor => String(valor || '').trim())
    .find(valor => valor && !/^(?:t[ií]tulo desconhecido|unknown title|livro sem t[ií]tulo)$/i.test(valor));
  return titulo || 'Obra sem título';
}

function formatarTituloLivro(valor) {
  const titulo = String(valor || '').trim();
  const palavrasMinusculas = new Set(['a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'das', 'do', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com']);
  const palavras = [...titulo.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’.-]*/gu)];

  return titulo.replace(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’.-]*/gu, (palavra, indice) => {
    const minuscula = palavra.toLocaleLowerCase('pt-BR');
    const primeiraOuUltima = indice === palavras[0]?.index || indice === palavras[palavras.length - 1]?.index;
    if (/^(?=[ivxlcdm]+$)[ivxlcdm]+$/i.test(palavra)) return palavra.toUpperCase();
    if (!primeiraOuUltima && palavrasMinusculas.has(minuscula)) return minuscula;
    return minuscula.replace(/(^|[-:])([\p{L}])/gu, (_, separador, letra) => separador + letra.toLocaleUpperCase('pt-BR'));
  });
}

function normalizarCategoria(valor) {
  const genero = String(valor || '').trim();
  if (!genero) return '';
  const chave = genero.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  if (/^(general|geral|unknown|uncategorized|uncategorised|not specified|sem categoria)$/.test(chave)) return '';
  const categorias = [
    [/school|escolar|school stories/, 'Escolar'],
    [/fantas|fantasy/, 'Fantasia'],
    [/adventure|aventura|shounen|shōnen/, 'Aventura'],
    [/romance|romant/, 'Romance'],
    [/science fiction|ficcao cientifica|sci-fi/, 'Ficção científica'],
    [/mystery|misterio|crime|detective/, 'Mistério'],
    [/horror|terror|halloween/, 'Terror'],
    [/history|historia|historical/, 'História'],
    [/biograph|autobiograph|biograf/, 'Biografia'],
    [/poetry|poesia/, 'Poesia'],
    [/drama/, 'Drama'],
    [/manga|comic|graphic novel/, 'Quadrinhos'],
    [/children|infantil|juvenile|young adult/, 'Infantil'],
    [/fiction|ficcao/, 'Ficção']
  ];
  return categorias.find(([padrao]) => padrao.test(chave))?.[1] || '';
}

function obterGenerosLivro(livro) {
  const genero = String(livro.genero || '').trim();
  if (!genero) return [];
  const categorias = genero.split(/[,;|/]+/).map(normalizarCategoria);
  const unicas = [...new Set(categorias.filter(Boolean))];
  const especificas = unicas.filter(categoria => categoria !== 'Ficção');
  return especificas.length ? especificas : unicas;
}

function criarCartaoLivro(b) {
  const card = document.createElement('article');
  card.className = 'book-card';
  card.tabIndex = 0;
  card.dataset.bookId = String(b.id);
  const tituloLivro = formatarTituloLivro(obterTituloLivro(b));
  const autorLivro = String(b.autor || 'Autor desconhecido').trim();

  const idsLista = getMinhaListaIds();
  const isLiked = idsLista.includes(b.id);
  const likeIcon = isLiked
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>';

  const primeiraPalavra = tituloLivro.split(/\s+/)[0] || 'Livro';
  const generos = obterGenerosLivro(b);
  const generoTexto = generos[0] || '';
  const disponivel = b.disponivel !== false;
  const statusBadge = disponivel
    ? '<div class="book-status badge-disponivel"><span class="book-status-dot" aria-hidden="true"></span>Disponível</div>'
    : '<div class="book-status badge-indisponivel"><span class="book-status-dot" aria-hidden="true"></span>Indisponível</div>';
  const capaHTML = b.url_capa
    ? `<img class="book-cover-image" src="${escaparHTML(b.url_capa)}" alt="Capa de ${escaparHTML(tituloLivro)}">`
    : `<span class="book-cover-fallback">${escaparHTML(primeiraPalavra)}</span>`;

  card.innerHTML = `
    <div class="book-cover">
      ${capaHTML}
      ${statusBadge}
    </div>
    <div class="book-details">
      ${generoTexto ? `<span class="book-genre" title="${escaparHTML(generoTexto)}">${escaparHTML(generoTexto)}</span>` : ''}
      <h4 class="book-title" title="${escaparHTML(tituloLivro)}">${escaparHTML(tituloLivro)}</h4>
      <p class="book-author" title="${escaparHTML(autorLivro)}">${escaparHTML(autorLivro)}</p>
    </div>
  `;

  const capa = card.querySelector('.book-cover-image');
  if (capa) {
    capa.loading = 'lazy';
    capa.decoding = 'async';
    capa.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'book-cover-fallback';
      fallback.textContent = primeiraPalavra;
      capa.replaceWith(fallback);
    }, { once: true });
  }

  const resumo = document.createElement('div');
  resumo.className = 'book-summary';
  resumo.setAttribute('role', 'region');
  resumo.setAttribute('aria-label', `Detalhes de ${tituloLivro}`);

  const tituloResumo = document.createElement('span');
  tituloResumo.className = 'book-summary-heading';
  tituloResumo.textContent = 'Detalhes do livro';

  const botaoFechar = document.createElement('button');
  botaoFechar.type = 'button';
  botaoFechar.className = 'book-summary-close';
  botaoFechar.setAttribute('aria-label', 'Fechar detalhes do livro');
  botaoFechar.textContent = '×';
  botaoFechar.addEventListener('click', fecharResumoEmFoco);

  const tituloDetalhe = document.createElement('h4');
  tituloDetalhe.className = 'book-summary-title';
  tituloDetalhe.textContent = tituloLivro;

  const generosDetalhe = document.createElement('p');
  generosDetalhe.className = 'book-summary-categories';
  generosDetalhe.textContent = generos.length
    ? `Categorias: ${generos.join(', ')}`
    : 'Categoria não informada';

  const textoResumo = document.createElement('p');
  textoResumo.className = 'book-summary-text';
  textoResumo.textContent = String(b.resumo || b.descricao || '').trim() || 'Resumo ainda não disponível.';

  const botaoReserva = document.createElement('button');
  botaoReserva.type = 'button';
  botaoReserva.className = 'btn-reservar';
  botaoReserva.textContent = disponivel ? 'Pré-Reservar' : 'Indisponível';
  botaoReserva.disabled = !disponivel;
  botaoReserva.addEventListener('click', event => {
    event.stopPropagation();
    if (disponivel) fazerPreReserva(b.id, tituloLivro);
  });

  const botaoLista = document.createElement('button');
  botaoLista.type = 'button';
  botaoLista.className = `btn-like ${isLiked ? 'liked' : ''}`;
  botaoLista.title = isLiked ? 'Remover da Minha Lista' : 'Adicionar à Minha Lista';
  botaoLista.setAttribute('aria-label', botaoLista.title);
  botaoLista.setAttribute('aria-pressed', String(isLiked));
  botaoLista.innerHTML = `${likeIcon}<span>${isLiked ? 'Na Minha Lista' : 'Adicionar à Minha Lista'}</span>`;
  botaoLista.addEventListener('click', event => toggleMinhaLista(event, b.id));

  resumo.append(tituloResumo, botaoFechar, tituloDetalhe, generosDetalhe, textoResumo, botaoLista, botaoReserva);
  card.querySelector('.book-details').appendChild(resumo);

  card.addEventListener('click', event => {
    if (event.target.closest('button, a')) return;
    if (activeBookFocus?.card === card) {
      fecharResumoEmFoco();
    } else {
      abrirResumoEmFoco(card, resumo);
    }
  });
  card.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
      event.preventDefault();
      if (activeBookFocus?.card === card) fecharResumoEmFoco();
      else abrirResumoEmFoco(card, resumo);
    }
  });
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
  return obterGenerosLivro(livro)[0] || '';
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
  mainContentRows.appendChild(criarCarrossel('Livros disponíveis para reserva', recentes));

  const generos = [...new Map(books.flatMap(livro =>
    obterGenerosLivro(livro).map(genero => [genero.toLocaleLowerCase('pt-BR'), genero])
  )).values()];

  generos.forEach(genero => {
    const livrosDaCategoria = books.filter(livro =>
      obterGenerosLivro(livro).some(categoria => categoria.toLocaleLowerCase('pt-BR') === genero.toLocaleLowerCase('pt-BR'))
    );
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
  if (!usuario || (!usuario.walletAddress && !usuario.wallet_address && !usuario.login && !usuario.email)) {
    window.location.href = '/login/login.html';
    return;
  }

  const identificador = usuario.walletAddress || usuario.wallet_address || usuario.login || usuario.email;

  try {
    const res = await fetch('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_livro: idLivro })
    });
    const resultado = await res.json();

    if (res.ok) {
      const mensagemPontos = resultado.pontos_ganhos
        ? ' Você ganhou 1 ponto nesta temporada!'
        : ' Você já ganhou o ponto deste livro nesta temporada.';
      alert(`✨ Pré-reserva solicitada com sucesso para o livro "${tituloLivro}".${mensagemPontos}`);
      carregarLivros();
    } else {
      alert(resultado.erro || 'Erro ao solicitar pré-reserva.');
    }
  } catch (err) {
    console.error(err);
    alert('Erro de conexão.');
  }
}

function atualizarFiltrosCategorias(listaLivros) {
  const generosUnicos = [...new Map(listaLivros.flatMap(livro =>
    obterGenerosLivro(livro).map(genero => [genero.toLocaleLowerCase('pt-BR'), genero])
  )).values()];
  const generos = ['todos', ...generosUnicos];

  if (!filterChipsContainer) return;
  filterChipsContainer.innerHTML = '';

  generos.forEach(genero => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip ${genero === categoriaAtiva ? 'active' : ''}`;
    btn.textContent = genero === 'todos' ? 'Todos' : genero;
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

function atualizarVisibilidadeCategorias(visible) {
  if (!categoriesSection || !searchEl) return;
  categoriesSection.hidden = !visible;
  searchEl.setAttribute('aria-expanded', String(visible));
}

function aplicarFiltros() {
  const termoBusca = searchEl ? searchEl.value.toLowerCase().trim() : '';

  if (!termoBusca && categoriaAtiva === 'todos') {
    renderRowsInterface();
    return;
  }

  const livrosFiltrados = books.filter(b => {
    const titulo = obterTituloLivro(b).toLocaleLowerCase('pt-BR');
    const autor = String(b.autor || '').toLocaleLowerCase('pt-BR');
    const genero = String(b.genero || '').toLocaleLowerCase('pt-BR');
    const matchCategoria = categoriaAtiva === 'todos' ||
      obterGenerosLivro(b).some(categoria => categoria.toLocaleLowerCase('pt-BR') === categoriaAtiva.toLocaleLowerCase('pt-BR'));
    const matchBusca = !termoBusca ||
      titulo.toLowerCase().includes(termoBusca) ||
      autor.includes(termoBusca) ||
      genero.includes(termoBusca);

    return matchCategoria && matchBusca;
  });

  if (!termoBusca && categoriaAtiva !== 'todos') {
    renderCategoryInterface(livrosFiltrados, categoriaAtiva);
    return;
  }

  renderGridInterface(livrosFiltrados);
}

if (searchEl) {
  searchEl.addEventListener('focus', () => atualizarVisibilidadeCategorias(true));
  searchEl.addEventListener('input', () => {
    atualizarVisibilidadeCategorias(true);
    aplicarFiltros();
  });

  document.addEventListener('click', event => {
    const clicouNaPesquisa = searchEl.contains(event.target);
    const clicouNasCategorias = categoriesSection?.contains(event.target);
    const filtroEmUso = Boolean(searchEl.value.trim()) || categoriaAtiva !== 'todos';

    if (!clicouNaPesquisa && !clicouNasCategorias && !filtroEmUso) {
      atualizarVisibilidadeCategorias(false);
    }
  });
}

if (connectBtn) {
  connectBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      window.location.href = '/login/login.html';
      return;
    }

    const identificador = user.walletAddress || user.wallet_address || user.login || user.email;
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
  let carregouCache = false;

  try {
    const cache = localStorage.getItem(BOOKS_CACHE_KEY);
    if (cache) {
      const livrosEmCache = JSON.parse(cache);
      if (Array.isArray(livrosEmCache)) {
        books = livrosEmCache;
        carregarMinhaListaLocal();
        atualizarFiltrosCategorias(books);
        carregouCache = true;
      }
    }
  } catch (erro) {
    console.warn('Não foi possível ler o catálogo salvo localmente:', erro);
  }

  if (!carregouCache && mainContentRows) {
    mainContentRows.innerHTML = '<p class="catalog-loading" role="status">Carregando livros...</p>';
  }

  try {
    const resposta = await fetch('/api/livros');
    if (!resposta.ok) throw new Error(`Falha ao carregar catálogo (HTTP ${resposta.status}).`);
    const livrosAtualizados = await resposta.json();
    if (!Array.isArray(livrosAtualizados)) throw new Error('A resposta do catálogo está em formato inválido.');
    books = livrosAtualizados;
    
    carregarMinhaListaLocal();
    atualizarFiltrosCategorias(books);
    try {
      localStorage.setItem(BOOKS_CACHE_KEY, JSON.stringify(books));
    } catch (erro) {
      console.warn('Não foi possível salvar o catálogo localmente:', erro);
    }
  } catch (erro) {
    if (!carregouCache && mainContentRows) {
      mainContentRows.innerHTML = '<p class="catalog-loading" role="status">Não foi possível carregar os livros. Verifique sua conexão e tente novamente.</p>';
    }
    console.error('Erro ao carregar livros:', erro);
  } finally {
    if (mainContentRows) mainContentRows.setAttribute('aria-busy', 'false');
  }
}

renderUserState();
carregarLivros();

'use strict';

/**
 * Consulta bibliográfica em até cinco etapas (sem criar metadados fictícios).
 * Fontes: Google Books e Open Library. A IA, quando configurada, só sugere
 * traduções de títulos e resumo a partir de uma descrição encontrada.
 * A pesquisa pode falhar quando o livro não consta dos catálogos externos.
 */
const {
  normalizarTituloBusca, limparDescricaoLivro, limparAutorCatalogo,
  limparEditoraCatalogo, pontuarCorrespondenciaTitulo, converterIdiomaLivro,
  buscarTitulosAlternativosIA, obterAutorConhecidoDoLivro, traduzirResumoCatalogo,
  pareceTextoPortugues, encurtarResumoCatalogo, gerarResumoRascunho,
  pareceDescricaoDeColetanea, resumoEditorialConhecido, resumoEmPortugues
} = require('./iaUtils');

const CAMPOS = ['autor', 'editora', 'genero', 'ano_publicacao', 'numero_paginas', 'idioma', 'resumo', 'url_capa'];
const MAX_TITULO = 180;
const TIMEOUT = 8000;
const CACHE_TTL = 30 * 60 * 1000;
const cache = new Map();
const generos = {
  'fiction': 'Ficção', 'literature': 'Literatura', 'juvenile fiction': 'Literatura juvenil',
  'children': 'Infantil', 'juvenile literature': 'Literatura juvenil',
  'fairy tales': 'Contos de fadas', 'fairy tale': 'Contos de fadas',
  'fantasy': 'Fantasia', 'science fiction': 'Ficção científica',
  'romance': 'Romance', 'history': 'História', 'horror': 'Terror',
  'poetry': 'Poesia', 'biography': 'Biografia', 'adventure': 'Aventura',
  'classics': 'Clássicos', 'comics': 'Quadrinhos',
  'childrens stories danish': 'Contos infantis', 'children s stories danish': 'Contos infantis',
  'children s stories': 'Contos infantis', 'childrens stories': 'Contos infantis',
  'children s literature': 'Literatura infantil', 'children s fiction': 'Literatura infantil',
  'juvenile fiction': 'Literatura juvenil', 'short stories': 'Contos',
  'folk tales': 'Contos populares', 'folk tales and fairy tales': 'Contos de fadas',
  'fairy tales danish': 'Contos de fadas', 'picture books': 'Livros ilustrados',
  'historical fiction': 'Ficção histórica', 'mystery': 'Mistério',
  'nonfiction': 'Não ficção', 'non fiction': 'Não ficção',
  'young adult': 'Literatura juvenil', 'reference': 'Referência',
  'totalitarianism': 'Totalitarismo', 'spanish language books': 'Livros em espanhol'
};
const autoresClassicos = new Map([
  ['a pequena sereia', 'Hans Christian Andersen'],
  ['the little mermaid', 'Hans Christian Andersen'],
  ['o pequeno principe', 'Antoine de Saint-Exupéry'],
  ['the little prince', 'Antoine de Saint-Exupéry'],
  ['dom quixote', 'Miguel de Cervantes'],
  ['don quixote', 'Miguel de Cervantes'],
  ['cem anos de solidao', 'Gabriel García Márquez'],
  ['one hundred years of solitude', 'Gabriel García Márquez'],
  ['a divina comedia', 'Dante Alighieri'],
  ['the divine comedy', 'Dante Alighieri'],
  ['1984', 'George Orwell']
]);
const titulosClassicos = new Map([
  ['a pequena sereia', ['The Little Mermaid', 'Den lille havfrue']],
  ['o pequeno principe', ['The Little Prince', 'Le Petit Prince']],
  ['dom quixote', ['Don Quixote', 'Don Quijote']],
  ['cem anos de solidao', ['One Hundred Years of Solitude', 'Cien años de soledad']],
  ['a divina comedia', ['The Divine Comedy']],
  ['o senhor dos aneis', ['The Lord of the Rings']],
  ['orgulho e preconceito', ['Pride and Prejudice']],
  ['crime e castigo', ['Crime and Punishment']]
]);

function validoNumero(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function ano(v) { return validoNumero(String(v || '').match(/\b\d{4}\b/)?.[0], 1450, new Date().getFullYear() + 2); }
function paginas(v) { return validoNumero(v, 1, 20000); }
function texto(v) { return String(v ?? '').trim(); }
function generoPT(v) {
  const original = texto(v);
  const normal = normalizarTituloBusca(original);
  if (!normal) return '';
  if (generos[normal]) return generos[normal];
  // Os temas de catálogos podem misturar gênero e origem, como
  // "Children's stories, Danish". O campo da interface é sempre pt-BR.
  if (/\b(fairy tales|contos de fadas)\b/i.test(original)) return 'Contos de fadas';
  if (/\b(children.s stories|children.s literature|children.s books|juvenile stories|childrens stories)\b/i.test(original)) return 'Literatura infantil';
  if (/\b(short stories|short fiction)\b/i.test(original)) return 'Contos';
  const segmentos = original.split(/[,;|/]/).map(v=>normalizarTituloBusca(v)).filter(Boolean);
  for (const seg of segmentos) if (generos[seg]) return generos[seg];
  // Sem tradução segura, exige revisão humana; não mostra inglês no formulário.
  return '';
}

function resumoCatalogoValido(v) {
  const r = limparDescricaoLivro(v);
  return r && !pareceDescricaoDeColetanea(r) ? r : '';
}

function seguroHttps(url) {
  try { const parsed = new URL(texto(url)); return parsed.protocol === 'https:' ? parsed.href : parsed.protocol === 'http:' ? (parsed.protocol = 'https:', parsed.href) : ''; }
  catch { return ''; }
}
function isbnDaConsulta(titulo) {
  const n = texto(titulo).replace(/[-\s]/g, '');
  return /^(?:\d{13}|\d{9}[\dXx])$/.test(n) ? n.toUpperCase() : '';
}
function nomesAutor(obj) { return Array.isArray(obj) ? obj.filter(Boolean).map(texto).join(', ') : texto(obj); }
function pontosCampo(candidato) {
  return ['autor','editora','ano_publicacao','numero_paginas','resumo','url_capa','genero'].reduce((s,k) => s + (candidato[k] ? 1 : 0), 0);
}
function conferirTitulo(consulta, titulo, alternativas, isbn) {
  if (isbn) return 1;
  return Math.max(0, ...[consulta, ...alternativas].map(variacao => pontuarCorrespondenciaTitulo(variacao, titulo)));
}
function concordaAutor(autorEncontrado, autorEsperado) {
  if (!autorEsperado || !autorEncontrado) return true;
  const a = normalizarTituloBusca(autorEncontrado).split(' ');
  const b = normalizarTituloBusca(autorEsperado).split(' ');
  const sobA = a[a.length - 1], sobB = b[b.length - 1];
  return !!sobA && sobA === sobB;
}

function criarServico({ fetchImpl = globalThis.fetch, alternativasImpl = buscarTitulosAlternativosIA, resumoImpl = traduzirResumoCatalogo, key = process.env.GOOGLE_BOOKS_API_KEY || '' } = {}) {
  let googleLimitadoAte = 0;
  let openLibraryProximaChamada = 0;
  async function buscarJson(url, fonte) {
    if (fonte === 'Google Books' && Date.now() < googleLimitadoAte) throw new Error('Google Books temporariamente limitado');
    if (fonte === 'Open Library') {
      // Reduz risco de HTTP 429 da Open Library, especialmente em consultas em lote.
      const espera = Math.max(0, openLibraryProximaChamada - Date.now());
      openLibraryProximaChamada = Math.max(Date.now(), openLibraryProximaChamada) + 350;
      if (espera) await new Promise(r => setTimeout(r, espera));
    }
    const response = await fetchImpl(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'BookHub/1.1 (library-catalog)' },
      signal: AbortSignal.timeout(TIMEOUT)
    });
    if (!response.ok) {
      if (fonte === 'Google Books' && response.status === 429) googleLimitadoAte = Date.now() + 60000;
      throw new Error(`${fonte}: HTTP ${response.status}`);
    }
    return response.json();
  }

  async function google(query, tituloOriginal, alternativas, isbn) {
    const params = new URLSearchParams({q: query, maxResults: '20', printType: 'books', orderBy: 'relevance'});
    if (key) params.set('key', key);
    const dados = await buscarJson(`https://www.googleapis.com/books/v1/volumes?${params}`, 'Google Books');
    return (dados.items || []).map(item => {
      const i = item.volumeInfo || {};
      const tituloCatalogo = [i.title, i.subtitle].filter(Boolean).join(': ');
      const autor = limparAutorCatalogo(nomesAutor(i.authors));
      const score = conferirTitulo(tituloOriginal, tituloCatalogo, alternativas, isbn);
      const capa = i.imageLinks || {};
      return {
        titulo_catalogo: tituloCatalogo, autor, editora: limparEditoraCatalogo(i.publisher),
        genero: generoPT(i.categories?.[0]), ano_publicacao: ano(i.publishedDate),
        numero_paginas: paginas(i.pageCount), idioma: converterIdiomaLivro(i.language),
        resumo: resumoCatalogoValido(i.description),
        idioma_resumo: converterIdiomaLivro(i.language),
        url_capa: seguroHttps(capa.large || capa.medium || capa.thumbnail || capa.smallThumbnail),
        fonte_dados: 'Google Books', url_fonte: seguroHttps(i.infoLink),
        score, isbn: i.industryIdentifiers?.map(x=>x.identifier) || [], edicao: true
      };
    });
  }

  async function openLibrary(query, tituloOriginal, alternativas, isbn, tipo = 'title') {
    if (isbn) {
      const i = await buscarJson(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, 'Open Library');
      let autorEdicao = '';
      const autorKey = i.authors?.[0]?.key;
      if (/^\/authors\/OL\d+A$/.test(autorKey || '')) {
        try {
          const autoria = await buscarJson(`https://openlibrary.org${autorKey}.json`, 'Open Library');
          autorEdicao = limparAutorCatalogo(autoria.name);
        } catch { /* metadados da edição continuam úteis sem este campo */ }
      }
      return [{
        titulo_catalogo: texto(i.title), autor: autorEdicao, editora: limparEditoraCatalogo(i.publishers?.[0]),
        genero: generoPT(i.subjects?.[0]), ano_publicacao: ano(i.publish_date),
        numero_paginas: paginas(i.number_of_pages), idioma: converterIdiomaLivro(i.languages?.[0]?.key?.split('/').pop()),
        resumo: resumoCatalogoValido(i.description), idioma_resumo: '',
        url_capa: i.covers?.[0] ? `https://covers.openlibrary.org/b/id/${i.covers[0]}-L.jpg` : '',
        fonte_dados: 'Open Library', url_fonte: seguroHttps(`https://openlibrary.org${i.key || ''}`),
        score: 1, edicao: true, editionKey: i.key?.split('/').pop()
      }];
    }
    const params = new URLSearchParams({ [tipo]:query, limit:'15',
      fields:'key,title,author_name,cover_i,first_publish_year,edition_key,number_of_pages_median,publisher,language,subject,has_fulltext,isbn'
    });
    const dados = await buscarJson(`https://openlibrary.org/search.json?${params}`, 'Open Library');
    return (dados.docs || []).map(i => {
      const tituloCatalogo = texto(i.title);
      return {
        titulo_catalogo: tituloCatalogo, autor: limparAutorCatalogo(nomesAutor(i.author_name)),
        editora: '', genero: generoPT(i.subject?.[0]), ano_publicacao: null,
        numero_paginas: null, paginas_aproximadas: paginas(i.number_of_pages_median), idioma:'', resumo:'', idioma_resumo:'',
        url_capa: i.cover_i ? `https://covers.openlibrary.org/b/id/${i.cover_i}-L.jpg` : '',
        fonte_dados: 'Open Library', url_fonte: /^\/works\/OL\d+W$/.test(i.key || '') ? `https://openlibrary.org${i.key}` : '',
        score: conferirTitulo(tituloOriginal, tituloCatalogo, alternativas, ''),
        workKey: /^\/works\/OL\d+W$/.test(i.key || '') ? i.key : '',
        editionKey: Array.isArray(i.edition_key) ? i.edition_key[0] : null,
        isbn: Array.isArray(i.isbn) ? i.isbn.slice(0, 5) : [], edicao: false
      };
    });
  }

  async function detalharEdicao(c) {
    if (c.fonte_dados !== 'Open Library' || !/^OL\d+M$/.test(c.editionKey || '')) return c;
    try {
      const e = await buscarJson(`https://openlibrary.org/books/${c.editionKey}.json`, 'Open Library');
      return {
        ...c, editora: limparEditoraCatalogo(e.publishers?.[0]) || c.editora,
        ano_publicacao: ano(e.publish_date) || c.ano_publicacao,
        numero_paginas: paginas(e.number_of_pages) || c.numero_paginas,
        idioma: converterIdiomaLivro(e.languages?.[0]?.key?.split('/').pop()) || c.idioma,
        resumo: resumoCatalogoValido(e.description) || c.resumo,
        url_capa: c.url_capa || (e.covers?.[0] ? `https://covers.openlibrary.org/b/id/${e.covers[0]}-L.jpg` : ''),
        workKey: c.workKey || (/^\/works\/OL\d+W$/.test(e.works?.[0]?.key || '') ? e.works[0].key : ''),
        url_fonte: `https://openlibrary.org/books/${c.editionKey}`,
        edicao: true
      };
    } catch { return c; }
  }

  async function pesquisar(tituloOriginal, { semCache = false } = {}) {
    const titulo = texto(tituloOriginal);
    if (!titulo || titulo.length > MAX_TITULO) throw new RangeError('Informe um título ou ISBN de até 180 caracteres.');
    const cacheKey = normalizarTituloBusca(titulo);
    const item = cache.get(cacheKey);
    if (!semCache && item && item.validoAte > Date.now()) return {...item.dados, cache: true};

    const isbn = isbnDaConsulta(titulo);
    const candidatos = [];
    const tentativas = [];
    const variantes = [];
    const esperado = obterAutorConhecidoDoLivro(titulo) || autoresClassicos.get(normalizarTituloBusca(titulo)) || '';

    async function etapa(rotulo, chamada) {
      try {
        const recebidos = await chamada();
        const validos = (Array.isArray(recebidos) ? recebidos : []).filter(c => c.score >= 0.84 && concordaAutor(c.autor, esperado));
        candidatos.push(...validos);
        tentativas.push({etapa: rotulo, resultado: validos.length ? `${validos.length} correspondência(s)` : 'sem correspondência segura'});
      } catch (e) {
        tentativas.push({etapa: rotulo, resultado: 'fonte indisponível'});
      }
    }

    // Cinco etapas limitadas. A quinta usa variantes conhecidas ou traduzidas pela IA.
    await etapa('1. Google Books — título exato', () => google(isbn ? `isbn:${isbn}` : `intitle:${titulo}`, titulo, variantes, isbn));
    await etapa('2. Open Library — título/ISBN', () => openLibrary(titulo, titulo, variantes, isbn));
    if (!isbn) {
      await etapa('3. Google Books — busca ampliada', () => google(titulo, titulo, variantes, ''));
      await etapa('4. Open Library — busca ampliada', () => openLibrary(titulo, titulo, variantes, '', 'q'));
    }
    const completos = () => candidatos.filter(c=>c.autor && c.editora && c.ano_publicacao && c.numero_paginas && c.url_capa && c.resumo);
    if (!isbn && !completos().length) {
      const locais = titulosClassicos.get(normalizarTituloBusca(titulo)) || [];
      let outros = locais;
      if (!locais.length) {
        try { outros = await alternativasImpl(titulo); } catch { outros = []; }
      }
      variantes.push(...new Set((Array.isArray(outros) ? outros : []).map(texto).filter(v=>v && v.length <= MAX_TITULO && normalizarTituloBusca(v) !== normalizarTituloBusca(titulo))));
      if (variantes.length) {
        await etapa('5. Títulos alternativos (Google Books / Open Library)', async () => {
          const consulta = variantes[0];
          const encontrados = await Promise.allSettled([
            google(`intitle:${consulta}`, titulo, variantes, ''),
            openLibrary(consulta, titulo, variantes, '')
          ]);
          return encontrados.flatMap(r => r.status === 'fulfilled' ? r.value : []);
        });
      } else tentativas.push({etapa:'5. Títulos alternativos', resultado:'sem variante confiável'});
    }
    if (!candidatos.length) {
      const consultas = tentativas.filter(t=>!t.etapa.startsWith('5.'));
      const indisponivel = consultas.length > 0 && consultas.every(t => t.resultado === 'fonte indisponível');
      const resposta = {encontrado:false, indisponivel, titulo,
        erro: indisponivel
          ? 'Os catálogos externos estão temporariamente indisponíveis. Tente novamente mais tarde.'
          : 'Nenhuma correspondência bibliográfica segura encontrada. Confira a grafia ou informe o ISBN.',
        tentativas, campos_ausentes: CAMPOS, fontes:[]};
      cache.set(cacheKey, {dados: resposta, validoAte: Date.now() + 90000});
      return resposta;
    }

    // Prioriza uma edição consistente, em vez de combinar ano/páginas de edições distintas.
    const candidatosOrdenados = candidatos.sort((a,b) => (b.score - a.score) || (pontosCampo(b) - pontosCampo(a)) || (b.fonte_dados === 'Google Books' ? 1 : -1));
    let principal = candidatosOrdenados[0];
    if (!principal.edicao && principal.editionKey) principal = await detalharEdicao(principal);
    // Descrição do trabalho literário é útil mesmo quando a edição não a contém.
    let resumoDaObraPrincipal = false;
    if (!principal.resumo && /^\/works\/OL\d+W$/.test(principal.workKey || '')) {
      try {
        const w = await buscarJson(`https://openlibrary.org${principal.workKey}.json`, 'Open Library');
        principal.resumo = resumoCatalogoValido(w.description);
        resumoDaObraPrincipal = !!principal.resumo;
        principal.idioma_resumo = principal.idioma_resumo || '';
      } catch { /* catálogo pode não fornecer sinopse */ }
    }
    const mesmaObra = candidatosOrdenados.filter(c => c.score >= Math.max(0.84, principal.score - 0.05) && concordaAutor(c.autor, principal.autor || esperado));

    // A sinopse pertence à OBRA, não à edição: pesquisamos registros de obra
    // mesmo que a edição escolhida não possua descrição.
    let resumoObra = '';
    let origemResumoObra = '';
    const obrasConsultaveis = [...new Set([principal, ...mesmaObra]
      .map(c => c.workKey).filter(k => /^\/works\/OL\d+W$/.test(k || '')))].slice(0, 4);
    if (!principal.resumo) {
      for (const workKey of obrasConsultaveis) {
        try {
          const work = await buscarJson(`https://openlibrary.org${workKey}.json`, 'Open Library');
          const descricao = resumoCatalogoValido(work.description);
          if (descricao.length >= 55) {
            resumoObra = descricao;
            origemResumoObra = `https://openlibrary.org${workKey}`;
            break;
          }
        } catch { /* catálogo pode não ter descrição */ }
      }
    }

    // Só sugerimos páginas de OUTRAS edições, sem misturá-las com a edição selecionada.
    const quantidadeSugerida = !principal.numero_paginas
      ? ([principal, ...mesmaObra].find(c=>c.paginas_aproximadas)?.paginas_aproximadas ||
        mesmaObra.find(c=>c !== principal && c.numero_paginas)?.numero_paginas || null)
      : null;
    const sugestaoFonte = quantidadeSugerida
      ? ([principal, ...mesmaObra].find(c=>c.paginas_aproximadas)?.fonte_dados ||
        mesmaObra.find(c=>c.numero_paginas)?.fonte_dados || 'Catálogo')
      : '';

    const camposFonte = {};
    const dados = {titulo, titulo_catalogo: principal.titulo_catalogo};
    const escolhas = [principal, ...mesmaObra.filter(c=>c!==principal)];
    for (const campo of CAMPOS) {
      // Metadados que identificam edição nunca devem vir de outra edição.
      const fontesCampo = ['editora', 'ano_publicacao', 'numero_paginas', 'idioma'].includes(campo)
        ? [principal] : escolhas;
      const fonte = fontesCampo.find(c => c[campo]);
      dados[campo] = fonte ? fonte[campo] : ['ano_publicacao','numero_paginas'].includes(campo) ? null : '';
      if (fonte) camposFonte[campo] = fonte.fonte_dados;
    }
    // Um resumo sobre o ENREDO em português tem prioridade sobre anúncios de edições.
    const resumoPT = escolhas.find(c => c.resumo && resumoEmPortugues(c.resumo));
    if (resumoPT) { dados.resumo = resumoPT.resumo; camposFonte.resumo = resumoPT.fonte_dados; }
    if (resumoDaObraPrincipal && dados.resumo) {
      camposFonte.resumo = 'Open Library — descrição da obra';
      origemResumoObra = `https://openlibrary.org${principal.workKey}`;
    }
    if (!dados.autor && esperado) { dados.autor = esperado; camposFonte.autor = 'referência de autor conhecido (verificar edição)'; }
    let resumoParaRevisao = false;
    let linkResumoExterno = origemResumoObra;
    if (!dados.resumo && resumoObra) {
      dados.resumo = resumoObra;
      camposFonte.resumo = 'Open Library — descrição da obra';
      linkResumoExterno = origemResumoObra;
    }
    let resumoEstrangeiroIgnorado = false;
    // Nunca apresenta em inglês uma descrição importada. A tradução por IA
    // somente é aceita se resultar de fato em texto escrito em pt-BR.
    if (dados.resumo && !resumoEmPortugues(dados.resumo)) {
      const descricaoOriginal = dados.resumo;
      try {
        const traduzido = await resumoImpl(titulo, dados.autor, [{
          texto: descricaoOriginal,
          idioma: principal.idioma_resumo || principal.idioma,
          fonte: camposFonte.resumo || principal.fonte_dados
        }]);
        if (resumoEmPortugues(traduzido)) {
          dados.resumo = traduzido;
          camposFonte.resumo = `${camposFonte.resumo || principal.fonte_dados} — síntese em português (IA)`;
          resumoParaRevisao = true;
        } else {
          dados.resumo = '';
          delete camposFonte.resumo;
          resumoEstrangeiroIgnorado = true;
        }
      } catch {
        dados.resumo = '';
        delete camposFonte.resumo;
        resumoEstrangeiroIgnorado = true;
      }
    }
    if (!dados.resumo) {
      // Busca adicional de um resumo da OBRA, nunca de adaptação cinematográfica.
      // Conferimos autor e tipo de obra para reduzir homônimos.
      try {
        const possiveisTitulos = [...new Set([titulo, principal.titulo_catalogo, ...variantes].filter(Boolean))].slice(0, 3);
        for (const variante of possiveisTitulos) {
          const params = new URLSearchParams({action:'query',format:'json',formatversion:'2',redirects:'1',prop:'extracts',exintro:'1',explaintext:'1',titles:variante});
          const wiki = await buscarJson(`https://pt.wikipedia.org/w/api.php?${params}`, 'Wikipedia');
          const pagina = wiki?.query?.pages?.[0];
          const excerto = limparDescricaoLivro(pagina?.extract).slice(0, 1300);
          const inicio = normalizarTituloBusca(excerto.slice(0, 320));
          const autor = normalizarTituloBusca(dados.autor || esperado);
          const sobrenome = autor.split(' ').filter(Boolean).at(-1);
          const tipoLivro = /\b(conto|livro|romance|obra|narrativa|poema|novela|f[aá]bula|literat)/i.test(inicio);
          const filme = /\b(filme|cinematogr[aá]fic|produ[cç][aã]o da disney)\b/i.test(excerto.slice(0, 150));
          if (!pagina?.missing && excerto.length >= 70 && tipoLivro && !filme && sobrenome && inicio.includes(sobrenome)) {
            dados.resumo = excerto;
            camposFonte.resumo = 'Wikipédia — introdução da obra (revisar e atribuir fonte)';
            linkResumoExterno = `https://pt.wikipedia.org/wiki/${encodeURIComponent(pagina.title.replace(/ /g, '_'))}`;
            resumoParaRevisao = true;
            break;
          }
        }
      } catch { /* fontes podem estar indisponíveis */ }
    }
    // Uma introdução da Wikipédia só será aceita se já estiver em português.
    // Nenhum texto estrangeiro é exibido diretamente na ficha do livro.
    if (dados.resumo && !resumoEmPortugues(dados.resumo)) {
      dados.resumo = '';
      delete camposFonte.resumo;
      resumoEstrangeiroIgnorado = true;
    }
    // Para a obra original de Andersen há uma síntese editorial própria em
    // português, não copiada de coletâneas que apenas mencionam o conto.
    if (!dados.resumo) {
      const original = resumoEditorialConhecido(titulo, dados.autor || esperado);
      if (original) {
        dados.resumo = original;
        camposFonte.resumo = 'Resumo editorial original — revisar antes de publicar';
        resumoParaRevisao = true;
      }
    }
    if (!dados.resumo && (dados.autor || esperado)) {
      // Último recurso OPCIONAL: um rascunho explicitamente rotulado, jamais dado confirmado.
      try {
        const rascunho = await gerarResumoRascunho(titulo, dados.autor || esperado);
        if (rascunho) {
          dados.resumo = rascunho;
          resumoParaRevisao = true;
          camposFonte.resumo = 'Rascunho gerado por IA — não verificado em catálogo';
        }
      } catch { /* mantém o campo vazio */ }
    }
    if (dados.resumo && dados.resumo.length > 900) dados.resumo = encurtarResumoCatalogo(dados.resumo).slice(0, 900);
    // Proteção final para evitar persistência acidental de uma sinopse em inglês.
    if (dados.resumo && !resumoEmPortugues(dados.resumo)) {
      dados.resumo = '';
      delete camposFonte.resumo;
      resumoEstrangeiroIgnorado = true;
    }
    const camposAusentes = CAMPOS.filter(c=>!dados[c]);
    const fontes = [...new Map(mesmaObra.map(c=>[c.fonte_dados, {nome:c.fonte_dados, url:c.url_fonte}])).values()];
    if (linkResumoExterno && !camposFonte.resumo?.startsWith('Resumo editorial') && !fontes.some(f=>f.url===linkResumoExterno)) {
      fontes.push({nome:camposFonte.resumo?.startsWith('Wikipédia') ? 'Wikipédia' : 'Open Library — obra', url:linkResumoExterno});
    }
    const resposta = {encontrado:true, dados_confirmados:!resumoParaRevisao, ...dados,
      campos_ausentes:camposAusentes, campos_fonte:camposFonte,
      resumo_revisao_obrigatoria:resumoParaRevisao,
      paginas_sugeridas: quantidadeSugerida ? {numero:quantidadeSugerida, fonte:sugestaoFonte, aviso:'Quantidade encontrada em outra edição ou média entre edições; confirme no exemplar físico.'} : null,
      fonte_dados:fontes.map(f=>f.nome).join(' + '), fontes, tentativas,
      aviso: (resumoParaRevisao ? 'O resumo é uma sugestão que precisa de revisão e atribuição de fonte. ' : '') +
        (resumoEstrangeiroIgnorado && !dados.resumo ? 'A fonte não tinha uma sinopse confiável em português; o campo ficou vazio. ' : '') +
        'Confira os dados da edição e os direitos de uso da sinopse/capa antes de salvar.'};
    cache.set(cacheKey, {dados: resposta, validoAte: Date.now() + CACHE_TTL});
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return resposta;
  }
  return {pesquisar};
}

const servico = criarServico();
module.exports = { criarServico, pesquisarLivro: servico.pesquisar, isbnDaConsulta };

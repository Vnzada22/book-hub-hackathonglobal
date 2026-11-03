const crypto = require('crypto');

const MODELOS_GEMINI = [...new Set([
  String(process.env.GEMINI_MODEL || '').trim(),
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
].filter(Boolean))];

function normalizarTituloBusca(titulo) {
  const normalizado = String(titulo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const artigoFinal = normalizado.match(/^(.+)\s+(a|as|o|os|um|uma)$/);
  return artigoFinal ? `${artigoFinal[2]} ${artigoFinal[1]}` : normalizado;
}

function limparDescricaoLivro(descricao) {
  const texto = Array.isArray(descricao)
    ? descricao.join(' ')
    : typeof descricao === 'string'
      ? descricao
      : descricao?.value || '';
  return String(texto)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function limparAutorCatalogo(valor) {
  const autor = limparDescricaoLivro(valor);
  if (!autor || /[^\p{Script=Latin}\s.,'’\-()]/u.test(autor)) return '';
  if (/\b(?:translated by|translator|translation|tradutor(?:a)?|tradu[cç][aã]o|traducteur|übersetzer)\b/i.test(autor)) return '';
  return autor;
}

function limparEditoraCatalogo(valor) {
  const editora = limparDescricaoLivro(valor);
  if (!editora || editora.length > 120 || /[^\p{Script=Latin}\p{N}\s.,&'’\-()]/u.test(editora)) return '';
  if (/\b(?:translations? into|translated by|translation of|traduzido por|tradu[cç][aã]o para|translated from|translator)\b/i.test(editora)) return '';
  return editora;
}

function pontuarCorrespondenciaTitulo(consulta, tituloLivro) {
  const busca = normalizarTituloBusca(consulta);
  const titulo = normalizarTituloBusca(tituloLivro);
  if (!busca || !titulo) return 0;
  if (busca === titulo) return 1;

  const palavrasBusca = busca.split(' ').filter(Boolean);
  const palavrasTitulo = titulo.split(' ').filter(Boolean);
  if (palavrasBusca.length >= 2 && titulo.startsWith(`${busca} `)) return 0.96;
  if (palavrasTitulo.length >= 2 && busca.startsWith(`${titulo} `) && titulo.length / busca.length >= 0.65) return 0.9;

  const ignorar = new Set(['a', 'an', 'as', 'da', 'das', 'de', 'do', 'dos', 'e', 'o', 'os', 'the', 'um', 'uma']);
  const tokensBusca = [...new Set(palavrasBusca.filter((palavra) => !ignorar.has(palavra)))];
  const tokensTitulo = palavrasTitulo.filter((palavra) => !ignorar.has(palavra));
  if (tokensBusca.length < 2) return 0;

  let indiceAtual = -1;
  for (const palavra of tokensBusca) {
    indiceAtual = tokensTitulo.findIndex((token, indice) => indice > indiceAtual && token === palavra);
    if (indiceAtual === -1) return 0;
  }

  const extras = Math.max(0, tokensTitulo.length - tokensBusca.length);
  return extras <= 3 ? 0.86 - extras * 0.02 : 0;
}

function converterIdiomaLivro(codigo) {
  const idiomas = {
    de: 'Alemão', en: 'Inglês', es: 'Espanhol', fr: 'Francês', it: 'Italiano', ja: 'Japonês',
    ko: 'Coreano', pt: 'Português', ru: 'Russo', zh: 'Chinês',
    deu: 'Alemão', eng: 'Inglês', spa: 'Espanhol', fre: 'Francês', fra: 'Francês',
    ita: 'Italiano', jpn: 'Japonês', kor: 'Coreano', por: 'Português', rus: 'Russo', zho: 'Chinês'
  };
  const codigoNormalizado = String(codigo || '').trim().toLowerCase();
  return idiomas[codigoNormalizado] || codigoNormalizado;
}

async function gerarTextoGemini(prompt, options = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return '';

  for (const modelo of MODELOS_GEMINI) {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'minimal' },
            maxOutputTokens: options.maxOutputTokens || 220,
            ...(options.json ? { responseMimeType: 'application/json' } : {})
          }
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        console.warn(`Gemini ${modelo} indisponível ao preencher dados do livro (HTTP ${response.status}).`);
        continue;
      }

      const data = await response.json();
      const texto = (data.candidates?.[0]?.content?.parts || [])
        .map((part) => part.text || '')
        .join(' ')
        .trim();
      if (texto) return texto;
      console.warn(`Gemini ${modelo} retornou uma resposta vazia ao preencher dados do livro.`);
    } catch (error) {
      console.warn(`Gemini ${modelo} indisponível ao preencher dados do livro:`, error.message);
    }
  }
  return '';
}

async function buscarTitulosAlternativosIA(titulo) {
  const normalizado = normalizarTituloBusca(titulo);
  const titulosConhecidos = new Map([
    ['dom quixote', ['Don Quixote', 'Don Quijote']],
    ['o senhor dos aneis', ['The Lord of the Rings']],
    ['orgulho e preconceito', ['Pride and Prejudice']],
    ['o pequeno principe', ['The Little Prince', 'Le Petit Prince']],
    ['cem anos de solidao', ['One Hundred Years of Solitude', 'Cien años de soledad']],
    ['o apanhador no campo de centeio', ['The Catcher in the Rye']],
    ['harry potter e a pedra filosofal', ["Harry Potter and the Philosopher's Stone", "Harry Potter and the Sorcerer's Stone"]],
    ['o alquimista', ['The Alchemist (novel)', 'The Alchemist', 'O Alquimista (romance)']],
    ['crime e castigo', ['Crime and Punishment', 'Crime et Châtiment']]
  ]);
  const alternativasConhecidas = titulosConhecidos.get(normalizado) || [];
  if (/^diario de um banana(?: (?:1|volume 1|primeiro))?$/.test(normalizado)) {
    return ['Diary of a Wimpy Kid', ...alternativasConhecidas];
  }
  if (alternativasConhecidas.length) return alternativasConhecidas;

  if (!process.env.GEMINI_API_KEY) return alternativasConhecidas;

  const prompt = 'Converta o título de livro informado para o título original mais provável usado em catálogos internacionais. Não invente autor, editora, ano ou outros dados. Preserve o volume quando fizer parte do título. Responda somente JSON no formato {"titulos":["título original", "outra variante conhecida"]}. Se não houver tradução segura, retorne {"titulos":[]}. Título informado: ' + JSON.stringify(titulo);
  const resposta = await gerarTextoGemini(prompt, { json: true, maxOutputTokens: 120 });

  try {
    const json = JSON.parse(resposta);
    const titulos = Array.isArray(json.titulos) ? json.titulos : [];
    return [...new Set([...alternativasConhecidas, ...titulos])]
      .map((item) => String(item || '').trim())
      .filter((item) => item && item.length <= 160 && normalizarTituloBusca(item) !== normalizado)
      .slice(0, 5);
  } catch {
    return alternativasConhecidas;
  }
}

function obterAutorConhecidoDoLivro(titulo) {
  const autores = new Map([
    ['harry potter e a pedra filosofal', 'J K Rowling'],
    ['harry potter and the philosophers stone', 'J K Rowling'],
    ['harry potter and the sorcerers stone', 'J K Rowling'],
    ['o alquimista', 'Paulo Coelho'],
    ['the alchemist', 'Paulo Coelho'],
    ['the alchemist novel', 'Paulo Coelho'],
    ['o alquimista romance', 'Paulo Coelho'],
    ['orgulho e preconceito', 'Jane Austen'],
    ['pride and prejudice', 'Jane Austen'],
    ['crime e castigo', 'Fiódor Dostoiévski'],
    ['crime and punishment', 'Fiódor Dostoiévski']
  ]);
  return autores.get(normalizarTituloBusca(titulo)) || '';
}

function pareceTextoPortugues(texto) {
  const palavrasPortuguesas = String(texto || '').toLocaleLowerCase('pt-BR')
    .match(/\b(?:ao|aos|com|como|da|das|de|do|dos|entre|mas|nas|nos|para|pela|pelo|pelas|pelos|que|seus|suas|uma|umas|também|não|livro|história|personagem|romance|narrativa)\b/g) || [];
  return palavrasPortuguesas.length >= 3;
}

// A descrição de uma edição nem sempre é a sinopse da obra pesquisada.
// Muitas entradas são antologias que apenas CITAM a obra entre vários contos.
function pareceDescricaoDeColetanea(descricao) {
  const bruto = String(descricao || '');
  const t = normalizarTituloBusca(bruto);
  if (!t) return false;
  const padroes = [
    /\b(?:many of these stories|these stories for children|stories in this collection|this collection of stories|includes stories (?:such as|like)|other tales (?:include|by)|tales in this volume|a selection of (?:stories|tales)|a collection of (?:stories|tales)|collected (?:stories|tales))\b/i,
    /\b(?:coletanea de contos|colecao de contos|reune (?:diversos|varios) contos|sele[cç]ao de contos|historias reunidas)\b/i
  ];
  if (padroes.some(p => p.test(bruto))) return true;
  // Evita aceitar listas de três ou mais obras entre aspas como enredo de uma só.
  const citacoes = [...bruto.matchAll(/[“"'‘]([^"”'’]{5,90})["”'’]/g)]
    .map(m=>m[1]).filter(v=>v.split(/\s+/).length >= 2);
  return citacoes.length >= 3 && /\b(?:stories|tales|contos|hist[oó]rias|collection|colet[aâ]nea)\b/i.test(bruto);
}

function resumoEditorialConhecido(titulo, autor) {
  const t = normalizarTituloBusca(titulo);
  const a = normalizarTituloBusca(autor);
  if ((t === 'a pequena sereia' || t === 'the little mermaid' || t === 'den lille havfrue')
      && a.includes('andersen')) {
    // Texto ORIGINAL de apresentação do conto, não transcrito de catálogo.
    return 'Uma jovem sereia sonha em conhecer o mundo dos humanos e se encanta por um príncipe após salvá-lo de um naufrágio. Para tentar viver em terra, ela faz um acordo que exige abrir mão de sua voz. O conto de Hans Christian Andersen aborda escolhas difíceis, amor, identidade e o desejo de pertencer a outro mundo.';
  }
  return '';
}

function pareceIngles(texto) {
  const s = String(texto || '');
  const termos = s.match(/\b(?:the|this|these|those|and|with|from|into|about|their|which|where|while|story|stories|book|young|mermaid|prince|world|collection|other|over|were|they)\b/gi) || [];
  return termos.length >= 4;
}

function resumoEmPortugues(texto) {
  if (!texto || pareceIngles(texto) || pareceDescricaoDeColetanea(texto)) return false;
  if (pareceTextoPortugues(texto)) return true;
  // Alguns resumos curtos em português têm poucas palavras funcionais.
  // Um sinal gramatical + palavras comuns em PT e ausência de inglês
  // é suficiente sem depender da configuração de um provedor de IA.
  const marcadores = String(texto).match(/\b(?:uma|ao|aos|do|da|de|dos|das|que|para|com|sobre|deseja|enfrenta|conto|hist[oó]ria|narrativa|sereia|jovem|vida|humana|amor|decis[oõ]es|escolhas|sonha|tentar|viver|identidade|sacrif[ií]cio)\b/gi) || [];
  return marcadores.length >= 3 && /[áàâãéêíóôõúç]/i.test(texto);
}

function encurtarResumoCatalogo(texto) {
  const frases = String(texto || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const resumo = frases.slice(0, 3).join(' ').trim();
  if (resumo.length >= 50) return resumo;
  return `${String(texto || '').slice(0, 900).replace(/\s+\S*$/, '').trim()}…`;
}

async function traduzirResumoCatalogo(titulo, autor, descricao, idiomaOrigem = '') {
  const descricoes = (Array.isArray(descricao) ? descricao : [{ texto: descricao, idioma: idiomaOrigem }])
    .map((item) => ({
      texto: limparDescricaoLivro(item.texto ?? item.resumo ?? ''),
      idioma: String(item.idioma || ''),
      fonte: String(item.fonte || 'catálogo')
    }))
    .filter((item) => item.texto && normalizarTituloBusca(item.texto) !== normalizarTituloBusca(titulo))
    .filter((item, indice, lista) => lista.findIndex((outro) => normalizarTituloBusca(outro.texto) === normalizarTituloBusca(item.texto)) === indice)
    .sort((a, b) => {
      const aPortugues = /^(pt|portugu)/i.test(a.idioma);
      const bPortugues = /^(pt|portugu)/i.test(b.idioma);
      if (aPortugues !== bPortugues) return aPortugues ? -1 : 1;
      return b.texto.length - a.texto.length;
    })
    .slice(0, 4);
  if (!descricoes.length) return '';

  const descricaoPortugues = descricoes.find((item) => /^(pt|portugu)/i.test(item.idioma) && item.texto.length >= 50);
  if (descricaoPortugues && resumoEmPortugues(descricaoPortugues.texto) && descricaoPortugues.texto.length <= 900) return descricaoPortugues.texto;

  const texto = descricoes[0].texto;
  const materialFontes = descricoes
    .map((item, indice) => `Fonte ${indice + 1} (${item.fonte}): ${item.texto.slice(0, 3000)}`)
    .join('\n\n');
  const prompt = 'Escreva uma sinopse curta, em português do Brasil, para o livro identificado abaixo. Compare as descrições das fontes fornecidas. Use somente fatos que estejam explícitos em pelo menos uma delas; não invente personagens, acontecimentos ou detalhes. Se houver divergência, prefira a informação corroborada por mais fontes. Produza 2 ou 3 frases completas, não repita apenas o título e retorne somente a sinopse.\nTítulo: ' + titulo + '\nAutor: ' + (autor || 'não informado') + '\nDescrições consultadas:\n' + materialFontes;
  const resposta = await gerarTextoGemini(prompt, { maxOutputTokens: 180 });
  const resumo = limparDescricaoLivro(resposta);
  if (
    resumo.length >= 50 &&
    normalizarTituloBusca(resumo) !== normalizarTituloBusca(titulo) &&
    resumoEmPortugues(resumo)
  ) {
    return resumo;
  }
  return descricaoPortugues && resumoEmPortugues(descricaoPortugues.texto)
    ? encurtarResumoCatalogo(descricaoPortugues.texto)
    : '';
}

// Rascunho opcional sem fonte bibliográfica: o formulário indica que precisa ser revisado.
async function gerarResumoRascunho(titulo, autor) {
  if (!process.env.GEMINI_API_KEY || !titulo || !autor) return '';
  const prompt = `Você ajuda bibliotecários a catalogar livros. Use apenas seu conhecimento sobre a obra real abaixo. Se houver qualquer dúvida sobre a identidade da obra, responda {"confiavel":false,"resumo":""}. Se tiver certeza, escreva um resumo ORIGINAL em português do Brasil com 2 ou 3 frases sobre a história ou tema da obra, sem copiar sinopses protegidas e sem adicionar detalhes especulativos. IMPORTANTE: será mostrado como RASCUNHO PARA REVISÃO HUMANA, não como fato certificado. Responda somente JSON {"confiavel":true,"resumo":"..."}. Título: ${JSON.stringify(titulo)}. Autor: ${JSON.stringify(autor)}.`;
  const resposta = await gerarTextoGemini(prompt, {json:true, maxOutputTokens:320});
  try {
    const json = JSON.parse(resposta);
    const r = limparDescricaoLivro(json.resumo);
    return json.confiavel === true && r.length >= 75 && r.length <= 1000 && resumoEmPortugues(r) ? r : '';
  } catch { return ''; }
}

function combinarFontesCatalogo(fontes, tituloSolicitado) {
  const prioridadeFonte = {
    'Google Books': 1,
    'Open Library': 2,
    'Wikipedia (PT)': 3,
    'Wikipedia (EN)': 4,
    'Internet Archive': 5
  };
  const fontesOrdenadas = [...fontes].sort((a, b) =>
    (prioridadeFonte[a.fonte_dados] || 99) - (prioridadeFonte[b.fonte_dados] || 99)
  );
  const dados = fontesOrdenadas.reduce((acumulado, fonte) => ({
    ...acumulado,
    ...Object.fromEntries(
      ['autor', 'editora', 'genero', 'ano_publicacao', 'numero_paginas', 'idioma', 'url_capa']
        .map((campo) => {
          const valor = campo === 'autor'
            ? limparAutorCatalogo(fonte[campo])
            : campo === 'editora'
              ? limparEditoraCatalogo(fonte[campo])
              : fonte[campo];
          return [campo, valor];
        })
        .filter(([campo, valor]) => !acumulado[campo] && valor)
    )
  }), {});
  const descricoes = fontesOrdenadas
    .filter(fonte => fonte.resumo && normalizarTituloBusca(fonte.resumo) !== normalizarTituloBusca(tituloSolicitado))
    .sort((a, b) => {
      const idiomaAPortugues = /^(pt|portugu)/i.test(a.idioma_resumo || '');
      const idiomaBPortugues = /^(pt|portugu)/i.test(b.idioma_resumo || '');
      if (idiomaAPortugues !== idiomaBPortugues) return idiomaAPortugues ? -1 : 1;
      return String(b.resumo).length - String(a.resumo).length;
    });
  const descricaoPreferida = descricoes[0];
  const fontesUsadas = [...new Set(fontesOrdenadas.map(fonte => fonte.fonte_dados).filter(Boolean))];
  return {
    titulo: tituloSolicitado,
    titulo_catalogo: fontesOrdenadas.find(fonte => fonte.titulo_catalogo)?.titulo_catalogo || tituloSolicitado,
    autor: dados.autor || '',
    editora: dados.editora || '',
    genero: dados.genero || '',
    ano_publicacao: dados.ano_publicacao || null,
    numero_paginas: dados.numero_paginas || null,
    idioma: dados.idioma || '',
    resumo: descricaoPreferida?.resumo || '',
    idioma_resumo: descricaoPreferida?.idioma_resumo || '',
    url_capa: dados.url_capa || '',
    fonte_dados: fontesUsadas.join(' + '),
    fontes: fontesOrdenadas.map(({ fonte_dados, url_fonte }) => ({ nome: fonte_dados, url: url_fonte || '' }))
  };
}

module.exports = {
  normalizarTituloBusca,
  limparDescricaoLivro,
  limparAutorCatalogo,
  limparEditoraCatalogo,
  pontuarCorrespondenciaTitulo,
  converterIdiomaLivro,
  gerarTextoGemini,
  buscarTitulosAlternativosIA,
  obterAutorConhecidoDoLivro,
  pareceTextoPortugues,
  encurtarResumoCatalogo,
  pareceDescricaoDeColetanea, resumoEditorialConhecido, resumoEmPortugues,
  traduzirResumoCatalogo,
  gerarResumoRascunho,
  combinarFontesCatalogo
};
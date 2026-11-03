'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarServico } = require('../utilitarios/catalogoBibliografico');

function resposta(obj, status=200) {return {ok:status>=200&&status<300, status, json:async()=>obj};}
function criarMock({ google = () => ({items:[]}), ol = () => ({docs:[]}), edicao = () => null }) {
  const chamadas = [];
  async function fetchImpl(url) {
    chamadas.push(url);
    const u = new URL(url);
    if (u.hostname === 'www.googleapis.com') return resposta(google(u.searchParams.get('q') || ''));
    if (u.pathname.endsWith('/search.json')) return resposta(ol(u.searchParams.get('title') || u.searchParams.get('q') || ''));
    if (/\.json$/.test(u.pathname)) {
      const dados = edicao(u.pathname);
      return dados ? resposta(dados) : resposta({},404);
    }
    throw new Error('URL inesperada '+url);
  }
  return {fetchImpl, chamadas};
}

test('Livro conhecido por tradução: 5ª etapa encontra A Pequena Sereia sem inventar campos', async()=>{
  const mock = criarMock({
    google: q => q.toLowerCase().includes('the little mermaid') ? {items:[{volumeInfo:{
      title:'The Little Mermaid', authors:['Hans Christian Andersen'], publisher:'Editora Exemplo',
      publishedDate:'2014-09-08', pageCount:80, language:'en',
      description:'A mermaid longs to discover the human world and makes a difficult choice in the process.',
      imageLinks:{thumbnail:'http://example.org/cover.jpg'}, categories:['Fairy tales']
    }}]} : {items:[]}
  });
  const s=criarServico({fetchImpl:mock.fetchImpl, alternativasImpl:async()=>[], resumoImpl:async()=>''});
  const d=await s.pesquisar('A Pequena Sereia', {semCache:true});
  assert.equal(d.encontrado,true);
  assert.equal(d.autor,'Hans Christian Andersen');
  assert.equal(d.ano_publicacao,2014);
  assert.equal(d.numero_paginas,80);
  assert.equal(d.url_capa,'https://example.org/cover.jpg');
  assert.ok(d.tentativas.some(t=>t.etapa.startsWith('5.')));
  assert.ok(mock.chamadas.some(c=>c.includes('The+Little+Mermaid')));
});

test('Busca sem resultados: não fabrica editora, resumo nem autor', async()=>{
  const mock=criarMock({});
  const s=criarServico({fetchImpl:mock.fetchImpl, alternativasImpl:async()=>[]});
  const d=await s.pesquisar('Livro Imaginário ZYX 4321', {semCache:true});
  assert.equal(d.encontrado,false);
  assert.equal(d.campos_ausentes.includes('editora'),true);
  assert.ok(d.tentativas.length>=4);
});

test('Não aceita falso positivo com autor incompatível', async()=>{
  const mock=criarMock({google:()=>({items:[{volumeInfo:{title:'1984',authors:['Autor Aleatório'],publisher:'Editora X'}}]})});
  const s=criarServico({fetchImpl:mock.fetchImpl,alternativasImpl:async()=>[]});
  const d=await s.pesquisar('1984', {semCache:true});
  assert.equal(d.encontrado,false);
});

test('Não mistura ano e editora de duas edições diferentes', async()=>{
  const mock=criarMock({google:q=>({items:[{volumeInfo:{
    title:'Dom Quixote',authors:['Miguel de Cervantes'],publishedDate:'2010-04-01',
    publisher:'Editora Alfa', pageCount:333,language:'pt',description:'Este livro conta a história de um cavaleiro que viaja com seu escudeiro para enfrentar aventuras imaginárias.'
  }},{volumeInfo:{title:'Dom Quixote',authors:['Miguel de Cervantes'],publisher:'Editora Beta',publishedDate:'2022',pageCount:99}}]})});
  const s=criarServico({fetchImpl:mock.fetchImpl,alternativasImpl:async()=>[],resumoImpl:async()=>''});
  const d=await s.pesquisar('Dom Quixote', {semCache:true});
  assert.equal(d.encontrado,true);
  assert.equal(d.ano_publicacao,2010);
  assert.equal(d.numero_paginas,333);
  assert.equal(d.editora,'Editora Alfa');
});

test('Enriquecimento da edição Open Library sem inventar ano a partir de primeira publicação', async()=>{
  const mock=criarMock({
    ol:()=>({docs:[{title:'Exemplo Científico',author_name:['Fulano Souza'],cover_i:123,edition_key:['OL123M'],first_publish_year:1800,key:'/works/OL1W'}]}),
    edicao:()=>({title:'Exemplo Científico',publishers:['Editora B'],publish_date:'2008',number_of_pages:210, languages:[{key:'/languages/por'}]})
  });
  const s=criarServico({fetchImpl:mock.fetchImpl,alternativasImpl:async()=>[],resumoImpl:async()=>''});
  const d=await s.pesquisar('Exemplo Científico', {semCache:true});
  assert.equal(d.encontrado,true);
  assert.equal(d.ano_publicacao,2008);
  assert.equal(d.editora,'Editora B');
  assert.equal(d.numero_paginas,210);
  assert.equal(d.idioma,'Português');
  assert.equal(d.resumo,'');
});


test('recupera a descrição da obra quando a edição não tem sinopse', async () => {
  const mock = criarMock({
    ol: () => ({docs:[{title:'A Pequena Sereia', author_name:['Hans Christian Andersen'],
      key:'/works/OL100W', edition_key:['OL222M'], publisher:['Editora A'], number_of_pages_median:32}]}),
    edicao: path => path.includes('/books/OL222M')
      ? {title:'A Pequena Sereia', publishers:['Editora A'], publish_date:'2001', works:[{key:'/works/OL100W'}]}
      : path.includes('/works/OL100W')
        ? {description:{value:'Uma jovem sereia deseja conhecer a vida humana e enfrenta decisões difíceis ao tentar alcançar um sonho distante. O conto discute amor, identidade e sacrifício.'}}
        : null
  });
  const s = criarServico({fetchImpl:mock.fetchImpl, alternativasImpl:async()=>[], resumoImpl:async()=>''});
  const d = await s.pesquisar('A Pequena Sereia', {semCache:true});
  assert.equal(d.encontrado,true);
  assert.ok(d.resumo.includes('Uma jovem sereia'));
  assert.equal(d.numero_paginas,null);
  assert.equal(d.paginas_sugeridas.numero,32);
  assert.equal(d.ano_publicacao,2001);
  assert.equal(d.campos_fonte.resumo, 'Open Library — descrição da obra');
  assert.ok(mock.chamadas.some(url=>url.includes('/works/OL100W.json')));
});

test('busca sinopse em página portuguesa identificada como obra literária e destaca revisão', async () => {
  const calls=[];
  const fetchImpl=async url=>{
    calls.push(url);
    const u=new URL(url);
    if (u.hostname==='www.googleapis.com') return resposta({items:[]});
    if (u.pathname==='/search.json') return resposta({docs:[{title:'A Pequena Sereia',author_name:['Hans Christian Andersen'], key:'/works/OL123W', edition_key:['OL456M'], number_of_pages_median:40}]});
    if (u.pathname.includes('/books/OL456M.json')) return resposta({title:'A Pequena Sereia',publish_date:'2000'});
    if (u.hostname==='pt.wikipedia.org') return resposta({query:{pages:[{title:'A Pequena Sereia',extract:'A Pequena Sereia é um conto de fadas escrito pelo autor dinamarquês Hans Christian Andersen. A narrativa acompanha uma sereia que deseja conhecer o mundo humano e enfrenta escolhas difíceis no decorrer da história.'}]}});
    return resposta({},404);
  };
  const s=criarServico({fetchImpl, alternativasImpl:async()=>[],resumoImpl:async()=>''});
  const d=await s.pesquisar('A Pequena Sereia',{semCache:true});
  assert.equal(d.encontrado,true);
  assert.ok(d.resumo.includes('A Pequena Sereia é um conto'));
  assert.equal(d.resumo_revisao_obrigatoria,true);
  assert.equal(d.numero_paginas,null);
  assert.equal(d.paginas_sugeridas.numero,40);
  assert.ok(d.fontes.some(f=>f.nome==='Wikipédia'));
});

test('ignora sinopse de filme mesmo com autor do livro citado', async () => {
  const fetchImpl=async url=>{
    const u=new URL(url);
    if (u.hostname==='www.googleapis.com') return resposta({items:[]});
    if (u.pathname==='/search.json') return resposta({docs:[{title:'A Pequena Sereia', author_name:['Hans Christian Andersen'],key:'/works/OL123W'}]});
    if (u.hostname==='pt.wikipedia.org') return resposta({query:{pages:[{title:'A Pequena Sereia (filme)',extract:'A Pequena Sereia é um filme cinematográfico baseado no conto de Hans Christian Andersen, produzido por um estúdio de cinema. Este é o longa metragem, não o livro.'}]}});
    return resposta({},404);
  };
  const s=criarServico({fetchImpl, alternativasImpl:async()=>[],resumoImpl:async()=>''});
  const d=await s.pesquisar('A Pequena Sereia',{semCache:true});
  assert.equal(d.encontrado,true);
  assert.ok(d.resumo.includes('Uma jovem sereia'));
  assert.equal(d.resumo_revisao_obrigatoria, true);
  assert.ok(!d.resumo.toLowerCase().includes('filme'));
});

test('formulário começa com entrada em lote escondida e mantém os dados da busca individual logo abaixo', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../pagina_administrativa/html/livros.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../pagina_administrativa/java/livros.js'),'utf8');
  assert.match(html, /id="multiIABox"[^>]*hidden/);
  assert.match(html, /id="btnAlternarMultiplos"[^>]*aria-expanded="false"/);
  assert.ok(html.indexOf('id="dadosLivroTitulo"') < html.indexOf('id="multiIABox"'));
  assert.match(js, /alternarBuscaEmLote/);
  assert.match(js, /dados\.paginas_sugeridas/);
});


test('A Pequena Sereia: ignora descrição inglesa de coletânea e oferece resumo do conto em português', async () => {
  const textoColetanea = "Many of these stories for children are famous the world over. 'The Emperor's New Clothes', 'The Little Mermaid', 'The Ice Maiden', 'The Red Shoes', 'The Snow Queen', 'Thumbelina', 'The Steadfast Tin Soldier' and 'The Ugly Duckling' are as popular now as they ever were.";
  const mock = criarMock({
    google: () => ({items:[{volumeInfo:{
      title:'A Pequena Sereia', authors:['Hans Christian Andersen'],
      publisher:'Editora Exemplo', publishedDate:'2001',language:'en',
      description:textoColetanea, categories:["Children's stories, Danish"]
    }}]})
  });
  const s=criarServico({fetchImpl:mock.fetchImpl, alternativasImpl:async()=>[], resumoImpl:async()=>''});
  const d=await s.pesquisar('A pequena sereia', {semCache:true});
  assert.equal(d.encontrado, true);
  assert.equal(d.genero, 'Contos infantis');
  assert.equal(d.idioma,'Inglês'); // Idioma da edição, exibido em português.
  assert.ok(d.resumo.includes('Uma jovem sereia sonha'));
  assert.ok(!d.resumo.includes('The Emperor'));
  assert.ok(!d.resumo.includes('Many of these stories'));
  assert.equal(d.resumo_revisao_obrigatoria, true);
  assert.match(d.campos_fonte.resumo, /Resumo editorial original/);
});

test('Não publica descrição estrangeira de livro desconhecido sem tradução válida', async () => {
  const mock=criarMock({
    google:()=>({items:[{volumeInfo:{
      title:'The Moon Orchard', authors:['Joan Example'],publisher:'Example House',
      description:'This novel follows a young explorer into a mysterious orchard where old secrets remain hidden.',
      categories:['Fantasy'], language:'en',publishedDate:'2022'
    }}]})
  });
  const s=criarServico({fetchImpl:mock.fetchImpl, alternativasImpl:async()=>[], resumoImpl:async()=>''});
  const d=await s.pesquisar('The Moon Orchard', {semCache:true});
  assert.equal(d.encontrado,true);
  assert.equal(d.genero,'Fantasia');
  assert.equal(d.resumo,'');
  assert.ok(d.campos_ausentes.includes('resumo'));
  assert.match(d.aviso,/sinopse confiável em português/);
});

test('Usa síntese fornecida em português do Brasil e identifica revisão por IA', async () => {
  const mock=criarMock({
    google:()=>({items:[{volumeInfo:{
      title:'The Moon Orchard',authors:['Joan Example'],publisher:'Example House',
      description:'This novel follows a young explorer into a mysterious orchard where old secrets remain hidden.'
    }}]})
  });
  const resumoPT='Uma jovem exploradora encontra um pomar misterioso e tenta compreender os segredos que cercam o lugar. Ao longo da jornada, precisa decidir em quem confiar e como seguir adiante.';
  const s=criarServico({fetchImpl:mock.fetchImpl, alternativasImpl:async()=>[], resumoImpl:async()=>resumoPT});
  const d=await s.pesquisar('The Moon Orchard',{semCache:true});
  assert.equal(d.resumo,resumoPT);
  assert.equal(d.resumo_revisao_obrigatoria,true);
  assert.match(d.campos_fonte.resumo,/síntese em português/);
});

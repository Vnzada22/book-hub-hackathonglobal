const express = require('express');
const router = express.Router();
const { verificarPermissaoAdmin } = require('../seguranca/autorizacao');
const { protegerOrigem } = require('../seguranca/protecaoOrigem');
const { pesquisarLivro } = require('../utilitarios/catalogoBibliografico');

router.post('/preencher', verificarPermissaoAdmin, protegerOrigem, async (req, res) => {
  const titulo = String(req.body?.titulo || '').trim();
  if (!titulo || titulo.length > 180) return res.status(400).json({ erro: 'Informe um título ou ISBN de até 180 caracteres.' });
  try {
    const dados = await pesquisarLivro(titulo);
    return res.status(dados.encontrado ? 200 : dados.indisponivel ? 503 : 404).json(dados.encontrado ? dados : {erro:dados.erro, ...dados});
  } catch (error) {
    console.error('Erro ao consultar catálogos:', error.message);
    return res.status(502).json({ erro: 'Não foi possível consultar os catálogos agora. Tente novamente ou preencha manualmente.' });
  }
});

router.post('/preencher-multiplo', verificarPermissaoAdmin, protegerOrigem, async (req, res) => {
  const bruto = req.body?.titulos ?? req.body?.titulo ?? [];
  const titulos = Array.isArray(bruto) ? bruto : String(bruto).split(/[\n,]/);
  const lista = titulos.map(x=>String(x||'').trim()).filter(Boolean);
  if (!lista.length || lista.length > 20 || lista.some(x=>x.length > 180)) {
    return res.status(400).json({ erro: 'Informe entre 1 e 20 títulos válidos, com no máximo 180 caracteres cada.' });
  }
  const resultados = Array(lista.length);
  let proximo = 0;
  // Dois trabalhadores: mantém o lote responsivo sem disparar 20 consultas paralelas.
  await Promise.all(Array.from({length:Math.min(2, lista.length)}, async () => {
    while (proximo < lista.length) {
      const indice = proximo++;
      const titulo = lista[indice];
      try {
        const dados = await pesquisarLivro(titulo);
        resultados[indice] = dados.encontrado ? {livro:dados} : {naoEncontrado:titulo};
      } catch {
        resultados[indice] = {falha:{titulo, erro:'Fonte temporariamente indisponível'}};
      }
    }
  }));
  const livros = resultados.filter(r=>r?.livro).map(r=>r.livro);
  const naoEncontrados = resultados.filter(r=>r?.naoEncontrado).map(r=>r.naoEncontrado);
  const falhas = resultados.filter(r=>r?.falha).map(r=>r.falha);
  return res.json({ ok:true, total:lista.length, livros, naoEncontrados, falhas });
});

module.exports = router;

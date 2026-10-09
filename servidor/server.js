<<<<<<< HEAD
﻿const express = require('express');
=======
const express = require('express');
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
<<<<<<< HEAD
app.use(express.json());

app.use(express.static(path.join(__dirname, '../pagina_inicial/html')));
app.use('/css', express.static(path.join(__dirname, '../pagina_inicial/css')));
app.use('/java', express.static(path.join(__dirname, '../pagina_inicial/java')));
app.use('/img', express.static(path.join(__dirname, '../img')));

app.use('/login', express.static(path.join(__dirname, '../pagina_login/html')));
app.use('/login/css', express.static(path.join(__dirname, '../pagina_login/css')));
app.use('/login/js', express.static(path.join(__dirname, '../pagina_login/js')));

app.use('/perfil', express.static(path.join(__dirname, '../pagina_perfil/html')));
app.use('/perfil/css', express.static(path.join(__dirname, '../pagina_perfil/css')));
app.use('/perfil/js', express.static(path.join(__dirname, '../pagina_perfil/js')));

=======
app.use(express.json()); 


// Publica a página inicial e seus arquivos CSS/JavaScript organizados
app.use(express.static(path.join(__dirname, '../pagina_inicial/html')));
app.use('/css', express.static(path.join(__dirname, '../pagina_inicial/css')));
app.use('/java', express.static(path.join(__dirname, '../pagina_inicial/java')));

// Publica o painel administrativo em uma rota própria.
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
app.use('/admin', express.static(path.join(__dirname, '../pagina_administrativa/html')));
app.use('/admin/css', express.static(path.join(__dirname, '../pagina_administrativa/css')));
app.use('/admin/java', express.static(path.join(__dirname, '../pagina_administrativa/java')));

<<<<<<< HEAD
=======
// 1. Conexão com o Supabase (Região ca-central-1)
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
const db = new Pool({
  connectionString: 'postgresql://postgres.fttfirpasorvsqckdisn:Bancodedados@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

<<<<<<< HEAD
=======
// Captura erros no pool do Postgres para não travar a aplicação
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee
db.on('error', (err) => {
  console.error('Erro no pool do Supabase/Postgres:', err.message);
});

<<<<<<< HEAD
async function inicializarBanco() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255),
        username VARCHAR(50),
        email VARCHAR(255),
        senha VARCHAR(255),
        tipo VARCHAR(50) DEFAULT 'aluno',
        wallet_address VARCHAR(42),
        login VARCHAR(42),
        avatar VARCHAR(255) DEFAULT '/img/avatar1.png',
        data_cadastro TIMESTAMP DEFAULT NOW()
      )
    `);
    
    try { await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar VARCHAR(255) DEFAULT '/img/avatar1.png'`); } catch(e){}

    await db.query(`
      CREATE TABLE IF NOT EXISTS reservas (
        id SERIAL PRIMARY KEY,
        id_livro INTEGER,
        usuario_nome VARCHAR(255),
        status VARCHAR(30) DEFAULT 'Pendente',
        data_pedido TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Banco de dados inicializado com sucesso.');
  } catch (erro) {
    console.error('Erro ao inicializar tabelas do banco:', erro);
  }
}

inicializarBanco();

app.post('/api/auth/login', async (req, res) => {
  const wallet = typeof req.body?.wallet === 'string' ? req.body.wallet.trim() : '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return res.status(400).json({ erro: 'Carteira MetaMask inválida.' });

  try {
    const carteiraFormatada = wallet.toLowerCase();
    const resultado = await db.query('SELECT * FROM usuarios WHERE wallet_address = $1', [carteiraFormatada]);
    
    if (resultado.rows.length === 0) {
      return res.json({ novoUsuario: true });
    }

    const usuario = resultado.rows[0];
    return res.json({
      usuario: {
        id: usuario.id,
        wallet_address: usuario.wallet_address,
        login: usuario.login,
        nome: usuario.nome,
        username: usuario.username,
        email: usuario.email,
        tipo: usuario.tipo || 'aluno',
        avatar: usuario.avatar || '/img/avatar1.png'
      }
    });
  } catch (erro) {
    console.error('Erro ao verificar usuário:', erro);
    res.status(500).json({ erro: 'Erro ao verificar usuário.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { wallet, nome, username, email, senha, avatar } = req.body;
  
  if (!wallet || !nome || !username || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios.' });
  }

  try {
    const carteiraFormatada = wallet.toLowerCase();
    const loginGerado = 'user_' + carteiraFormatada.substring(2, 8);
    const avatarEscolhido = avatar || '/img/avatar1.png';

    await db.query('DELETE FROM usuarios WHERE wallet_address = $1 OR email = $2 OR username = $3', [carteiraFormatada, email, username]);

    const resultado = await db.query(`
      INSERT INTO usuarios (wallet_address, login, nome, username, email, senha, tipo, avatar) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING id, wallet_address, login, nome, username, email, tipo, avatar
    `, [carteiraFormatada, loginGerado, nome, username, email, senha, 'aluno', avatarEscolhido]);
    
    res.status(201).json({ mensagem: 'Cadastro concluído!', usuario: resultado.rows[0] });
  } catch (erro) {
    console.error('Erro detalhado no cadastro:', erro.message);
    res.status(500).json({ erro: 'Falha no cadastro: ' + erro.message });
  }
});

app.put('/api/auth/perfil', async (req, res) => {
  const { wallet, nome, username, email, senha, avatar } = req.body;
  if (!wallet || !nome || !username || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos e a senha.' });

  try {
    const carteiraFormatada = wallet.toLowerCase();
    const result = await db.query('SELECT * FROM usuarios WHERE wallet_address = $1', [carteiraFormatada]);
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    
    const usuarioDB = result.rows[0];
    if (usuarioDB.senha !== senha) return res.status(401).json({ erro: 'Senha incorreta.' });

    const checaDuplicado = await db.query(
      'SELECT id FROM usuarios WHERE (email = $1 OR username = $2) AND wallet_address != $3',
      [email, username, carteiraFormatada]
    );
    if (checaDuplicado.rows.length > 0) return res.status(400).json({ erro: 'E-mail ou Username em uso.' });

    const updateResult = await db.query(`
      UPDATE usuarios SET nome = $1, username = $2, email = $3, avatar = $4 WHERE wallet_address = $5 
      RETURNING id, wallet_address, login, nome, username, email, tipo, avatar
    `, [nome, username, email, avatar || usuarioDB.avatar, carteiraFormatada]);

    res.json({ mensagem: 'Perfil atualizado!', usuario: updateResult.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao atualizar perfil.' });
  }
});

app.get('/api/livros', async (req, res) => {
  try {
    const resultado = await db.query(`
      SELECT l.id, l.titulo, a.nome AS autor, e.nome AS editora, l.url_capa, l.ano_publicacao, l.genero, l.idioma, l.numero_paginas, l.disponivel
      FROM livros l INNER JOIN autores a ON l.id_autor = a.id INNER JOIN editoras e ON l.id_editora = e.id ORDER BY l.id DESC
    `);
    res.json(resultado.rows);
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.post('/api/livros', async (req, res) => {
  const { titulo, autor, editora, url_capa, ano_publicacao, genero, idioma, numero_paginas } = req.body;
  try {
    let resAutores = await db.query('SELECT id FROM autores WHERE nome = $1', [autor]);
    let id_autor = resAutores.rows.length > 0 ? resAutores.rows[0].id : (await db.query('INSERT INTO autores (nome) VALUES ($1) RETURNING id', [autor])).rows[0].id;
    let resEditoras = await db.query('SELECT id FROM editoras WHERE nome = $1', [editora]);
    let id_editora = resEditoras.rows.length > 0 ? resEditoras.rows[0].id : (await db.query('INSERT INTO editoras (nome) VALUES ($1) RETURNING id', [editora])).rows[0].id;

    await db.query(`
      INSERT INTO livros (titulo, id_autor, id_editora, url_capa, ano_publicacao, genero, idioma, numero_paginas)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [titulo, id_autor, id_editora, url_capa, ano_publicacao || null, genero || null, idioma || 'Português', numero_paginas || null]);
    res.status(201).json({ mensagem: 'Livro cadastrado!' });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.put('/api/livros/:id', async (req, res) => {
  const { titulo, autor, editora, url_capa, ano_publicacao, genero, idioma, numero_paginas } = req.body;
  try {
    let resAutores = await db.query('SELECT id FROM autores WHERE nome = $1', [autor]);
    let id_autor = resAutores.rows.length > 0 ? resAutores.rows[0].id : (await db.query('INSERT INTO autores (nome) VALUES ($1) RETURNING id', [autor])).rows[0].id;
    let resEditoras = await db.query('SELECT id FROM editoras WHERE nome = $1', [editora]);
    let id_editora = resEditoras.rows.length > 0 ? resEditoras.rows[0].id : (await db.query('INSERT INTO editoras (nome) VALUES ($1) RETURNING id', [editora])).rows[0].id;

    await db.query(`
      UPDATE livros SET titulo = $1, id_autor = $2, id_editora = $3, url_capa = $4, ano_publicacao = $5, genero = $6, idioma = $7, numero_paginas = $8 WHERE id = $9
    `, [titulo, id_autor, id_editora, url_capa, ano_publicacao || null, genero || null, idioma || 'Português', numero_paginas || null, req.params.id]);
    res.json({ mensagem: 'Atualizado!' });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.delete('/api/livros/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM livros WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Deletado!' });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.post('/api/ia/preencher', async (req, res) => {
  const { titulo } = req.body;
  const CHAVE_API = 'AQ.Ab8RN6Inxqw0wz0bxD9H7ROywTgla9j7YKSbjCsQFTilP_zGAA'; 

  let dados = { autor: '', editora: '', ano_publicacao: null, genero: '', numero_paginas: null, url_capa: '' };

  try {
    const queryBusca = encodeURIComponent(titulo);
    const respostaGoogle = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${queryBusca}`);
    const livrosGoogle = await respostaGoogle.json();

    if (livrosGoogle.items && livrosGoogle.items.length > 0) {
      for (let item of livrosGoogle.items) {
        const info = item.volumeInfo;
        if (!dados.autor && info.authors) dados.autor = info.authors[0];
        if (!dados.editora && info.publisher) dados.editora = info.publisher;
        if (!dados.ano_publicacao && info.publishedDate) dados.ano_publicacao = parseInt(info.publishedDate.substring(0, 4)) || null;
        if (!dados.genero && info.categories) dados.genero = info.categories[0];
        if (!dados.numero_paginas && info.pageCount) dados.numero_paginas = info.pageCount;

        if (!dados.url_capa && info.imageLinks && info.imageLinks.thumbnail) {
          dados.url_capa = info.imageLinks.thumbnail.replace('zoom=1', 'zoom=2').replace('http://', 'https://');
        }
      }
    }
  } catch (err) {}

  if (!dados.url_capa || !dados.autor) {
    try {
      const respOL = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(titulo)}`);
      const dataOL = await respOL.json();
      if (dataOL.docs && dataOL.docs.length > 0) {
        const doc = dataOL.docs[0];
        if (!dados.autor && doc.author_name) dados.autor = doc.author_name[0];
        if (!dados.editora && doc.publisher) dados.editora = doc.publisher[0];
        if (!dados.ano_publicacao && doc.first_publish_year) dados.ano_publicacao = doc.first_publish_year;
        if (!dados.numero_paginas && doc.number_of_pages_median) dados.numero_paginas = doc.number_of_pages_median;
        if (!dados.url_capa && doc.cover_i) dados.url_capa = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        else if (!dados.url_capa && doc.isbn && doc.isbn.length > 0) dados.url_capa = `https://covers.openlibrary.org/b/isbn/${doc.isbn[0]}-L.jpg`;
      }
    } catch (err) {}
  }

  try {
    const genAI = new GoogleGenerativeAI(CHAVE_API);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash', generationConfig: { responseMimeType: "application/json" } });
    const prompt = `Analise a obra (livro ou mangá) "${titulo}". Retorne um objeto JSON estrito contendo: {"autor": "...", "editora": "...", "ano_publicacao": 2000, "genero": "...", "numero_paginas": 200}. Preencha com dados reais e precisos.`;
    const resultado = await model.generateContent(prompt);
    let texto = resultado.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(texto);
    if (!dados.autor) dados.autor = parsed.autor;
    if (!dados.editora) dados.editora = parsed.editora;
    if (!dados.ano_publicacao) dados.ano_publicacao = parsed.ano_publicacao;
    if (!dados.genero) dados.genero = parsed.genero;
    if (!dados.numero_paginas) dados.numero_paginas = parsed.numero_paginas;
  } catch (erro) {}

  if (!dados.url_capa || dados.url_capa.trim() === '' || dados.url_capa.includes('via.placeholder.com')) {
    const slug = encodeURIComponent(titulo);
    dados.url_capa = `https://images.weserv.nl/?url=https://placehold.co/300x450/141414/e50914/png?text=${slug}&w=300&h=450&fit=cover`;
  }
  res.json(dados);
});

app.get('/api/reservas', async (req, res) => {
  try {
    const resultado = await db.query(`SELECT r.id, l.titulo, r.usuario_nome, r.status, r.data_pedido FROM reservas r INNER JOIN livros l ON r.id_livro = l.id ORDER BY r.id DESC`);
    res.json(resultado.rows);
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.get('/api/reservas/usuario', async (req, res) => {
  const wallet = req.query.wallet;
  try {
    const resultado = await db.query(`SELECT r.id, l.titulo, r.status, r.data_pedido FROM reservas r INNER JOIN livros l ON r.id_livro = l.id WHERE r.usuario_nome = $1 ORDER BY r.id DESC`, [wallet]);
    res.json(resultado.rows);
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.post('/api/reservas', async (req, res) => {
  const { id_livro, login } = req.body;
  try {
    await db.query('INSERT INTO reservas (id_livro, usuario_nome, status) VALUES ($1, $2, $3)', [id_livro, login, 'Pendente']);
    await db.query('UPDATE livros SET disponivel = false WHERE id = $1', [id_livro]);
    res.status(201).json({ mensagem: 'Solicitado!' });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.put('/api/reservas/:id', async (req, res) => {
  const { status } = req.body;
  try {
    const resId = await db.query('SELECT id_livro FROM reservas WHERE id = $1', [req.params.id]);
    if (resId.rows.length === 0) return res.status(404).json({ erro: 'Não encontrada' });
    const id_livro = resId.rows[0].id_livro;
    await db.query('UPDATE reservas SET status = $1 WHERE id = $2', [status, req.params.id]);
    if (status === 'Rejeitado') await db.query('UPDATE livros SET disponivel = true WHERE id = $1', [id_livro]);
    res.json({ mensagem: 'Atualizado!' });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));
=======
// 2. Rota GET - Listar Livros
app.get('/api/livros', async (req, res) => {
  try {
    const resultado = await db.query(`
      SELECT 
        l.id, l.titulo, a.nome AS autor, e.nome AS editora, 
        l.url_capa, l.ano_publicacao, l.genero, l.idioma, l.numero_paginas,
        l.disponivel
      FROM livros l
      INNER JOIN autores a ON l.id_autor = a.id
      INNER JOIN editoras e ON l.id_editora = e.id
      ORDER BY l.id DESC
    `);
    res.json(resultado.rows);
  } catch (erro) {
    console.error('Erro ao buscar livros:', erro.message);
    res.status(500).json({ erro: 'Erro ao buscar livros: ' + erro.message });
  }
});

// 3. Rota POST - Cadastrar Livro
app.post('/api/livros', async (req, res) => {
  const { 
    titulo, autor, editora, url_capa, ano_publicacao, genero, idioma, numero_paginas 
  } = req.body;

  try {
    let resAutores = await db.query('SELECT id FROM autores WHERE nome = $1', [autor]);
    let id_autor;
    if (resAutores.rows.length > 0) {
      id_autor = resAutores.rows[0].id;
    } else {
      let novoAutor = await db.query('INSERT INTO autores (nome) VALUES ($1) RETURNING id', [autor]);
      id_autor = novoAutor.rows[0].id;
    }

    let resEditoras = await db.query('SELECT id FROM editoras WHERE nome = $1', [editora]);
    let id_editora;
    if (resEditoras.rows.length > 0) {
      id_editora = resEditoras.rows[0].id;
    } else {
      let novaEditora = await db.query('INSERT INTO editoras (nome) VALUES ($1) RETURNING id', [editora]);
      id_editora = novaEditora.rows[0].id;
    }

    const sqlLivro = `
      INSERT INTO livros 
      (titulo, id_autor, id_editora, url_capa, ano_publicacao, genero, idioma, numero_paginas) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    await db.query(sqlLivro, [
      titulo, id_autor, id_editora, url_capa, ano_publicacao || null, 
      genero || null, idioma || 'Português', numero_paginas || null
    ]);

    res.status(201).json({ mensagem: 'Livro cadastrado com sucesso no Supabase!' });
  } catch (erro) {
    console.error('Erro detalhado no Supabase ao salvar livro:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// 4. Rota PUT - Editar Livro
app.put('/api/livros/:id', async (req, res) => {
  const {
    titulo, autor, editora, url_capa, ano_publicacao, genero, idioma, numero_paginas
  } = req.body;

  try {
    let resAutores = await db.query('SELECT id FROM autores WHERE nome = $1', [autor]);
    let id_autor;
    if (resAutores.rows.length > 0) {
      id_autor = resAutores.rows[0].id;
    } else {
      const novoAutor = await db.query('INSERT INTO autores (nome) VALUES ($1) RETURNING id', [autor]);
      id_autor = novoAutor.rows[0].id;
    }

    let resEditoras = await db.query('SELECT id FROM editoras WHERE nome = $1', [editora]);
    let id_editora;
    if (resEditoras.rows.length > 0) {
      id_editora = resEditoras.rows[0].id;
    } else {
      const novaEditora = await db.query('INSERT INTO editoras (nome) VALUES ($1) RETURNING id', [editora]);
      id_editora = novaEditora.rows[0].id;
    }

    const resultado = await db.query(`
      UPDATE livros
      SET titulo = $1, id_autor = $2, id_editora = $3, url_capa = $4,
          ano_publicacao = $5, genero = $6, idioma = $7, numero_paginas = $8
      WHERE id = $9
      RETURNING id
    `, [
      titulo, id_autor, id_editora, url_capa, ano_publicacao || null,
      genero || null, idioma || 'Português', numero_paginas || null, req.params.id
    ]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Livro não encontrado' });
    }

    res.json({ mensagem: 'Livro atualizado com sucesso!' });
  } catch (erro) {
    console.error('Erro detalhado no Supabase ao editar livro:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// 5. Rota DELETE - Remover Livro
app.delete('/api/livros/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM livros WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Livro deletado com sucesso' });
  } catch (erro) {
    console.error('Erro ao deletar livro:', erro.message);
    res.status(500).json({ erro: 'Erro ao deletar livro: ' + erro.message });
  }
});

// 6. Rota POST - Preencher com IA + Sistema Triplo de Capas (Google Books & Open Library)
app.post('/api/ia/preencher', async (req, res) => {
  const { titulo } = req.body;

  // IMPORTANTE: Coloque a sua chave AIza aqui!
  const CHAVE_API = 'AQ.Ab8RN6Inxqw0wz0bxD9H7ROywTgla9j7YKSbjCsQFTilP_zGAA'; 
  
  try {
    const genAI = new GoogleGenerativeAI(CHAVE_API);
    // Usando a versão oficial e atualizada 3.5
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    // A IA cuida APENAS dos textos, o sistema cuida da capa
    const prompt = `
      Retorne APENAS um objeto JSON válido, sem texto antes ou depois, sem crases e sem Markdown.
      Os dados devem ser reais para o livro: "${titulo}".
      
      Estrutura exata obrigatória:
      {
        "autor": "Nome do autor",
        "editora": "Nome da editora",
        "ano_publicacao": 2000,
        "genero": "Gênero principal",
        "numero_paginas": 100
      }
    `;

    const resultado = await model.generateContent(prompt);
    let textoResposta = resultado.response.text();
    textoResposta = textoResposta.replace(/```json/g, '').replace(/```/g, '').trim();

    const dadosDoLivro = JSON.parse(textoResposta);
    dadosDoLivro.url_capa = ""; 

    // ==========================================
    // SISTEMA TRIPLO DE CAPAS (À prova de falhas)
    // ==========================================
    try {
      // TENTATIVA 1: Google Books (Busca nos 5 primeiros)
      const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(titulo)}&maxResults=5`;
      const googleRes = await fetch(googleBooksUrl);
      const googleData = await googleRes.json();
      
      if (googleData.items && googleData.items.length > 0) {
        const livroComCapa = googleData.items.find(item => item.volumeInfo && item.volumeInfo.imageLinks && item.volumeInfo.imageLinks.thumbnail);
        if (livroComCapa) {
          dadosDoLivro.url_capa = livroComCapa.volumeInfo.imageLinks.thumbnail.replace('http:', 'https:').replace('&edge=curl', ''); 
        }
      }

      // TENTATIVA 2: Se falhou, pesquisa profunda no Open Library
      if (!dadosDoLivro.url_capa) {
        const openLibraryUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(titulo)}&limit=5`;
        const olRes = await fetch(openLibraryUrl);
        const olData = await olRes.json();

        if (olData.docs && olData.docs.length > 0) {
          const livroOLComCapa = olData.docs.find(doc => doc.cover_i);
          if (livroOLComCapa) {
            dadosDoLivro.url_capa = `https://covers.openlibrary.org/b/id/${livroOLComCapa.cover_i}-L.jpg`;
          }
        }
      }

      // TENTATIVA 3 (INFALÍVEL): Se as APIs não acharam, cria o link direto oficial
      if (!dadosDoLivro.url_capa) {
        const tituloFormatado = titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '+');
        dadosDoLivro.url_capa = `https://covers.openlibrary.org/b/title/${tituloFormatado}-L.jpg`;
      }

    } catch (erroCapa) {
      console.error('Erro ao buscar capa nas APIs externas:', erroCapa);
      const tituloFormatado = titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '+');
      dadosDoLivro.url_capa = `https://covers.openlibrary.org/b/title/${tituloFormatado}-L.jpg`;
    }

    res.json(dadosDoLivro);

  } catch (erro) {
    console.error('Erro no servidor da IA:', erro);
    res.status(500).json({ erro: 'Falha ao processar a requisição com a IA.' });
  }
});

app.listen(3000, () => {
  console.log('Servidor rodando e conectado ao Supabase na porta 3000');
});

// 7. Rota GET - Listar Reservas (para o Painel da Bibliotecária)
app.get('/api/reservas', async (req, res) => {
  try {
    const resultado = await db.query(`
      SELECT r.id, l.titulo, r.usuario_nome, r.status, r.data_pedido
      FROM reservas r
      INNER JOIN livros l ON r.id_livro = l.id
      ORDER BY r.id DESC
    `);
    res.json(resultado.rows);
  } catch (erro) {
    console.error('Erro ao buscar reservas:', erro.message);
    res.status(500).json({ erro: 'Erro ao buscar reservas: ' + erro.message });
  }
});

// 8. Rota POST - Solicitar Pré-Reserva (Feita pelo Aluno na Vitrine)
app.post('/api/reservas', async (req, res) => {
  const { id_livro, usuario_nome } = req.body;
  try {
    await db.query(
      'INSERT INTO reservas (id_livro, usuario_nome, status) VALUES ($1, $2, $3)',
      [id_livro, usuario_nome || 'Aluno', 'Pendente']
    );
    // Atualiza o livro para indisponível temporariamente
    await db.query('UPDATE livros SET disponivel = false WHERE id = $1', [id_livro]);
    
    res.status(201).json({ mensagem: 'Pré-reserva solicitada com sucesso!' });
  } catch (erro) {
    console.error('Erro ao solicitar reserva:', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

// 9. Rota PUT - Aceitar ou Recusar Reserva (Feita pela Bibliotecária)
app.put('/api/reservas/:id', async (req, res) => {
  const { status } = req.body; // 'Aprovado' ou 'Rejeitado'
  const idReserva = req.params.id;

  try {
    const reservaRes = await db.query('SELECT id_livro FROM reservas WHERE id = $1', [idReserva]);
    if (reservaRes.rows.length === 0) return res.status(404).json({ erro: 'Reserva não encontrada' });
    
    const id_livro = reservaRes.rows[0].id_livro;

    await db.query('UPDATE reservas SET status = $1 WHERE id = $2', [status, idReserva]);

    if (status === 'Rejeitado') {
      // Se a bibliotecária rejeitar, o livro volta a ficar disponível
      await db.query('UPDATE livros SET disponivel = true WHERE id = $1', [id_livro]);
    }

    res.json({ mensagem: `Reserva atualizada para: ${status}` });
  } catch (erro) {
    console.error('Erro ao atualizar reserva:', erro);
    res.status(500).json({ erro: erro.message });
  }
});
>>>>>>> 9504bc687cc4acd84b2de02efc8277c457b4baee

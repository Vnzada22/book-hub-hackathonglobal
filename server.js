require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// Roteamento de pastas estáticas (ajustadas para a raiz)
app.use(express.static(path.join(__dirname, 'pagina_inicial/html')));
app.use('/css', express.static(path.join(__dirname, 'pagina_inicial/css')));
app.use('/java', express.static(path.join(__dirname, 'pagina_inicial/java')));
app.use('/img', express.static(path.join(__dirname, 'img')));

app.use('/login', express.static(path.join(__dirname, 'pagina_login/html')));
app.use('/login/css', express.static(path.join(__dirname, 'pagina_login/css')));
app.use('/login/js', express.static(path.join(__dirname, 'pagina_login/js')));

app.use('/perfil', express.static(path.join(__dirname, 'pagina_perfil/html')));
app.use('/perfil/css', express.static(path.join(__dirname, 'pagina_perfil/css')));
app.use('/perfil/js', express.static(path.join(__dirname, 'pagina_perfil/js')));

app.use('/admin', express.static(path.join(__dirname, 'pagina_administrativa/html')));
app.use('/admin/css', express.static(path.join(__dirname, 'pagina_administrativa/css')));
app.use('/admin/java', express.static(path.join(__dirname, 'pagina_administrativa/java')));

// Conexão segura com o Supabase utilizando a variável de ambiente
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

db.on('error', (err) => {
  console.error('Erro no pool do Supabase/Postgres:', err.message);
});

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

// ROTAS DE AUTENTICAÇÃO
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

// ROTAS DE LIVROS
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

// ROTA DA INTELIGÊNCIA ARTIFICIAL: CORRETOR ORTOGRÁFICO BLINDADO
app.post('/api/ia/preencher', async (req, res) => {
  const { titulo } = req.body;
  const CHAVE_API = process.env.GEMINI_API_KEY; 

  let dados = { titulo_correto: titulo, autor: '', editora: '', ano_publicacao: null, genero: '', numero_paginas: null, url_capa: '' };
  let tituloCorrigido = titulo;

  try {
    if (CHAVE_API) {
      const genAI = new GoogleGenerativeAI(CHAVE_API);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); 
      
      const prompt = `Você é um bibliotecário especialista. O usuário pesquisou por: "${titulo}". Identifique o livro correto corrigindo erros de digitação (ex: "persin jackson" vira "Percy Jackson", "are pother" vira "Harry Potter"). Retorne APENAS um JSON válido no formato exato: {"titulo_correto": "...", "autor": "...", "editora": "...", "ano_publicacao": 2000, "genero": "...", "numero_paginas": 200}. Não use markdown na resposta.`;
      
      const resultado = await model.generateContent(prompt);
      let texto = resultado.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(texto);
      
      if (parsed.titulo_correto) {
        tituloCorrigido = parsed.titulo_correto;
        dados.titulo_correto = tituloCorrigido; 
      }
      dados.autor = parsed.autor || '';
      dados.editora = parsed.editora || '';
      dados.ano_publicacao = parsed.ano_publicacao || null;
      dados.genero = parsed.genero || '';
      dados.numero_paginas = parsed.numero_paginas || null;
    }
  } catch (erro) {
    console.error('Aviso: IA não pôde processar. Pulando para o Plano B.');
  }

  try {
    const queryBusca = encodeURIComponent(tituloCorrigido);
    const respostaGoogle = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${queryBusca}&maxResults=1`);
    const livrosGoogle = await respostaGoogle.json();

    if (livrosGoogle.items && livrosGoogle.items.length > 0) {
      const info = livrosGoogle.items[0].volumeInfo;
      
      if (!dados.autor && info.title) {
        tituloCorrigido = info.title;
        dados.titulo_correto = tituloCorrigido;
      }

      if (info.imageLinks && info.imageLinks.thumbnail) {
        dados.url_capa = info.imageLinks.thumbnail.replace('zoom=1', 'zoom=2').replace('http://', 'https://');
      }
      
      if (!dados.autor && info.authors) dados.autor = info.authors[0];
      if (!dados.editora && info.publisher) dados.editora = info.publisher;
      if (!dados.ano_publicacao && info.publishedDate) dados.ano_publicacao = parseInt(info.publishedDate.substring(0, 4)) || null;
      if (!dados.numero_paginas && info.pageCount) dados.numero_paginas = info.pageCount;
      if (!dados.genero && info.categories) dados.genero = info.categories[0];
    }
  } catch (err) {}

  if (!dados.url_capa) {
    try {
      const respOL = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(tituloCorrigido)}`);
      const dataOL = await respOL.json();
      if (dataOL.docs && dataOL.docs.length > 0) {
        const doc = dataOL.docs[0];
        if (doc.cover_i) dados.url_capa = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
      }
    } catch (err) {}
  }

  if (!dados.url_capa || dados.url_capa.trim() === '') {
    const slug = encodeURIComponent(tituloCorrigido);
    dados.url_capa = `https://placehold.co/300x450/1e293b/ffffff/png?text=${slug}&font=Montserrat`;
  }
  
  res.json(dados);
});

// ROTAS DE RESERVAS
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
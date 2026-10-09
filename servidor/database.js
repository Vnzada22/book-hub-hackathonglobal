// database.js
const mysql = require('mysql2');

// Configuração da conexão
const connection = mysql.createConnection({
  host: 'localhost', // ou o link do seu host na nuvem
  user: 'root',      // seu usuário
  password: '1234', // sua senha
  database: 'biblioteca'
});

// Conectando ao banco de dados
connection.connect((err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
    return;
  }
  console.log('Conectado ao banco de dados MySQL com sucesso!');
});

// Exporta a conexão para ser usada em outros arquivos
module.exports = connection;
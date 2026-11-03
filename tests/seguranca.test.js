// Configura variáveis de ambiente falsas PARA OS TESTES não quebrarem
process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake_db';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server'); 

describe('Testes de Segurança e Autorização (NC-01 e NC-02)', () => {
    
    it('Deve bloquear acesso anônimo ao cadastro de livros com status HTTP 401', async () => {
        const response = await request(app).post('/api/livros').send({
            titulo: 'Livro Teste',
            autor: 'Autor Teste'
        });
        
        // Verifica se recebemos 401 (Não autorizado) em vez de 503 (Banco fora) ou 500 (Erro)
        expect(response.statusCode).toEqual(401);
        expect(response.body).toHaveProperty('erro', 'Acesso negado. Faça login para continuar.');
    });

    it('Deve bloquear acesso anônimo à Inteligência Artificial com status HTTP 401', async () => {
        const response = await request(app).post('/api/ia/preencher').send({
            isbn: '9780000000000'
        });
        
        expect(response.statusCode).toEqual(401);
    });
});
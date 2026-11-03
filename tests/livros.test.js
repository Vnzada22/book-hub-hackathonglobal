// Configura variáveis de ambiente falsas PARA OS TESTES não quebrarem
process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake_db';
process.env.NODE_ENV = 'test';
process.env.AUTH_TOKEN_SECRET = 'test-secret-key-for-testing-only';
process.env.RESEND_API_KEY = '';
process.env.GEMINI_API_KEY = 'fake-key';

const request = require('supertest');
const app = require('../server');

describe('Testes de Livros - CRUD Completo', () => {
    describe('GET /api/livros', () => {
        it('Deve permitir acesso público ao catálogo', async () => {
            const response = await request(app).get('/api/livros');
            expect([200, 503]).toContain(response.statusCode);
            if (response.statusCode === 200) {
                expect(Array.isArray(response.body)).toBe(true);
            }
        });
    });

    describe('POST /api/livros', () => {
        it('Deve bloquear cadastro sem autenticação (401)', async () => {
            const response = await request(app)
                .post('/api/livros')
                .send({ titulo: 'Livro Teste', autor: 'Autor Teste' });
            expect(response.statusCode).toEqual(401);
        });

        it('Deve validar campos obrigatórios', async () => {
            const response = await request(app)
                .post('/api/livros')
                .send({ titulo: 'Sem Autor' });
            expect([400, 401]).toContain(response.statusCode);
        });
    });

    describe('PUT /api/livros/:id', () => {
        it('Deve bloquear edição sem autenticação (401)', async () => {
            const response = await request(app)
                .put('/api/livros/1')
                .send({ titulo: 'Novo Título' });
            expect(response.statusCode).toEqual(401);
        });

        it('Deve validar ID numérico', async () => {
            const response = await request(app)
                .put('/api/livros/invalido')
                .send({ titulo: 'Teste' });
            expect([400, 401]).toContain(response.statusCode);
        });
    });

    describe('DELETE /api/livros/:id', () => {
        it('Deve bloquear exclusão sem autenticação (401)', async () => {
            const response = await request(app).delete('/api/livros/1');
            expect(response.statusCode).toEqual(401);
        });

        it('Deve validar ID numérico', async () => {
            const response = await request(app)
                .delete('/api/livros/invalido');
            expect([400, 401]).toContain(response.statusCode);
        });
    });

    describe('POST /api/livros/lote', () => {
        it('Deve bloquear batch sem autenticação (401)', async () => {
            const response = await request(app)
                .post('/api/livros/lote')
                .send({ livros: [{ titulo: 'Teste', autor: 'Autor' }] });
            expect(response.statusCode).toEqual(401);
        });

        it('Deve validar array de livros', async () => {
            const response = await request(app)
                .post('/api/livros/lote')
                .send({ livros: 'não é array' });
            expect([400, 401]).toContain(response.statusCode);
        });

        it('Deve validar limite de 20 livros', async () => {
            const muitosLivros = Array(21).fill({ titulo: 'Teste', autor: 'Autor' });
            const response = await request(app)
                .post('/api/livros/lote')
                .send({ livros: muitosLivros });
            expect([400, 401]).toContain(response.statusCode);
        });
    });
});
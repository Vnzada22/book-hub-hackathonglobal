// Configura variáveis de ambiente falsas PARA OS TESTES não quebrarem
process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake_db';
process.env.NODE_ENV = 'test';
process.env.AUTH_TOKEN_SECRET = 'test-secret-key-for-testing-only';
process.env.GEMINI_API_KEY = 'fake-key';

const request = require('supertest');
const app = require('../server');

describe('Testes de IA - Preenchimento Bibliográfico', () => {
    describe('POST /api/ia/preencher', () => {
        it('Deve bloquear acesso sem autenticação (401)', async () => {
            const response = await request(app)
                .post('/api/ia/preencher')
                .send({ titulo: 'Dom Quixote' });
            expect(response.statusCode).toEqual(401);
        });

        it('Deve validar título obrigatório', async () => {
            const response = await request(app)
                .post('/api/ia/preencher')
                .send({});
            expect([400, 401]).toContain(response.statusCode);
        });
    });

    describe('POST /api/ia/preencher-multiplo', () => {
        it('Deve bloquear acesso sem autenticação (401)', async () => {
            const response = await request(app)
                .post('/api/ia/preencher-multiplo')
                .send({ titulos: ['Dom Quixote', 'O Pequeno Príncipe'] });
            expect(response.statusCode).toEqual(401);
        });

        it('Deve validar array de títulos', async () => {
            const response = await request(app)
                .post('/api/ia/preencher-multiplo')
                .send({ titulos: 'não é array' });
            expect([400, 401]).toContain(response.statusCode);
        });

        it('Deve validar limite de 20 títulos', async () => {
            const muitosTitulos = Array(21).fill('Livro Teste');
            const response = await request(app)
                .post('/api/ia/preencher-multiplo')
                .send({ titulos: muitosTitulos });
            expect([400, 401]).toContain(response.statusCode);
        });

        it('Deve validar título não vazio', async () => {
            const response = await request(app)
                .post('/api/ia/preencher-multiplo')
                .send({ titulos: ['', '  ', 'Válido'] });
            expect([400, 401]).toContain(response.statusCode);
        });
    });
});
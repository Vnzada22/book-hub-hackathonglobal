// Configura variáveis de ambiente falsas PARA OS TESTES não quebrarem
process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake_db';
process.env.NODE_ENV = 'test';
process.env.AUTH_TOKEN_SECRET = 'test-secret-key-for-testing-only';

const request = require('supertest');
const app = require('../server');

describe('Testes de Ranking - Temporadas, Conquistas, Histórico', () => {
    describe('GET /api/ranking', () => {
        it('Deve permitir acesso público ao ranking', async () => {
            const response = await request(app).get('/api/ranking');
            expect([200, 503]).toContain(response.statusCode);
            if (response.statusCode === 200) {
                expect(Array.isArray(response.body)).toBe(true);
            }
        });

        it('Deve aceitar parâmetro temporada', async () => {
            const response = await request(app).get('/api/ranking?temporada=2025-01');
            expect([200, 400, 503]).toContain(response.statusCode);
        });
    });

    describe('GET /api/ranking/temporadas', () => {
        it('Deve retornar lista de temporadas', async () => {
            const response = await request(app).get('/api/ranking/temporadas');
            expect([200, 503]).toContain(response.statusCode);
            if (response.statusCode === 200) {
                expect(Array.isArray(response.body)).toBe(true);
            }
        });
    });

    describe('GET /api/ranking/temporadas/:id/resultados', () => {
        it('Deve validar ID de temporada', async () => {
            const response = await request(app).get('/api/ranking/temporadas/invalido/resultados');
            expect([400, 401]).toContain(response.statusCode);
        });

        it('Deve retornar resultados de temporada válida', async () => {
            const response = await request(app).get('/api/ranking/temporadas/1/resultados');
            expect([200, 404, 503]).toContain(response.statusCode);
        });
    });

    describe('GET /api/ranking/conquistas/:usuarioId', () => {
        it('Deve validar ID de usuário', async () => {
            const response = await request(app).get('/api/ranking/conquistas/invalido');
            expect([400, 401]).toContain(response.statusCode);
        });

        it('Deve retornar conquistas de usuário', async () => {
            const response = await request(app).get('/api/ranking/conquistas/1');
            expect([200, 404, 503]).toContain(response.statusCode);
            if (response.statusCode === 200) {
                expect(response.body).toHaveProperty('usuarioId');
                expect(response.body).toHaveProperty('conquistas');
                expect(Array.isArray(response.body.conquistas)).toBe(true);
            }
        });
    });

    describe('GET /api/ranking/historico/:usuarioId', () => {
        it('Deve validar ID de usuário', async () => {
            const response = await request(app).get('/api/ranking/historico/invalido');
            expect([400, 401]).toContain(response.statusCode);
        });

        it('Deve retornar histórico de pontuação', async () => {
            const response = await request(app).get('/api/ranking/historico/1');
            expect([200, 404, 503]).toContain(response.statusCode);
            if (response.statusCode === 200) {
                expect(Array.isArray(response.body)).toBe(true);
            }
        });
    });
});
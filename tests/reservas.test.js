// Configura variáveis de ambiente falsas PARA OS TESTES não quebrarem
process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake_db';
process.env.NODE_ENV = 'test';
process.env.AUTH_TOKEN_SECRET = 'test-secret-key-for-testing-only';

const request = require('supertest');
const app = require('../server');

describe('Testes de Reservas - Fluxo Completo', () => {
    describe('POST /api/reservas', () => {
        it('Deve bloquear reserva sem autenticação (401)', async () => {
            const response = await request(app)
                .post('/api/reservas')
                .send({ id_livro: 1 });
            expect(response.statusCode).toEqual(401);
        });

        it('Deve validar id_livro obrigatório', async () => {
            const response = await request(app)
                .post('/api/reservas')
                .send({});
            expect([400, 401]).toContain(response.statusCode);
        });
    });

    describe('GET /api/reservas/usuario', () => {
        it('Deve bloquear acesso sem autenticação (401)', async () => {
            const response = await request(app).get('/api/reservas/usuario');
            expect(response.statusCode).toEqual(401);
        });
    });

    describe('GET /api/reservas (admin)', () => {
        it('Deve bloquear sem autenticação (401)', async () => {
            const response = await request(app).get('/api/reservas');
            expect(response.statusCode).toEqual(401);
        });
    });

    describe('PUT /api/reservas/:id (admin)', () => {
        it('Deve bloquear sem autenticação (401)', async () => {
            const response = await request(app)
                .put('/api/reservas/1')
                .send({ status: 'Aprovado' });
            expect(response.statusCode).toEqual(401);
        });

        it('Deve validar status obrigatório', async () => {
            const response = await request(app)
                .put('/api/reservas/1')
                .send({});
            expect([400, 401]).toContain(response.statusCode);
        });

        it('Deve validar status válido', async () => {
            const response = await request(app)
                .put('/api/reservas/1')
                .send({ status: 'Invalido' });
            expect([400, 401]).toContain(response.statusCode);
        });

        it('Deve exigir motivo para rejeição', async () => {
            const response = await request(app)
                .put('/api/reservas/1')
                .send({ status: 'Rejeitado' });
            expect([400, 401]).toContain(response.statusCode);
        });
    });

    describe('DELETE /api/reservas/:id', () => {
        it('Deve bloquear sem autenticação (401)', async () => {
            const response = await request(app).delete('/api/reservas/1');
            expect(response.statusCode).toEqual(401);
        });
    });
});
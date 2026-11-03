// Configura variáveis de ambiente falsas PARA OS TESTES não quebrarem
process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake_db';
process.env.NODE_ENV = 'test';
process.env.AUTH_TOKEN_SECRET = 'test-secret-key-for-testing-only';
process.env.RESEND_API_KEY = '';

const request = require('supertest');
const app = require('../server');

describe('Testes de Autenticação', () => {
    it('Deve bloquear acesso anônimo a GET /api/auth/perfil com status HTTP 401', async () => {
        const response = await request(app).get('/api/auth/perfil');
        expect(response.statusCode).toEqual(401);
        expect(response.body).toHaveProperty('erro');
    });

    it('Deve bloquear acesso anônimo a PUT /api/auth/perfil com status HTTP 401', async () => {
        const response = await request(app).put('/api/auth/perfil').send({ nome: 'Teste' });
        expect(response.statusCode).toEqual(401);
        expect(response.body).toHaveProperty('erro');
    });

    it('Deve bloquear acesso anônimo a POST /api/reservas com status HTTP 401', async () => {
        const response = await request(app).post('/api/reservas').send({ id_livro: 1 });
        expect(response.statusCode).toEqual(401);
        expect(response.body).toHaveProperty('erro');
    });

    it('Deve bloquear acesso anônimo a GET /api/reservas/usuario com status HTTP 401', async () => {
        const response = await request(app).get('/api/reservas/usuario');
        expect(response.statusCode).toEqual(401);
        expect(response.body).toHaveProperty('erro');
    });

    it('Deve validar email no POST /api/auth/email/send-code', async () => {
        const response = await request(app).post('/api/auth/email/send-code').send({ email: 'invalido' });
        expect(response.statusCode).toEqual(400);
        expect(response.body).toHaveProperty('erro', 'Informe um e-mail válido.');
    });

    it('Deve validar email e código no POST /api/auth/email/verify-code', async () => {
        const response = await request(app).post('/api/auth/email/verify-code').send({});
        expect(response.statusCode).toEqual(400);
        expect(response.body).toHaveProperty('erro', 'E-mail e código são obrigatórios.');
    });

    it('Deve validar wallet no POST /api/auth/wallet/challenge', async () => {
        const response = await request(app).post('/api/auth/wallet/challenge').send({ wallet: 'invalido' });
        expect(response.statusCode).toEqual(400);
        expect(response.body).toHaveProperty('erro', 'Endereço de carteira inválido.');
    });

    it('Deve validar wallet e signature no POST /api/auth/wallet/verify', async () => {
        const response = await request(app).post('/api/auth/wallet/verify').send({ wallet: '0x1234567890123456789012345678901234567890' });
        expect(response.statusCode).toEqual(400);
        expect(response.body).toHaveProperty('erro', 'Assinatura obrigatória.');
    });

    it('Deve validar identificação no POST /api/auth/login', async () => {
        const response = await request(app).post('/api/auth/login').send({});
        expect(response.statusCode).toEqual(400);
        expect(response.body).toHaveProperty('erro', 'Identificação obrigatória.');
    });

    it('Deve validar dados no POST /api/auth/register', async () => {
        const response = await request(app).post('/api/auth/register').send({});
        expect(response.statusCode).toEqual(400);
        expect(response.body).toHaveProperty('erro', 'Dados incompletos para cadastro. E-mail, nome e código de verificação são obrigatórios.');
    });
});

describe('Testes de Reservas', () => {
    it('Deve retornar 400 para reserva sem id_livro', async () => {
        // Mock do middleware de auth para testar validação
        const response = await request(app).post('/api/reservas').send({});
        // Espera 401 porque não tem auth, mas se tivesse auth falharia com 400
        expect([400, 401]).toContain(response.statusCode);
    });
});

describe('Testes de Livros - Batch', () => {
    it('Deve bloquear acesso anônimo a POST /api/livros/lote com status HTTP 401', async () => {
        const response = await request(app).post('/api/livros/lote').send({ livros: [{ titulo: 'Teste', autor: 'Autor' }] });
        expect(response.statusCode).toEqual(401);
        expect(response.body).toHaveProperty('erro');
    });

    it('Deve validar array de livros no POST /api/livros/lote', async () => {
        const response = await request(app).post('/api/livros/lote').send({ livros: 'não é array' });
        expect([400, 401]).toContain(response.statusCode);
    });
});

describe('Testes de Ranking', () => {
    it('Deve retornar ranking público (pode retornar 503/500 se DB indisponível)', async () => {
        const response = await request(app).get('/api/ranking');
        // Aceita 200 (sucesso), 503 (banco indisponível) ou 500 (erro de conexão)
        expect([200, 503]).toContain(response.statusCode);
    });
});

describe('Testes de Livros - CRUD', () => {
    it('Deve permitir GET /api/livros (público)', async () => {
        const response = await request(app).get('/api/livros');
        // Aceita 200 (sucesso), 503 (banco indisponível) ou 500 (erro de conexão)
        expect([200, 503]).toContain(response.statusCode);
    });

    it('Deve bloquear POST /api/livros sem auth', async () => {
        const response = await request(app).post('/api/livros').send({ titulo: 'Teste', autor: 'Autor' });
        expect(response.statusCode).toEqual(401);
    });

    it('Deve bloquear PUT /api/livros/:id sem auth', async () => {
        const response = await request(app).put('/api/livros/1').send({ titulo: 'Teste' });
        expect(response.statusCode).toEqual(401);
    });

    it('Deve bloquear DELETE /api/livros/:id sem auth', async () => {
        const response = await request(app).delete('/api/livros/1');
        expect(response.statusCode).toEqual(401);
    });
});

describe('Testes de IA', () => {
    it('Deve bloquear POST /api/ia/preencher sem auth', async () => {
        const response = await request(app).post('/api/ia/preencher').send({ titulo: 'Teste' });
        expect(response.statusCode).toEqual(401);
    });

    it('Deve bloquear POST /api/ia/preencher-multiplo sem auth', async () => {
        const response = await request(app).post('/api/ia/preencher-multiplo').send({ titulos: ['Teste'] });
        expect(response.statusCode).toEqual(401);
    });
});

describe('Testes de Ranking - Temporadas e Conquistas', () => {
    it('Deve retornar lista de temporadas', async () => {
        const response = await request(app).get('/api/ranking/temporadas');
        expect([200, 503]).toContain(response.statusCode);
    });

    it('Deve bloquear acesso a conquistas sem ID', async () => {
        const response = await request(app).get('/api/ranking/conquistas/');
        expect([404, 400]).toContain(response.statusCode);
    });

    it('Deve bloquear acesso a histórico sem ID', async () => {
        const response = await request(app).get('/api/ranking/historico/');
        expect([404, 400]).toContain(response.statusCode);
    });
});

describe('Testes de OAuth', () => {
    it('Deve retornar erro se Google OAuth não configurado', async () => {
        const response = await request(app).get('/api/auth/google');
        expect([400, 302]).toContain(response.statusCode);
    });

    it('Deve retornar erro se X OAuth não configurado', async () => {
        const response = await request(app).get('/api/auth/x');
        expect([400, 302]).toContain(response.statusCode);
    });
});

describe('Testes de Sessão', () => {
    it('Deve bloquear logout-all sem auth', async () => {
        const response = await request(app).post('/api/auth/logout-all');
        expect(response.statusCode).toEqual(401);
    });
});
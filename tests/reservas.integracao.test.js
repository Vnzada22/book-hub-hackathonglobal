/** Testes HTTP do fluxo de reservas usando banco transacional simulado.
 * São testes de contrato e concorrência, NÃO substituem homologação PostgreSQL.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://fake:fake@localhost:5432/fake_db';
const crypto = require('crypto');
const request = require('supertest');
const { db } = require('../configuracao/db');
jest.mock('../configuracao/db', () => ({ db: { query: jest.fn(), connect: jest.fn() }, garantirEstruturaBanco: jest.fn() }));
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/reservas', require('../rotas/reservas'));
const token = 'teste-reserva-autenticacao';
const cookie = `bookhub_session=${token}`;
const user = { id: 11, tipo: 'aluno', perfil: 'aluno' };
function prepareFakeDB({ available = 1, failOnInsert = false } = {}) {
  let remaining = available;
  let reservados = 0;
  let nextId = 1;
  let lastState = 'disponivel';
  const calls = [];
  db.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM public.auth_sessions')) return { rows: [user] };
    if (sql.includes('FROM public.livros')) return { rows: [{ id: 7, titulo: 'Livro teste', disponivel: true }] };
    return { rows: [] };
  });
  db.connect.mockImplementation(async () => ({
    query: async (sql, values) => {
      calls.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM public.bookhub_reservations') && sql.includes('status =')) return { rows: [] };
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        if (!remaining) return { rows: [] };
        remaining -= 1;
        return { rows: [{ id: nextId++ }] };
      }
      if (sql.includes('UPDATE public.exemplares')) { lastState = 'reservado'; reservados += 1; return { rows: [] }; }
      if (sql.includes('INSERT INTO public.bookhub_reservations')) {
        if (failOnInsert) throw new Error('falha simulada');
        return { rows: [{ id: 90 + reservados, exemplar_id: values[2], status: 'Pendente' }] };
      }
      return { rows: [] };
    },
    release: jest.fn()
  }));
  return { calls, get reserved() { return reservados; }, get remaining() { return remaining; }, get state() { return lastState; } };
}
beforeEach(() => jest.clearAllMocks());
test('anônimo não cria pré-reserva', async () => {
  const r = await request(app).post('/api/reservas').send({ id_livro: 7 });
  expect(r.status).toBe(401);
});
test('quando não há exemplar disponível retorna 409', async () => {
  prepareFakeDB({ available: 0 });
  const r = await request(app).post('/api/reservas').set('Cookie', cookie).send({ id_livro: 7 });
  expect(r.status).toBe(409);
});
test('último exemplar, dois usuários simultâneos: apenas uma reserva vence', async () => {
  const fake = prepareFakeDB({ available: 1 });
  const [a,b] = await Promise.all([
    request(app).post('/api/reservas').set('Cookie', cookie).send({id_livro: 7}),
    request(app).post('/api/reservas').set('Cookie', cookie).send({id_livro: 7})
  ]);
  expect([a.status,b.status].sort()).toEqual([201,409]);
  expect(fake.reserved).toBe(1);
  expect(fake.calls.filter(x => x.includes('FOR UPDATE SKIP LOCKED')).length).toBe(2);
});
test('falha ao inserir reverte transação', async () => {
  const fake = prepareFakeDB({ available: 1, failOnInsert: true });
  const r = await request(app).post('/api/reservas').set('Cookie', cookie).send({id_livro: 7});
  expect(r.status).toBe(500);
  expect(fake.calls).toContain('ROLLBACK');
  expect(fake.calls).not.toContain('COMMIT');
});
test('aluno não pode listar reservas administrativas', async () => {
  prepareFakeDB();
  const r = await request(app).get('/api/reservas').set('Cookie', cookie);
  expect(r.status).toBe(403);
});

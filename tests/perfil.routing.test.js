// Regressão: novos logins OAuth devem conseguir abrir o perfil sem 404.
const request = require('supertest');
const app = require('../server');

describe('Acesso à página de perfil', () => {
  test.each(['/perfil', '/perfil/'])('%s redireciona para a página existente', async url => {
    const res = await request(app).get(url);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/perfil/perfil.html');
  });

  test('página do perfil é servida como HTML', async () => {
    const res = await request(app).get('/perfil/perfil.html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('BookHub');
  });
});

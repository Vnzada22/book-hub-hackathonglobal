const fs = require('fs');
const path = require('path');
const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('Regressão de rotas após autenticação', () => {
  test('concluir o perfil encaminha para a página inicial', () => {
    const source = read('pagina_perfil/js/completar.js');
    expect(source).toContain("location.replace('/')");
    expect(source).not.toContain("location.replace('/perfil/perfil.html')");
  });
  test('login consulta a sessão e exige configuração quando necessário', () => {
    const source = read('pagina_login/js/login.js');
    expect(source).toContain("'/api/auth/perfil'");
    expect(source).toContain("dados.usuario.onboarding_completed !== true");
  });
  test('callback Google exige e-mail verificado e inicia primeiro acesso', () => {
    const source = read('rotas/auth.js');
    const google = source.slice(source.indexOf('// OAuth Google'), source.indexOf('// OAuth X'));
    expect(google).toContain('userData.verified_email !== true');
    expect(google).toContain('onboarding_completed');
    expect(google).toContain("precisaCompletarPerfil(usuario) ? '/perfil/completar.html' : '/'");
    expect(google).not.toContain('const requireEmailVerification = isNewUser');
  });
});

describe('Primeiro acesso e sessão', () => {
  test('home encaminha para configurar perfil antes de considerar login concluído', () => {
    const source = read('pagina_inicial/java/client.js');
    expect(source).toContain("window.location.replace('/perfil/completar.html')");
    expect(source).toContain("onboarding_completed !== true");
  });
  test('erro de banco não deve retornar falso logout 401', () => {
    const source = read('rotas/auth.js');
    expect(source).toContain('res.status(503).json');
  });
  test('a migração reabre apenas google legado com username automático', () => {
    const source = read('supabase/migrations/20261103000000_onboarding_legacy_google.sql');
    expect(source).toContain("a.provider = 'google'");
    expect(source).toContain('onboarding_confirmed_at IS NULL');
  });
});

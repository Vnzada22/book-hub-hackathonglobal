const fs = require('fs');
const path = require('path');

test('migração de reparo adiciona campos do primeiro acesso sem excluir usuários', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261103000010_reparar_onboarding_colunas.sql'), 'utf8');
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS onboarding_completed/i);
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS onboarding_confirmed_at/i);
  expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM public\.usuarios/i);
});

test('erro de coluna não é exibido como sessão expirada', () => {
  const source = fs.readFileSync(path.join(__dirname, '../rotas/auth.js'), 'utf8');
  expect(source).toContain('DATABASE_MIGRATION_REQUIRED');
});

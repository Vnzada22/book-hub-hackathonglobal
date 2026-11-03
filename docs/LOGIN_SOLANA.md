# Login Solana e Phantom

O BookHub oferece botões Phantom e Solana. Ambos realizam o mesmo tipo de autenticação: assinatura Ed25519 de mensagem de desafio, sem operações financeiras.

## Como usar

- Instale e habilite uma carteira compatível que exponha `window.solana` e `signMessage` (a Phantom também pode expor `window.phantom.solana`).
- Abra `/login`, selecione o botão correspondente, autorize a conexão e assine a mensagem.
- O servidor usa desafio com 5 minutos de validade, exclusão transacional e verificação Ed25519 nativa do Node.js.
- A conta autenticada recebe sessão HTTP-only da mesma forma que outros logins.
- Aplique a migração `20261029000010_sol_login_method.sql` no banco de homologação antes de testar.
- Não solicite frases-semente, senhas de carteira, transferências nem taxas de login.

## Atenção

O fluxo ainda depende de testes no navegador com extensões Phantom/Solana e banco Supabase de homologação. Nenhuma execução real com provedor foi realizada neste pacote. O sistema cria um usuário separado para uma chave nova; vinculação de carteira a uma conta de e-mail existente exige fluxo explícito de associação de identidade, não implementado aqui.

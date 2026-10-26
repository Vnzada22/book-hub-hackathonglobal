# RELATÓRIO III
## REAVALIAÇÃO TÉCNICA, METODOLÓGICA E PEDAGÓGICA DO BOOK HUB

**Projeto:** Book Hub — Plataforma de Gestão de Biblioteca Escolar

**Referencial:** IPIT — Ideathon Pedagógico de Inovação Tecnológica

**Autora da metodologia:** Sandra Maria Pereira

**Data:** 26 de outubro de 2026

**Versão avaliada:** branch `main`, commit `a045759accf2ab534761d0f1868bc18a7b174f07`

**Tipo:** Terceira avaliação, com análise comparativa das versões e recomendações de correção.

---

## 1. OBJETIVO

Este relatório tem como finalidade reavaliar a evolução do Book Hub segundo os princípios da metodologia IPIT, considerando as alterações realizadas no repositório e o atendimento às recomendações apresentadas anteriormente.

A avaliação contempla a consistência da solução, sua implementação tecnológica, a qualidade do código, a segurança, os testes, a documentação, a colaboração e as evidências do processo pedagógico.

O objetivo não se limita à atribuição de uma nota. Busca-se identificar avanços, verificar correções e orientar a equipe na continuidade do desenvolvimento.

## 2. PROCEDIMENTO DE AVALIAÇÃO

A reavaliação foi conduzida mediante:

1. Consulta à branch principal do repositório.
2. Inspeção da estrutura atual de arquivos.
3. Verificação do histórico recente de commits.
4. Leitura da documentação atualizada.
5. Inspeção estática das principais configurações e rotas do backend.
6. Comparação dos problemas apontados nas avaliações anteriores.
7. Aplicação das dimensões da rubrica IPIT.

Foram considerados os quatro níveis da rubrica: insuficiente, parcial, adequado e consistente.

**Limitação:** não foram executados testes integrados com serviços externos ou banco de dados de produção. As conclusões sobre funcionamento referem-se às evidências presentes no código e na documentação.

## 3. EVOLUÇÃO IDENTIFICADA

### 3.1. Interface e identidade visual

O repositório apresenta novos recursos associados à identidade visual do Book Hub.

Foram identificados arquivos específicos de tema, destaques da página inicial, imagens e elementos gráficos destinados ao catálogo e às reservas.

Essas alterações demonstram investimento na apresentação da solução.

Entretanto, a presença de novos recursos visuais não comprova, isoladamente, melhoria de usabilidade ou acessibilidade.

**Recomendação:** executar testes com usuários, incluindo navegação por teclado, contraste, responsividade e clareza das informações.

### 3.2. Documentação

O README foi ampliado e passou a apresentar uma descrição mais detalhada da proposta, da identidade do projeto e das funcionalidades declaradas.

Também foram encontrados os documentos:

- `avaliacao/analise_ipit`
- `avaliacao/RelatórioII.md`

A incorporação das devolutivas ao repositório constitui um avanço na rastreabilidade do diagnóstico.

Entretanto, há uma inconsistência que merece correção: o README atual descreve armazenamento em JSON e LocalStorage como parte da prototipação, enquanto o backend contém acesso ao PostgreSQL e migrações SQL.

A documentação também menciona recursos que precisam ser classificados de forma mais precisa quanto ao seu estágio de implementação.

**Recomendação:** atualizar o README para distinguir funcionalidades comprovadamente implementadas, integrações opcionais, recursos simulados e funcionalidades planejadas.

### 3.3. Desenvolvimento e versionamento

O histórico do GitHub demonstra continuidade de desenvolvimento, com alterações visuais, atualizações documentais e integração de mudanças.

Há evidência de utilização do GitHub Copilot em alguns commits, por meio dos registros de coautoria.

Esse registro contribui para a transparência, mas não substitui uma descrição crítica de como as sugestões de IA foram compreendidas, revisadas e validadas.

## 4. REAVALIAÇÃO DAS OITO ETAPAS IPIT

### Etapa 1 — Descoberta

**Resultado: Parcial**

O problema apresentado possui relevância para o contexto escolar.

O Book Hub procura melhorar a organização do acervo e facilitar a solicitação de livros.

Entretanto, ainda não há evidências suficientes de pesquisa com os usuários ou validação formal das necessidades identificadas.

**Correção:** documentar o problema, as necessidades levantadas, o público-alvo e os resultados da investigação.

### Etapa 2 — Ideação

**Resultado: Adequado quanto à proposta**

A solução apresenta coerência com o problema.

As funcionalidades de catálogo, reserva, gerenciamento e ranking demonstram uma proposta de valor reconhecível.

**Correção:** registrar alternativas consideradas, critérios de seleção e justificativas da solução.

### Etapa 3 — Solução

**Resultado: Parcialmente demonstrado**

O projeto possui interfaces e fluxos implementados.

As alterações recentes mostram evolução da apresentação visual.

Entretanto, permanecem pendentes evidências de validação da experiência com usuários.

**Correção:** elaborar um relatório de usabilidade, identificar dificuldades e registrar os ajustes efetuados.

### Etapa 4 — Tecnologia

**Resultado: Adequado com ressalvas**

As tecnologias são compatíveis com os requisitos gerais da aplicação.

Contudo, precisam ser corrigidas configurações relacionadas à segurança da conexão com o banco e ao controle de acesso.

**Correção:** revisar segurança, arquitetura, dependências e documentação técnica.

### Etapa 5 — MVP

**Resultado: Adequado, condicionado à validação**

O repositório contém a implementação das funcionalidades centrais de uma biblioteca escolar digitalizada.

Entretanto, ainda é necessário comprovar sua execução integrada.

**Correção:** executar o sistema em ambiente controlado e documentar os resultados de cada fluxo principal.

### Etapa 6 — Arquitetura

**Resultado: Parcial**

A estrutura apresenta separação das páginas, mas mantém grande concentração de responsabilidades no arquivo `server.js`.

O arquivo possui aproximadamente 2.950 linhas.

**Correção:** modularizar autenticação, administração, reservas, integrações e persistência de dados.

### Etapa 7 — Desenvolvimento

**Resultado: Parcial**

A equipe demonstra continuidade da implementação.

Entretanto, a versão atual mantém problemas técnicos que já haviam sido identificados.

Não foi encontrada uma suíte automatizada de testes na estrutura analisada.

**Correção:** priorizar segurança, implementar testes e documentar sua execução.

### Etapa 8 — Pitch e finalização

**Resultado: Não verificável integralmente**

A documentação permite compreender o objetivo e algumas características do projeto.

Entretanto, não foi identificado material suficiente para avaliar formalmente a apresentação final.

**Correção:** disponibilizar pitch, demonstração do MVP e retrospectiva do desenvolvimento.

---

## 5. MATRIZ DE PONTUAÇÃO IPIT

| Dimensão | Avaliação anterior | Avaliação atual | Fundamentação |
|---|---:|---:|---|
| Problema e público | 2 | 2 | Pesquisa com usuários insuficientemente documentada |
| Proposta de valor | 3 | 3 | Solução coerente com o problema |
| Protótipo/MVP | 3 | 3 | Implementação presente, validação pendente |
| Decisões técnicas | 3 | 3 | Stack adequada, com ressalvas arquiteturais |
| Testes e revisão | 1 | 1 | Testes formais insuficientemente evidenciados |
| Colaboração | N/A | N/A | Participação equilibrada não comprovada |
| Documentação | 3 | 4 | Ampliação dos registros técnicos e avaliativos |
| Uso de IA | 2 | 2 | Uso indicado, mas revisão crítica pouco documentada |
| Pitch | N/A | N/A | Apresentação não verificada |
| Ética e segurança | 2 | 2 | Permanência de problemas importantes |
| **Total avaliado** | **19/32** | **20/32** | **Evolução documental identificada** |

**Pontuação atual: 20/32 pontos.**

**Conversão proporcional: 6,25/10.**

**Resultado arredondado: 6,3/10.**

A conversão numérica é complementar à rubrica IPIT e não substitui a avaliação formativa. A classificação permanece provisória em razão da ausência de evidências suficientes para colaboração e pitch.

## 6. NÃO CONFORMIDADES TÉCNICAS

### NC-01 — Autorização das rotas administrativas

**Criticidade: Crítica**

**Arquivo:** `server.js`

**Localização:** linhas 1628–1734, aproximadamente.

As rotas de criação, edição e exclusão de livros permanecem sem verificação explícita de autorização nos handlers analisados.

**Implementação necessária:** criar mecanismo centralizado de autenticação e autorização, aplicável a todas as operações administrativas.

**Critério de aceite:** somente perfis autorizados conseguem modificar o acervo.

### NC-02 — Proteção dos endpoints de IA

**Criticidade: Alta**

**Arquivo:** `server.js`

**Localização:** linhas 2832–2850 e seguintes.

Os endpoints de preenchimento de dados bibliográficos ainda precisam de autenticação, autorização e controle de consumo.

**Implementação necessária:** proteger os endpoints, estabelecer limites por usuário e tratar falhas das integrações externas.

**Critério de aceite:** usuários não autorizados não conseguem utilizar operações restritas de IA.

### NC-03 — Validação TLS

**Criticidade: Alta**

**Arquivo:** `server.js`

**Localização:** linha 23.

Permanece a configuração:

`ssl: { rejectUnauthorized: false }`

Essa configuração desabilita a validação do certificado do servidor de banco de dados.

**Implementação necessária:** utilizar uma cadeia de certificados confiável e habilitar sua validação.

**Critério de aceite:** conexão PostgreSQL com certificado validado.

### NC-04 — CORS e proteção contra CSRF

**Criticidade: Alta**

**Arquivo:** `server.js`

**Localização:** linha 18.

Permanece a configuração genérica:

`app.use(cors())`

É necessário revisar a política de origens autorizadas e as proteções aplicáveis às operações autenticadas por cookies.

**Implementação necessária:** restringir origens conforme o ambiente, revisar sessões e incorporar proteção CSRF apropriada.

**Critério de aceite:** operações autenticadas protegidas contra requisições indevidas.

### NC-05 — Testes automatizados

**Criticidade: Alta**

O `package.json` apresenta o script `npm start`, mas não contém comando de testes.

**Implementação necessária:** configurar testes automatizados de autenticação, autorização, reservas, validação e integridade.

**Critério de aceite:** apresentar resultados reproduzíveis dos testes críticos.

### NC-06 — Organização do backend

**Criticidade: Média**

O backend permanece concentrado no arquivo `server.js`.

**Implementação necessária:** separar rotas, serviços, controladores e módulos de persistência.

**Critério de aceite:** preservar o funcionamento da aplicação após a refatoração.

### NC-07 — Consistência documental

**Criticidade: Média**

O README atual precisa representar com maior precisão a arquitetura implementada e o estágio dos recursos declarados.

**Implementação necessária:** revisar a descrição de PostgreSQL, LocalStorage, autenticação, IA e integrações Web3.

**Critério de aceite:** documentação correspondente ao código efetivamente disponibilizado.

---

## 7. PLANO DE CORREÇÃO

| Prioridade | Implementação | Evidência exigida |
|---|---|---|
| P0 | Autorização administrativa | Testes de acesso por perfil |
| P0 | Proteção dos endpoints de IA | Requisições indevidas bloqueadas |
| P1 | Validação TLS | Configuração segura e teste de conexão |
| P1 | Revisão de CORS e CSRF | Testes de segurança |
| P1 | Testes automatizados | Execução documentada |
| P2 | Modularização | Código organizado e testes de regressão |
| P2 | Correção do README | Documentação consistente |
| P2 | Registros IPIT | Evidências das etapas |
| P2 | Colaboração e retrospectiva | Registros verificáveis |
| P2 | Pitch | Apresentação e demonstração |

## 8. ANÁLISE PEDAGÓGICA

O Book Hub demonstra capacidade de articulação entre diferentes conhecimentos técnicos, especialmente desenvolvimento web, banco de dados, integração de sistemas e construção de interfaces.

A continuidade do projeto também evidencia oportunidades de aprendizagem relacionadas à melhoria incremental e à revisão das decisões de desenvolvimento.

Entretanto, a metodologia IPIT exige que essas aprendizagens sejam sustentadas por evidências.

A documentação de um problema não equivale à sua correção.

Da mesma forma, a implementação de funcionalidades não substitui a realização de testes e a avaliação de sua adequação às necessidades dos usuários.

Recomenda-se que cada correção realizada produza um registro contendo:

1. Problema identificado.
2. Análise de sua causa.
3. Solução proposta.
4. Alteração implementada.
5. Teste realizado.
6. Resultado obtido.
7. Aprendizado da equipe.

Esse procedimento permitirá avaliar o desenvolvimento de competências e a maturidade do processo de engenharia de software.

## 9. PARECER FINAL

A terceira avaliação do Book Hub identifica evolução documental e visual, com ampliação dos registros disponíveis no repositório.

O projeto apresenta uma solução tecnologicamente relevante e mantém funcionalidades coerentes com sua proposta.

Entretanto, as correções críticas recomendadas anteriormente ainda não foram comprovadamente implementadas.

A melhoria identificada na documentação justifica a revisão preliminar de pontuação de 6,0 para 6,3, segundo o critério complementar adotado nesta auditoria.

**Nota IPIT preliminar: 6,3/10.**

**Classificação: desempenho parcial, com avanços documentais e pendências técnicas prioritárias.**

Recomenda-se que o projeto avance para um ciclo de correção técnica e validação, seguido da apresentação de evidências de aprendizagem e demonstração funcional.

Uma nova avaliação deverá considerar os resultados efetivamente alcançados após as correções, sem pressupor melhoria apenas pela ampliação da documentação.

**Conclusão:** o Book Hub demonstra potencial de desenvolvimento, mas ainda necessita consolidar requisitos fundamentais de segurança, qualidade e validação para alcançar um nível consistente de maturidade técnica e metodológica.

---

**Referencial metodológico**

PEREIRA, Sandra Maria. *IPIT — Ideathon Pedagógico de Inovação Tecnológica*. Disponível em: https://github.com/smp-sandramariapereira/IPIT_origin

**Repositório avaliado**

BOOK HUB. *Book Hub — Hackathon Global*. Disponível em: https://github.com/Vnzada22/book-hub-hackathonglobal

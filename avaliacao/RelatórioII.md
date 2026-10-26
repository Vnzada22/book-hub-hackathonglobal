# RELATÓRIO DE REAVALIAÇÃO TÉCNICA E PEDAGÓGICA

## 1. Identificação

**Projeto:** Book Hub — Sistema de Gestão de Biblioteca

**Repositório:** https://github.com/Vnzada22/book-hub-hackathonglobal

**Metodologia:** IPIT — Ideathon Pedagógico de Inovação Tecnológica

**Autora da metodologia:** Sandra Maria Pereira

**Data:** 26/10/2026

**Versão analisada:** branch `main`, commit `605e12c`

**Modalidade:** Reavaliação por inspeção estática do código, documentação e histórico do GitHub.

## 2. Objetivo

Reavaliar o Book Hub de acordo com os critérios da metodologia IPIT, verificando:

- A qualidade da implementação tecnológica.
- A relação entre o problema identificado e a solução.
- A maturidade do MVP.
- As evidências das oito etapas do desenvolvimento.
- A documentação e o registro do trabalho colaborativo.
- As práticas de segurança e uso responsável de IA.
- O atendimento às recomendações técnicas anteriores.

Esta reavaliação considera a versão atualmente disponível no GitHub.

## 3. Avaliação das oito etapas do IPIT

### Etapa 1 — Descoberta

**Classificação: Parcial**

O projeto apresenta uma finalidade reconhecível: facilitar o acesso ao acervo de uma biblioteca física, disponibilizando informações e permitindo solicitações de pré-reserva.

A proposta demonstra conexão com uma situação concreta.

Entretanto, não foram encontrados registros suficientes de investigação com usuários que sustentem a definição do problema.

**Evidências necessárias:**

Pesquisa com usuários, descrição do contexto, identificação das necessidades e delimitação do problema.

**Parecer:** a necessidade é compreensível, mas sua investigação não está suficientemente demonstrada.

### Etapa 2 — Ideação

**Classificação: Adequada quanto à proposta; documentação processual parcial**

O Book Hub apresenta uma proposta coerente com o problema.

A aplicação integra catálogo, pré-reservas, administração do acervo, histórico de solicitações e ranking de leitores.

Existe correspondência entre as funcionalidades e o objetivo geral.

Entretanto, não foram identificados registros suficientes sobre alternativas consideradas e critérios de seleção da proposta.

**Parecer:** a solução possui coerência funcional, mas precisa documentar o processo de ideação.

### Etapa 3 — Solução

**Classificação: Parcialmente demonstrada**

O projeto contém interfaces para catálogo, autenticação, administração, perfil, reservas e ranking.

Essas interfaces indicam que o fluxo de interação foi implementado em código.

Contudo, a análise estática não comprova o funcionamento integrado de todos os componentes.

Também faltam evidências de testes de usabilidade, validação com usuários e evolução dos protótipos.

**Parecer:** há uma solução desenvolvida, mas sua validação ainda precisa ser comprovada.

### Etapa 4 — Tecnologia

**Classificação: Adequada, com ressalvas**

A arquitetura utiliza tecnologias compatíveis com a proposta:

- HTML, CSS e JavaScript para as interfaces.
- Node.js e Express para o backend.
- PostgreSQL para persistência dos dados.
- Serviços externos para consulta de informações bibliográficas.
- Integrações opcionais de autenticação e Inteligência Artificial.

O uso dessas tecnologias é coerente com a natureza do projeto.

Entretanto, a organização do backend e algumas configurações de segurança precisam ser aperfeiçoadas.

**Parecer:** escolhas tecnológicas pertinentes, mas ainda há fragilidades de arquitetura e proteção das informações.

### Etapa 5 — MVP

**Classificação: Adequada, pendente de validação executável**

O Book Hub contém código para funcionalidades centrais de uma aplicação de gerenciamento de biblioteca.

O escopo demonstra evolução além de uma proposta exclusivamente conceitual.

Entretanto, a equipe ainda precisa apresentar evidências de funcionamento integrado e critérios objetivos de aceitação.

**Parecer:** MVP implementado em código, mas não integralmente validado nesta auditoria.

### Etapa 6 — Arquitetura

**Classificação: Parcial**

A estrutura do projeto permite identificar interfaces, servidor e migrações do banco de dados.

Entretanto, o arquivo `server.js` concentra aproximadamente 2.943 linhas, reunindo diversas responsabilidades.

Essa centralização dificulta a manutenção, o isolamento de regras de negócio e os testes.

**Parecer:** arquitetura identificável, porém com oportunidades relevantes de modularização.

### Etapa 7 — Desenvolvimento

**Classificação: Parcial**

O repositório apresenta evolução por commits e contém implementações relacionadas ao funcionamento da aplicação.

Foi identificada uma pull request incorporada à branch principal.

Também foram identificados commits que registram o GitHub Copilot como coautor, indicando o uso dessa ferramenta no processo de desenvolvimento.

Entretanto, persistem os seguintes problemas:

**A. Autorização administrativa**

As rotas de criação, atualização e exclusão de livros permanecem sem verificação explícita de autorização nos respectivos handlers.

**B. Endpoints de IA**

As rotas de preenchimento automático não demonstram controle de acesso adequado.

**C. Segurança do banco**

Permanece a configuração `rejectUnauthorized: false`.

**D. Testes**

O `package.json` continua apresentando somente o script de inicialização, sem comando de testes.

**E. Organização**

O backend permanece concentrado em um arquivo principal.

**Parecer:** desenvolvimento técnico substancial, mas a etapa de testes, revisão e correção precisa ser fortalecida.

### Etapa 8 — Pitch e finalização

**Classificação: Não verificável integralmente**

O README apresenta informações úteis sobre a finalidade, as funcionalidades e a utilização do projeto.

O relatório IPIT também passou a integrar o repositório.

Entretanto, não foram encontrados materiais específicos que permitam avaliar o pitch, a demonstração final e a retrospectiva da equipe.

**Parecer:** documentação de apresentação do software disponível; avaliação do pitch pendente de evidências.

---

## 4. Matriz de pontuação IPIT

A rubrica original apresenta dez dimensões, avaliadas em quatro níveis.

A tabela representa a reavaliação preliminar baseada nas evidências disponíveis.

| Dimensão | Nota | Justificativa |
|---|---:|---|
| Problema e público | 2/4 | Necessidade identificável, mas investigação pouco documentada |
| Proposta de valor | 3/4 | Solução coerente com o contexto |
| Protótipo/MVP | 3/4 | Fluxos implementados, ainda sem validação integrada |
| Decisões técnicas | 3/4 | Tecnologias adequadas, com lacunas arquiteturais |
| Testes e revisão | 1/4 | Ausência de evidências formais suficientes |
| Colaboração | N/A | Histórico disponível, mas participação equilibrada não comprovada |
| Documentação | 3/4 | README e relatório técnico disponíveis |
| Uso de IA | 2/4 | Há indícios de uso, mas falta registro de revisão e validação |
| Pitch | N/A | Apresentação não disponibilizada |
| Ética e segurança | 2/4 | Cuidados parciais, com problemas importantes de autorização |
| **Total das dimensões pontuadas** | **19/32** | **Oito dimensões avaliáveis** |

### Cálculo da nota preliminar

A soma das dimensões pontuadas corresponde a 19 pontos de 32 possíveis.

Convertendo proporcionalmente para uma escala cujo máximo é 10:

**Nota = (19 ÷ 32) × 10 = 5,94**

**Nota preliminar arredondada: 6,0/10.**

Essa conversão é um critério complementar adotado nesta análise, não uma fórmula obrigatória da metodologia IPIT.

Como duas dimensões permanecem sem avaliação conclusiva, a pontuação não deve ser apresentada como nota definitiva das dez dimensões.

---

## 5. Verificação das correções solicitadas

A atualização mais recente incorporou o relatório de diagnóstico ao próprio repositório.

Não foram identificadas alterações no código-fonte correspondentes à correção dos principais problemas apontados.

| Correção solicitada | Situação |
|---|---|
| Implementar autorização nas rotas administrativas | Pendente |
| Proteger endpoints de IA | Pendente |
| Corrigir validação de certificado TLS | Pendente |
| Revisar CORS e proteção CSRF | Pendente de implementação e comprovação |
| Criar testes automatizados | Pendente |
| Modularizar o backend | Pendente |
| Registrar decisões e etapas IPIT | Parcial |
| Incorporar relatório de avaliação | Realizado |
| Documentar colaboração | Parcial |
| Apresentar pitch | Não verificado |

**Resultado:** o plano de correções foi documentado, mas sua execução técnica ainda não foi demonstrada.

## 6. Aspectos positivos

A análise reconhece os seguintes resultados:

**Desenvolvimento funcional:** o projeto contém uma quantidade relevante de código e funcionalidades diretamente relacionadas à proposta.

**Integração tecnológica:** existe articulação entre frontend, backend, persistência de dados e serviços externos.

**Modelagem de reservas:** foram identificados mecanismos de transação e prevenção de algumas operações duplicadas.

**Documentação:** o README apresenta informações de instalação, tecnologias, funcionalidades e limitações.

**Evolução do repositório:** o histórico demonstra atualizações no projeto.

**Reflexão sobre melhorias:** a inclusão do relatório de avaliação representa o início de um processo documentado de revisão.

Esses aspectos são relevantes para a avaliação formativa e devem ser preservados durante as correções.

## 7. Fragilidades prioritárias

### Segurança da informação

A ausência de autorização consistente nas operações administrativas constitui a principal fragilidade identificada.

A equipe precisa assegurar que somente usuários autorizados possam realizar alterações no acervo e executar operações administrativas.

### Qualidade do software

É necessário demonstrar a confiabilidade do sistema mediante testes reproduzíveis, cobrindo os fluxos principais e os cenários de erro.

### Arquitetura

A separação das responsabilidades do backend deve facilitar o desenvolvimento, a manutenção e a revisão do código.

### Documentação metodológica

As evidências das etapas IPIT precisam demonstrar não somente o que foi construído, mas como a equipe investigou, decidiu, implementou e aprendeu.

### Colaboração e autoria

O histórico de commits e a participação registrada em ferramentas de IA não substituem a demonstração da contribuição efetiva dos integrantes do projeto.

---

## 8. Recomendações para a próxima versão

Para uma nova avaliação, recomenda-se estabelecer quatro ciclos de trabalho.

**Ciclo 1 — Correção de segurança**

Implementar autorização, controle de acesso e proteção das integrações externas.

**Ciclo 2 — Validação funcional**

Executar testes das funcionalidades, registrar problemas e demonstrar as correções.

**Ciclo 3 — Aperfeiçoamento arquitetural**

Modularizar o backend, revisar a persistência e aprimorar a manutenção.

**Ciclo 4 — Consolidação metodológica**

Organizar os registros das oito etapas IPIT, apresentar as evidências de colaboração e realizar o pitch final.

Cada ciclo deverá produzir registros verificáveis no GitHub.

## 9. Parecer final

A reavaliação do Book Hub demonstra que o projeto possui uma base de implementação relevante e apresenta coerência entre a proposta e as tecnologias utilizadas.

Contudo, as correções técnicas prioritárias ainda não foram demonstradas na versão atual do código.

O acréscimo do relatório de avaliação ao repositório constitui uma melhoria documental, mas não é suficiente para comprovar a resolução das fragilidades identificadas.

Do ponto de vista pedagógico, a metodologia IPIT valoriza a aprendizagem que ocorre durante a investigação, o desenvolvimento, os testes e a revisão das soluções.

Portanto, recomenda-se que a equipe utilize o relatório recebido como instrumento de planejamento e execute as correções de maneira documentada.

**Resultado da reavaliação: 6,0/10 — nota preliminar mantida.**

**Situação:** projeto com implementação relevante, pendências técnicas prioritárias e necessidade de complementação das evidências metodológicas.

**Encaminhamento:** realizar as correções, apresentar testes, documentar o processo e solicitar nova avaliação.

O desenvolvimento de uma solução tecnológica não se encerra quando suas funcionalidades são implementadas. Sua qualidade depende também da segurança, da confiabilidade, da capacidade de manutenção e da validação de seu valor para os usuários.

Na perspectiva do IPIT, a etapa de correção constitui parte integrante da formação técnica e do desenvolvimento da autonomia dos estudantes.

# TSCQuestões

Banco de questões do ENADE de Tecnologia em Análise e Desenvolvimento de Sistemas (provas de 2008,
2011, 2014, 2017 e 2021) para os alunos da UESPI: questões avulsas, simulados com tempo, correção
automática das objetivas, autoavaliação das discursivas, desempenho por tema e um painel para o
administrador cuidar do conteúdo.

Next.js 16 (App Router e server actions), Prisma com PostgreSQL e Auth.js (Google institucional
para alunos, e-mail e senha para o administrador).

## Rodando no computador

Precisa de Node.js 20.9 ou mais novo, Docker, e para os testes de navegador o Google Chrome.

```bash
docker compose up -d          # Postgres na porta 5433 e Mailpit (e-mails de teste) na 8025
cp .env.example .env          # preencha; o .env nunca vai para o Git
npm install
npx prisma migrate deploy
npm run db:seed               # temas, admin de desenvolvimento e questões que faltarem
npm run dev                   # http://localhost:3000
```

O admin de desenvolvimento é `admin@tscquestoes.local` / `admin123`, em `/admin/entrar`.
Essa senha só existe no computador.

## Testes

| Comando                    | O que testa                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| `npm test`                 | regras isoladas (nota, publicação, e-mail, formatação, entradas)          |
| `npm run lint`, `npx tsc`  | lint e tipos (rode `npm run build` antes do `tsc`)                        |
| `npm run security:check`   | nenhum código cria ou promove ADMIN fora do seed                          |
| `npm run security:attack`  | ataques por HTTP (precisa do `npm run security:serve` no ar)              |
| `npm run security:browser` | CSP, formulários e painel num Chrome real (precisa do serve)              |
| `npm run qa:celular`       | telas em 360 e 390 px sem rolagem lateral (precisa do serve)              |
| `npm run qa:carga`         | vários usuários ao mesmo tempo (precisa do serve)                         |
| `npm run e2e:painel`       | cadastrar uma prova pelo painel até o aluno ver (sobe o próprio servidor) |
| `npm run security:google`  | modo só Google (sobe o próprio servidor)                                  |

`npm run security:serve` faz o build e sobe o site de teste em `localhost:3123`. O `e2e:painel`
usa o texto extraído dos PDFs; se `scripts/extract/raw/` não existir, ele roda
`npm run extract:raw`, que precisa do `pdftotext` (pacote poppler).

## Pastas

| Pasta                                              | O que tem                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `app/`                                             | páginas, rotas e server actions                                         |
| `components/`                                      | componentes de tela                                                     |
| `lib/`                                             | regras do sistema, acesso ao banco e testes unitários                   |
| `prisma/`                                          | modelo do banco, migrations e seed                                      |
| `scripts/extract/`                                 | extração das questões dos PDFs (rascunhos revisados em `drafts/`)       |
| `scripts/security/`, `scripts/qa/`, `scripts/e2e/` | testes que precisam do site rodando                                     |
| `scripts/deploy/`, `deploy/`                       | pacote de produção e publicação na VPS da LES (ver `deploy/LEIA-ME.md`) |
| `ProvasEnadeADS/`                                  | PDFs oficiais das provas, gabaritos e padrões de resposta               |

A documentação completa (`docs/SISTEMA.md`, `docs/ARQUITETURA.md`, `docs/TAREFAS.md`) fica fora do
Git, na pasta `docs/` de cada computador.

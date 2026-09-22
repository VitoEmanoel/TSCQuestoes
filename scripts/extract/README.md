# Pipeline de extração

Converte os PDFs de `ProvasEnadeADS/` em questões no banco de dados. Fluxo completo em
`docs/ARQUITETURA.md`, seções 5 e 5.1.

- `parsers/{ano}.ts` — um parser por ano, gera rascunhos a partir do texto extraído do PDF.
- `drafts/{ano}/{label}.json` — rascunho de cada questão, revisado manualmente antes do seed.
- `validate.ts` — valida os rascunhos antes de irem para o banco.

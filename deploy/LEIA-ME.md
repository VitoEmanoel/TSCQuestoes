# Publicação na LES Web Services

O pacote é montado no computador de desenvolvimento e só o resultado pronto vai para a VPS.
A VPS roda o site na porta 80; a LES coloca o HTTPS na frente.

## No seu computador

```bash
npm run release -- https://SEUNOME.cloud.deploy.uespi.br
npm run release:conteudo
```

O primeiro comando exige tudo commitado e gera `release/tscquestoes-<commit>.tar.gz`.
O segundo exporta do banco de desenvolvimento só provas, questões, alternativas, padrões,
temas e imagens (sem nenhuma conta) para `release/conteudo.tar.gz`.

## Primeira vez

1. VPN da LES ligada, e `ssh aluno@IP-DA-VPS` funcionando.
2. `npm run publicar -- aluno@IP-DA-VPS` — instala Node, usuário, pastas e serviço, e cria
   `/etc/tscquestoes/ambiente` já com um `AUTH_SECRET` novo.
3. Na VPS, preencha o arquivo (sem colar esses valores em chat nenhum):
   `sudo nano /etc/tscquestoes/ambiente`
   - `DATABASE_URL`: a string de conexão do banco da LES
   - `ADMIN_SEED_EMAIL` e `ADMIN_SEED_PASSWORD` (mínimo 14 caracteres)
   - `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`
   - Os `SMTP_*` podem ficar vazios: com `STUDENT_PASSWORD_AUTH="off"` (padrão do modelo),
     estudantes entram só com Google e nenhum e-mail é enviado. Para ligar o cadastro por senha,
     configure o SMTP e troque para `STUDENT_PASSWORD_AUTH=""`
4. `npm run publicar -- aluno@IP-DA-VPS` de novo — aplica as migrations e põe o site no ar.
5. `npm run publicar -- aluno@IP-DA-VPS conteudo` — carrega as provas e cria o administrador
   (só funciona com o banco vazio).

## Atualizações

```bash
npm run release -- https://SEUNOME.cloud.deploy.uespi.br
npm run publicar -- aluno@IP-DA-VPS
```

Se a versão nova não responder em 30 segundos, o script volta sozinho para a anterior.
As três últimas versões ficam em `/opt/tscquestoes/versoes`.

## No servidor

| O quê                        | Onde                           |
| ---------------------------- | ------------------------------ |
| Configuração e segredos      | `/etc/tscquestoes/ambiente`    |
| Imagens enviadas pelo painel | `/var/lib/tscquestoes/uploads` |
| Backups diários (14 dias)    | `/var/backups/tscquestoes`     |
| Versão no ar                 | `/opt/tscquestoes/atual`       |

- Ver o log: `journalctl -u tscquestoes -f`
- Reiniciar: `systemctl restart tscquestoes`
- Backup agora: `systemctl start tscquestoes-backup`

Os backups ficam na própria VPS; baixe-os de vez em quando e use também os "pontos salvos"
da LES.

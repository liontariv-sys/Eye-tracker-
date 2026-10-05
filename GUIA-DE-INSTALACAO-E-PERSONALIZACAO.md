# LPNeC Oculab — código-fonte

Este pacote contém o código-fonte completo da versão 15 do LPNeC Oculab. Nenhuma senha, chave de API ou banco de dados da versão publicada foi incluído.

O identificador da hospedagem original também foi removido. Não reutilize o projeto publicado do laboratório ao configurar outra hospedagem.

## Executar localmente

Requisitos:

- Node.js 22 ou superior;
- npm.

No terminal, dentro da pasta do projeto:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Depois, abra o endereço exibido no terminal.

`OCULAB_DEV_BYPASS=true` libera somente o núcleo do tabulador para desenvolvimento local. Nesse modo, a tela de login e o painel administrativo ficam desativados. Não use essa configuração em uma publicação que precise restringir o acesso.

## Alterar o nome e a identidade visual

Os principais pontos estão nestes arquivos:

- `app/layout.tsx`: título e descrição que aparecem no navegador;
- `components/access-gate.tsx`: nome mostrado na tela de acesso;
- `components/oculab-workspace.tsx`: textos e cabeçalhos da aplicação;
- `public/manifest.webmanifest`: nome da aplicação instalável;
- `public/brand/`: logotipo e imagens da marca;
- `app/globals.css`: cores, fontes, espaçamentos e responsividade.

Para localizar todas as ocorrências do nome atual:

```bash
rg -n "LPNeC Oculab|Oculab|LPNeC" app components public README.md
```

## Hospedar no Cloudflare

O motor de tabulação e a geração do Excel funcionam no navegador. Esta versão foi adaptada para executar diretamente no Cloudflare e usa:

- sessão administrativa assinada, protegida por e-mail e senha;
- banco D1 para autorizações;
- variáveis protegidas do servidor;
- envio de e-mail pelo Resend.

Crie um banco D1 chamado `lpnec-oculab-db` e copie o identificador para `database_id` em `wrangler.jsonc`. Depois, configure no Worker:

- `OCULAB_OWNER_EMAIL`: e-mail exclusivo do administrador;
- `OCULAB_ADMIN_PASSWORD`: senha administrativa forte, com pelo menos 12 caracteres;
- `OCULAB_SESSION_SECRET`: sequência aleatória com pelo menos 32 caracteres;
- `OCULAB_NOTIFICATION_EMAIL`: endereço que receberá os pedidos;
- `RESEND_API_KEY` e `ACCESS_EMAIL_FROM`: opcionais, para avisos por e-mail.

Nunca coloque senhas ou chaves dentro do repositório.

O Cloudflare fornece um endereço gratuito `workers.dev`. Um domínio independente, como `oculablpnec.com.br`, precisa ser registrado e depois apontado para a hospedagem.

## Verificar o projeto

```bash
npm test
```

O pacote foi entregue após build bem-sucedido e 22 testes automatizados aprovados.

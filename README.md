# LPNeC Oculab

Aplicativo web do LPNeC/UFPB para importar, mapear, limpar, tabular, auditar e exportar dados de eye tracking. O processamento ocorre no navegador; os arquivos brutos não são enviados a um servidor.

## Fluxo

1. Importe CSV, TSV, XLS ou XLSX e escolha a aba de dados.
2. Mapeie qualquer nomenclatura de origem para os campos semânticos do motor.
3. Configure desenho transversal ou longitudinal, unidades, grupos, momentos, métricas e formato de saída.
4. Revise Nível 1, Nível 2 longo/amplo, gráfico descritivo e auditoria.
5. Exporte um workbook com dados, auditoria e configuração reprodutível.

## Arquitetura

```text
app/
  layout.tsx                 Metadados e idioma
  page.tsx                   Rota principal
  globals.css                Sistema visual e responsividade
components/
  oculab-workspace.tsx       Fluxo completo da interface
  ui/                        Primitivos acessíveis
lib/eye/
  types.ts                   Contratos de dados e configuração
  io.ts                      Leitura, detecção de colunas e exportação XLSX
  engine.ts                  Sanitização, eventos, pareamento, agregação e auditoria
```

## Regras metodológicas implementadas

- Pupila esquerda/direita é convertida para número; valores `≤ 0` tornam-se ausentes antes de qualquer média.
- Duração pode entrar em segundos ou milissegundos e é convertida explicitamente para a unidade de saída.
- Amostras contíguas com o mesmo ID são consolidadas como um evento; sem ID, cada sequência contígua do mesmo tipo forma um evento.
- Uma fixação é pareada somente quando o próximo evento consolidado, no mesmo participante/momento/estímulo/tentativa, é uma sacada.
- A sacada emparelhada fornece duração e amplitude e não é reutilizada.
- O Nível 1 mantém todas as fixações e sacadas válidas em ordem. Pares fixação–sacada compartilham uma linha; sacadas sem pareamento recebem uma linha com os campos de fixação vazios. As contagens aparecem somente na primeira linha do contexto e as demais recebem `.`.
- No desenho longitudinal, o produto cartesiano participante × momentos esperados preserva linhas vazias.
- O Nível 2 calcula contagens, média e desvio-padrão amostral e pode sair em formatos longo e amplo.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local
npm run dev
npm run build
```

Para executar o núcleo do aplicativo fora do ChatGPT Sites, consulte `GUIA-DE-INSTALACAO-E-PERSONALIZACAO.md`.

## Publicação no Cloudflare

O projeto inclui um Worker compatível com Cloudflare, banco D1 para solicitações de acesso e uma sessão administrativa assinada. Antes da primeira implantação:

1. crie um banco D1 chamado `lpnec-oculab-db`;
2. substitua o `database_id` provisório em `wrangler.jsonc` pelo identificador do banco;
3. configure os segredos `OCULAB_ADMIN_PASSWORD` e `OCULAB_SESSION_SECRET` no Worker;
4. configure `OCULAB_OWNER_EMAIL` e, se desejar notificações, as variáveis do Resend;
5. use `npm run build` como comando de build e `npm run deploy:cloudflare` como comando de implantação.

Não salve senhas, chaves ou segredos no GitHub.

## Decisões de segurança e escopo

- Não há persistência de dados identificáveis nem upload para backend.
- Presets de configuração são arquivos JSON locais compartilháveis entre pesquisadores.
- O motor não infere a unidade temporal: o pesquisador precisa confirmá-la para evitar interpretar `0,400 s` como `0,400 ms`.
- Gráficos são descritivos e não substituem análises inferenciais em SPSS, JASP, R ou Python.

# FASE 11 — Página de documentação da API (`web/api.html`)

> **Para o agente executor**: leia `00_LEIA_PRIMEIRO.md`. Esta fase é só
> frontend estático + 1 link de navegação — não altera API nem banco.
> Regra anti-alucinação: TODO endpoint, parâmetro e exemplo de resposta
> documentado nesta página deve ser conferido contra `api\openapi.yaml` e
> testado com `curl` antes de entrar no HTML. Nada de endpoint inventado.
> Se a fase 10 já tiver sido executada, inclua os parâmetros novos
> (`velocidade`, `categorias`, `/cidades/:id/moreno`); senão, documente o
> que existe.

## 11.0 Objetivo

Uma página pública, legível por desenvolvedores de qualquer nível, que
apresenta a API como PRODUTO: o que ela oferece, como começar em 1 minuto
e como integrar aos próprios projetos. O Swagger (`/api/docs`) continua
sendo a referência técnica interativa; a `api.html` é a porta de entrada
amigável (o Swagger é árido para iniciantes).

## 11.1 Estrutura da página (nesta ordem)

1. **Hero**: título "API de Alcançabilidade Urbana", uma frase do que ela
   faz, URL base em bloco de código `http://localhost:3000/api/v1` com
   nota: "em produção, substitua pelo domínio da plataforma". Botões:
   "Documentação interativa (Swagger)" → `/api/docs` e "Testar agora" →
   âncora do quickstart.
2. **Comece em 1 minuto (quickstart)**: três blocos de código com abas ou
   seções empilhadas — cURL, JavaScript (fetch) e Python (requests) — todos
   fazendo a MESMA chamada: listar cidades e consultar a alcançabilidade de
   um ponto. Código completo e executável (copiar e colar funciona).
3. **Conceitos em 30 segundos**: 4 cards curtos — Cidade (área processada),
   Nó (esquina da malha viária), Categoria (tipo de serviço, com a lista
   das chaves válidas), Índice (0–100, % de categorias alcançáveis em
   15 min).
4. **Referência de endpoints**: tabela com método, caminho, para que serve
   (1 linha) e parâmetros; abaixo dela, UMA seção detalhada por endpoint
   com exemplo de requisição e resposta REAL (JSON obtido via curl contra o
   banco local — abreviar arrays longos com `...`). Endpoints a cobrir:
   `/saude`, `/cidades`, `/cidades/:id`, `/cidades/:id/servicos`,
   `/cidades/:id/isocronas`, `/cidades/:id/mapa`, `/alcancabilidade`,
   `/rota`, `/comparar`, `/processamentos` (POST + GET atual) e, se a fase
   10 existir, `/cidades/:id/moreno`.
5. **Receita completa: mapa em 20 linhas**: exemplo integrando a API a um
   projeto de terceiros — HTML mínimo com Leaflet que consome
   `/cidades/:id/isocronas` e desenha o polígono. Código completo,
   testado de verdade antes de publicar (abrir o HTML e ver o polígono).
6. **Fluxo "adicionar uma cidade via API"**: sequência POST
   `/processamentos` → polling GET `/processamentos/atual` → consumir a
   cidade nova; diagrama textual simples das 3 setas + snippet JS com o
   polling.
7. **Boas práticas e limites**: rate limit (100 req/15 min por IP — cite o
   valor real do `app.js`), CORS aberto para leitura, erros sempre em JSON
   `{erro, codigo}`, versionamento `/api/v1` (mudanças incompatíveis virão
   em `/v2`).
8. **Licenças e atribuição**: dados derivados do OpenStreetMap © OpenStreetMap
   contributors, licença ODbL — quem integrar DEVE manter a atribuição;
   citação acadêmica sugerida do TCC (autores, título, UNIP, 2026).

## 11.2 Implementação

- Arquivo único `web\api.html` usando o MESMO header/nav e `estilo.css`
  das outras páginas; acrescente o link **API** na navegação de TODAS as
  páginas (`index.html`, `comparar.html`, `sobre.html`, `api.html`).
- Blocos de código: `<pre><code>` com fundo escuro (#0f172a), fonte mono,
  botão "Copiar" por bloco (JS de ~5 linhas com
  `navigator.clipboard.writeText`; fallback silencioso se indisponível).
- Sem bibliotecas novas; sem framework; responsivo como as demais páginas.
- Os JSONs de exemplo devem ser reais: rode cada curl contra a API local e
  cole a resposta (encurtada onde for longa). Não escreva JSON de cabeça.

## 11.3 Validação manual

1. Abrir `http://localhost:3000/api.html`: navegação funciona nas 4
   páginas; botão Copiar copia; nenhum erro no console.
2. Colar o quickstart de cURL num terminal → funciona.
3. Colar a "receita do mapa em 20 linhas" num arquivo novo fora do projeto
   → abre e desenha o polígono.
4. Conferir endpoint a endpoint contra o Swagger: mesma lista, mesmos
   parâmetros.

## 11.4 Critérios de aceite

- [ ] `api.html` com as 8 seções da 11.1, exemplos reais testados
- [ ] Link "API" no header das 4 páginas
- [ ] Botões de copiar funcionando; página responsiva
- [ ] Receita Leaflet standalone testada fora do projeto
- [ ] Atribuição ODbL presente; commit feito; PROGRESSO atualizado

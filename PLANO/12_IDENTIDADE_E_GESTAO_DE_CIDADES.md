# FASE 12 — Identidade canônica de cidades + gestão (atualizar/excluir)

> **Para o agente executor**: leia `00_LEIA_PRIMEIRO.md`. Esta fase elimina
> a raiz das cidades duplicadas ("Guarujá, Brasil" ≠ "Guarujá, Brazil") e
> ambíguas ("Santos," → qual Santos?): a cidade passa a ser identificada
> pelo **osm_id do limite administrativo** (número único mundial do
> OpenStreetMap), não pelo texto digitado. Também adiciona atualizar e
> excluir cidades pela interface. Execute ANTES da fase 13 (a vitrine
> depende do fluxo de geocodificação criado aqui).

## 12.0 Fluxo final do usuário

1. Clica "+ Adicionar nova cidade..." → digita QUALQUER texto ("Santos,"
   "guaruja", "Paris") → botão **Buscar**.
2. O sistema consulta o Nominatim (geocodificador oficial do OSM) e mostra
   até 5 candidatos com nome COMPLETO e sem ambiguidade — ex.:
   "Santos, Região Imediata de Santos, São Paulo, Brasil (município)".
3. O usuário escolhe o candidato → só então o processamento começa. O que
   identifica a cidade dali em diante é o `osm_id` do limite — digitar
   "Brasil" ou "Brazil" depois cai NA MESMA cidade (`ja_processada`).
4. Um botão "Gerenciar cidades" abre um modal com a lista e, por cidade:
   **Atualizar dados** (rebaixa do OSM e reprocessa) e **Excluir** (com
   confirmação).

## 12.1 Banco — colunas de identidade canônica

Adicionar ao `db\schema.sql` (e aplicar com `ALTER TABLE` no banco vivo,
pois `CREATE TABLE IF NOT EXISTS` não altera tabela existente):

```sql
ALTER TABLE cidade ADD COLUMN IF NOT EXISTS osm_limite_tipo TEXT;     -- 'relation' | 'way'
ALTER TABLE cidade ADD COLUMN IF NOT EXISTS osm_limite_id  BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cidade_osm_limite
  ON cidade (osm_limite_tipo, osm_limite_id)
  WHERE osm_limite_id IS NOT NULL;
```

**Backfill das cidades existentes** (uma vez): para cada linha de `cidade`,
chame o endpoint de geocodificação da seção 12.2 com a `consulta_osm` atual
e grave tipo/id do primeiro resultado. Escreva um script Node único
(`api\scripts\backfill_osm_id.js`) que faz isso com 1 s de pausa entre
chamadas e imprime o que gravou. Confira no psql que as 4 cidades ficaram
com `osm_limite_id` preenchido e distintos.

## 12.2 API — geocodificação prévia

### `GET /api/v1/geocodificar?q=texto`
- Valida `q` (3–120 chars, mesmo charset da fase 08).
- Chama `https://nominatim.openstreetmap.org/search` com query params:
  `format=jsonv2`, `q=<texto>`, `limit=5`, `addressdetails=1`,
  `accept-language=pt-BR`, e headers obrigatórios pela política do
  Nominatim: `User-Agent: Plataforma-Alcancabilidade-TCC/1.0` — sem esse
  header o serviço bloqueia.
- Filtre os resultados para nível de cidade: manter apenas
  `osm_type in ('relation','way')` E (`class == 'boundary'` OU
  `class == 'place'`). Mapeie para:
  ```json
  { "osm_tipo": "relation", "osm_id": 298285, "nome_exibicao": "<display_name completo>",
    "tipo": "<addresstype ou type>", "ja_processada": false, "cidade_id": null }
  ```
  Marque `ja_processada`/`cidade_id` consultando `cidade` por
  (osm_limite_tipo, osm_limite_id).
- Cache em memória por `q` normalizado (24 h). Erros do Nominatim → 502
  com mensagem amigável ("Serviço de busca indisponível; tente em
  instantes").
- Nunca chame o Nominatim mais de 1×/segundo: serialize com uma fila
  simples (uma Promise encadeada module-level basta).

### `POST /api/v1/processamentos` (alterar)
- Novo body: `{ osm_tipo, osm_id, nome_exibicao }` (o texto livre
  `consulta_osm` continua aceito por retrocompatibilidade, mas o frontend
  passa a enviar SEMPRE o trio canônico).
- Duplicata: se existe cidade com o mesmo (osm_tipo, osm_id) → 200
  `ja_processada`.
- Spawn do CLI com os argumentos novos (12.3):
  `--osm-tipo relation --osm-id 298285 --nome "<nome_exibicao>"`.

### Gestão
- `DELETE /api/v1/cidades/:id` → apaga a cidade (CASCADE limpa tudo);
  404 se não existe; 409 se houver processamento em andamento DESSA cidade.
  Resposta: `{ removida: true, nome }`.
- `POST /api/v1/cidades/:id/reprocessar` → enfileira o MESMO job da fase 08
  usando os dados canônicos da cidade (ou `consulta_osm` legada se as
  colunas novas forem NULL); 409 se já há job rodando. O reprocessamento
  usa `--sem-cache-grafo`? NÃO — para "buscar dados atualizados do OSM" é
  preciso rebaixar: acrescente ao CLI a flag `--atualizar` que IGNORA o
  GraphML em cache e rebaixa grafo e serviços (o cache do OSMnx em
  `cache_osm\` também deve ser contornado: `ox.settings.use_cache = False`
  quando `--atualizar`). O reprocessar da API sempre envia `--atualizar`.
- **Proteção opcional**: se a variável de ambiente `ADMIN_TOKEN` estiver
  definida no `.env`, os endpoints DELETE e reprocessar exigem header
  `X-Admin-Token` igual; sem a variável, ficam abertos (uso local).
  Documentar no openapi.yaml.

## 12.3 Python CLI — processar por osm_id

Novos argumentos (mantendo `--place` para retrocompatibilidade):
```
--osm-tipo relation|way   --osm-id 298285   --nome "Santos, São Paulo, Brasil"   [--atualizar]
```
Implementação em `graph.py`/`cli.py`:
```python
codigo = ("R" if osm_tipo == "relation" else "W") + str(osm_id)
gdf = ox.geocode_to_gdf(codigo, by_osmid=True)
poligono = gdf.geometry.iloc[0]
G = ox.graph_from_polygon(poligono, network_type="walk")
# serviços: ox.features_from_polygon(poligono, tag)
```
- O slug do cache do grafo passa a ser `f"{osm_tipo}_{osm_id}"` quando o
  trio canônico é usado.
- `db.py`: gravar `osm_limite_tipo/osm_limite_id` e usar como chave do
  upsert (DELETE por osm_limite quando presente; fallback consulta_osm).
  `nome`/`pais`: derive do `--nome` (primeiro segmento antes da vírgula =
  nome; último = país) — e NUNCA mais grave país vazio: se não houver
  vírgula, use o próprio nome e deixe pais = '' registrando warning.
- Serviços por polígono: `features_from_polygon` substitui
  `features_from_place` no fluxo canônico.

## 12.4 Frontend

### Modal de adicionar cidade (refazer o passo 1 da fase 08)
- Passo A — busca: input + botão Buscar → `GET /geocodificar` → cards de
  rádio com `nome_exibicao` completo e o `tipo` como sub-rótulo
  ("município", "cidade", "8ª subdivisão administrativa"...). Candidato
  `ja_processada` → card desabilitado com selo "já está na plataforma"
  (clicar seleciona a cidade existente e fecha).
- Passo B — confirmação: "Processar **<nome_exibicao>**?" → POST → barra
  de progresso da fase 08 (inalterada). (A fase 13 insere a vitrine entre
  A e B.)
- Nenhum texto livre vai mais direto para o processamento.

### Modal "Gerenciar cidades"
- Botão de engrenagem ao lado do seletor de cidade → lista: nome completo
  (`consulta_osm`), nº de nós, data do último cálculo, e botões
  **Atualizar** e **Excluir**.
- Excluir: confirmação com o nome ("Excluir Guarujá? Esta ação remove
  todos os dados processados.") → DELETE → recarrega lista/seletor.
- Atualizar: dispara reprocessar → entra no modo progresso padrão; ao
  concluir, recarrega a cidade.

## 12.5 Testes

- vitest: `GET /geocodificar?q=x` (mock? NÃO — teste real com
  `q=Praia Grande` aceitando ≥1 resultado com osm_id numérico; marque como
  teste que exige rede); `POST /processamentos` com osm_tipo inválido →
  400; `DELETE /cidades/999999` → 404.
- Manual: adicionar "Santos," → escolher o município de SP na lista →
  processar → conferir `osm_limite_id` no banco; tentar adicionar
  "Santos, São Paulo, Brasil" → deve cair em `ja_processada` (mesmo
  osm_id) SEM criar duplicata — este é o teste-chave da fase.
- Manual: excluir uma cidade de teste e conferir que sumiu do banco e do
  seletor; atualizar uma cidade e conferir `data_calculo` nova.

## 12.6 Critérios de aceite

- [ ] Impossível processar sem passar pela escolha do candidato Nominatim
- [ ] Duplicata por grafia diferente bloqueada pelo osm_id único (testado)
- [ ] Backfill das cidades existentes concluído (4/4 com osm_limite_id)
- [ ] Excluir e Atualizar funcionais na interface, com confirmação
- [ ] `--atualizar` de fato rebaixa dados (cache ignorado)
- [ ] openapi.yaml + testes atualizados; commit; PROGRESSO atualizado

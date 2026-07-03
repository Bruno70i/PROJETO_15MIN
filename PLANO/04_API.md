# FASE 04 — API REST pública (Node.js + Express) — inclui CONTRATO Nº 2

Objetivo: API que expõe os dados do banco para o frontend e para terceiros,
com documentação Swagger em `/api/docs`. Tudo somente leitura (o
processamento de cidades é feito pelo CLI Python).

## 4.1 Bootstrap

```powershell
Set-Location "C:\Users\User\Downloads\TCC\PROJETO_15MIN\api"
npm init -y
npm install express pg cors helmet morgan express-rate-limit dotenv swagger-ui-express yaml
npm install --save-dev vitest supertest
```

`package.json` — acrescente:
```json
"type": "module",
"scripts": {
  "dev": "node src/server.js",
  "test": "vitest run"
}
```

## 4.2 Estrutura

```
api\
├── openapi.yaml          ← contrato (seção 4.4)
├── src\
│   ├── server.js         ← sobe o app (porta .env API_PORT, default 3000)
│   ├── app.js            ← monta express: helmet, cors(*), morgan('tiny'),
│   │                       rate-limit (100 req/15min por IP), json,
│   │                       /api/docs (swagger-ui lendo openapi.yaml),
│   │                       rotas v1, handler 404 e handler de erro JSON
│   ├── db.js             ← Pool do pg lendo ..\..\.env (dotenv path)
│   └── routes\
│       ├── cidades.js
│       ├── alcancabilidade.js
│       └── isocronas.js
└── tests\api.test.js
```

Handler de erro padrão (todas as respostas de erro neste formato):
```json
{ "erro": "mensagem clara em português", "codigo": 404 }
```

## 4.3 Endpoints (comportamento exato)

Base: `http://localhost:3000/api/v1`

| # | Rota | Descrição |
|---|---|---|
| 1 | `GET /cidades` | Lista cidades processadas: `[{id, nome, pais, consulta_osm, data_calculo, qtd_nos, limiar_minutos, indice_geral}]` (indice_geral = `indice_cidade.indice` da categoria 0) |
| 2 | `GET /cidades/:id` | Detalhe + array `indices` (uma linha por categoria, com `chave`, `rotulo`, `cor_hex`, `tempo_medio_min`, `pct_dentro_limiar`, `indice`). 404 se não existir |
| 3 | `GET /cidades/:id/servicos?categoria=saude` | GeoJSON `FeatureCollection` de Points (properties: `id`, `nome`, `categoria`, `rotulo`). Sem `categoria` → todas (limite 5000 features; acima disso responda 400 pedindo filtro) |
| 4 | `GET /cidades/:id/isocronas?categoria=saude&minutos=15` | GeoJSON da tabela `isocrona`. `minutos` opcional (default 15). 404 se não houver |
| 5 | `GET /cidades/:id/mapa?categoria=saude&max=3000` | Amostra de nós para camada de calor: `[{lat, lon, tempo_min, dentro_limiar}]`. `max` default 3000: se a cidade tem mais nós, faça amostragem com `ORDER BY random() LIMIT $max` — documente que é amostra |
| 6 | `GET /alcancabilidade?cidade_id=1&lat=-24.0058&lon=-46.4028` | **Endpoint principal.** Acha o nó mais próximo (SQL da fase 02 §2.4), retorna: `{no: {osm_id, lat, lon, distancia_m}, indice_ponto, categorias: [{chave, rotulo, cor_hex, tempo_min, dentro_limiar, servico_mais_proximo: {id, nome, lat, lon} | null}]}`. `indice_ponto` calculado na hora (mesma fórmula do metrics.py). 404 com mensagem se o ponto está fora da área |
| 7 | `GET /comparar?cidades=1,2,3` | `[{cidade: {...}, indices: [...]}]` para até 5 cidades; 400 acima disso |
| 8 | `GET /saude` | Health check: `{status: "ok", banco: true/false}` (tenta `SELECT 1`) |

Validações: `:id` e `cidade_id` inteiros (400 se não); `lat` ∈ [-90,90],
`lon` ∈ [-180,180]; `categoria` deve existir em `categoria_servico.chave`
(400 com lista das válidas).

## 4.4 `openapi.yaml` (contrato — escreva ANTES das rotas)

Escreva `api\openapi.yaml` OpenAPI 3.0 cobrindo os 8 endpoints acima:
`info` (title "API de Alcançabilidade Urbana — Cidade de 15 Minutos",
version 1.0.0, description com 2 frases e a licença de dados ODbL/OSM),
`servers` (`http://localhost:3000/api/v1`), um `path` por rota com
parâmetros tipados, exemplos de resposta 200 concretos (copie os formatos da
tabela 4.3) e o schema de erro. O subagente do frontend desenvolve contra
este arquivo — capriche nos exemplos.

## 4.5 Testes (`tests\api.test.js`)

Pré-requisito: banco com a cidade de teste processada (fase 03). Use
supertest contra o `app` exportado (sem subir servidor):

1. `GET /api/v1/saude` → 200, `banco: true`
2. `GET /api/v1/cidades` → 200, array com ≥ 1 cidade e campo `indice_geral`
3. `GET /api/v1/cidades/999999` → 404 com `{erro}`
4. `GET /api/v1/alcancabilidade?...` com lat/lon do centro da cidade de
   teste → 200; `categorias.length ≥ 1`; todo `tempo_min ≥ 0` ou null
5. `GET /api/v1/alcancabilidade?lat=0&lon=0&cidade_id=1` → 404 (fora da área)
6. `GET /api/v1/cidades/1/servicos?categoria=inexistente` → 400 listando as
   chaves válidas

## 4.6 Critérios de aceite da fase

- [ ] `npm run dev` sobe; os 8 endpoints respondem conforme a tabela
- [ ] `/api/docs` renderiza o Swagger com os 8 endpoints e exemplos
- [ ] `npm test` verde
- [ ] Nenhuma credencial hardcoded (tudo via .env)
- [ ] Commit + PROGRESSO.md

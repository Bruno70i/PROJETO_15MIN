# FASE 13 — Vitrine de serviços: escolher o que baixar, cidade a cidade

> **Para o agente executor**: leia `00_LEIA_PRIMEIRO.md` e execute a fase
> 12 ANTES (a vitrine usa o osm_id canônico da cidade). O coração desta
> fase é o Catálogo Mestre da seção 13.2 — as tags, rótulos e cores estão
> DEFINIDOS ali; não invente tags do OSM nem renomeie chaves. O frontend
> permanece HTML/CSS/JS puro: o dinamismo necessário é criação de DOM que
> o projeto já faz em todo lugar — NÃO migre para Nuxt/Vue.

## 13.0 Fluxo final do usuário

1. Adicionar cidade → busca e escolhe o lugar (fase 12).
2. **Vitrine**: o sistema consulta o OpenStreetMap e mostra, em grupos,
   apenas os serviços do Catálogo Mestre que EXISTEM naquela cidade, com a
   quantidade de cada um ("Padarias (27)", "Hospitais (3)"). Os 12 serviços
   padrão do projeto vêm pré-marcados.
3. O usuário marca/desmarca o que interessa → **Processar** → barra de
   progresso (fase 08). Só o que foi marcado é baixado e calculado.
4. Dali em diante, a interface daquela cidade mostra SOMENTE as categorias
   processadas para ela (painéis, checkboxes, heatmap, Moreno).
5. "Atualizar dados" de uma cidade (fase 12) reabre a vitrine pré-marcada
   com as categorias atuais da cidade.

## 13.1 Decisões fechadas

| Tema | Decisão |
|---|---|
| Descoberta do que existe | UMA requisição ao Overpass API com múltiplos `out count` (não baixa geometria — só conta; rápido e leve) |
| O que aparece na vitrine | Interseção: Catálogo Mestre ∩ existe na cidade (quantidade > 0) |
| Tags fora do catálogo | Não aparecem (é o filtro anti-lixo: waste_basket, parking_entrance etc. ficam de fora por construção) |
| Identidade de categoria | `chave` do catálogo = `categoria_servico.chave` (as 12 atuais mantêm chaves e ids) |
| Categorias processadas por cidade | Nova tabela `cidade_categoria` — fonte da verdade do que a UI mostra |
| Frontend | Vanilla JS (sem framework) |

## 13.2 Catálogo Mestre — criar `db\catalogo_mestre.json`

Formato de cada item:
`{ "chave", "rotulo", "grupo", "tag": {"k":"v"}, "cor", "padrao" }`.
As 12 primeiras entradas são as categorias JÁ existentes (mesmas chaves,
mesmas tags, mesmas cores do seed — `padrao: true`). Use exatamente este
conteúdo (pode acrescentar itens no fim, desde que com tags reais do OSM):

```json
[
 {"chave":"saude","rotulo":"Saúde (hospitais)","grupo":"Saúde","tag":{"amenity":"hospital"},"cor":"#e74c3c","padrao":true},
 {"chave":"farmacia","rotulo":"Farmácias","grupo":"Saúde","tag":{"amenity":"pharmacy"},"cor":"#9b59b6","padrao":true},
 {"chave":"educacao","rotulo":"Escolas","grupo":"Educação","tag":{"amenity":"school"},"cor":"#3498db","padrao":true},
 {"chave":"mercado","rotulo":"Supermercados","grupo":"Alimentação","tag":{"shop":"supermarket"},"cor":"#27ae60","padrao":true},
 {"chave":"transporte","rotulo":"Terminais rodoviários","grupo":"Transporte","tag":{"amenity":"bus_station"},"cor":"#f39c12","padrao":true},
 {"chave":"banco","rotulo":"Bancos","grupo":"Serviços","tag":{"amenity":"bank"},"cor":"#16a085","padrao":true},
 {"chave":"combustivel","rotulo":"Postos de combustível","grupo":"Transporte","tag":{"amenity":"fuel"},"cor":"#7f8c8d","padrao":true},
 {"chave":"lazer","rotulo":"Parques e praças","grupo":"Lazer","tag":{"leisure":"park"},"cor":"#2ecc71","padrao":true},
 {"chave":"ponto_onibus","rotulo":"Pontos de ônibus","grupo":"Transporte","tag":{"highway":"bus_stop"},"cor":"#d97706","padrao":true},
 {"chave":"posto_saude","rotulo":"Postos de saúde/clínicas","grupo":"Saúde","tag":{"amenity":"clinic"},"cor":"#be185d","padrao":true},
 {"chave":"creche","rotulo":"Creches (ed. infantil)","grupo":"Educação","tag":{"amenity":"kindergarten"},"cor":"#0ea5e9","padrao":true},
 {"chave":"padaria","rotulo":"Padarias","grupo":"Alimentação","tag":{"shop":"bakery"},"cor":"#a16207","padrao":true},
 {"chave":"dentista","rotulo":"Dentistas","grupo":"Saúde","tag":{"amenity":"dentist"},"cor":"#f472b6","padrao":false},
 {"chave":"consultorios","rotulo":"Consultórios médicos","grupo":"Saúde","tag":{"amenity":"doctors"},"cor":"#fb7185","padrao":false},
 {"chave":"veterinario","rotulo":"Veterinários","grupo":"Saúde","tag":{"amenity":"veterinary"},"cor":"#c084fc","padrao":false},
 {"chave":"laboratorio","rotulo":"Laboratórios de análises","grupo":"Saúde","tag":{"healthcare":"laboratory"},"cor":"#e879f9","padrao":false},
 {"chave":"optica","rotulo":"Óticas","grupo":"Saúde","tag":{"shop":"optician"},"cor":"#a78bfa","padrao":false},
 {"chave":"faculdade","rotulo":"Faculdades","grupo":"Educação","tag":{"amenity":"college"},"cor":"#60a5fa","padrao":false},
 {"chave":"universidade","rotulo":"Universidades","grupo":"Educação","tag":{"amenity":"university"},"cor":"#2563eb","padrao":false},
 {"chave":"biblioteca","rotulo":"Bibliotecas","grupo":"Educação","tag":{"amenity":"library"},"cor":"#38bdf8","padrao":false},
 {"chave":"autoescola","rotulo":"Autoescolas","grupo":"Educação","tag":{"amenity":"driving_school"},"cor":"#7dd3fc","padrao":false},
 {"chave":"escola_idiomas","rotulo":"Escolas de idiomas","grupo":"Educação","tag":{"amenity":"language_school"},"cor":"#93c5fd","padrao":false},
 {"chave":"restaurante","rotulo":"Restaurantes","grupo":"Alimentação","tag":{"amenity":"restaurant"},"cor":"#ea580c","padrao":false},
 {"chave":"lanchonete","rotulo":"Lanchonetes (fast food)","grupo":"Alimentação","tag":{"amenity":"fast_food"},"cor":"#fb923c","padrao":false},
 {"chave":"cafe","rotulo":"Cafeterias","grupo":"Alimentação","tag":{"amenity":"cafe"},"cor":"#92400e","padrao":false},
 {"chave":"bar","rotulo":"Bares","grupo":"Alimentação","tag":{"amenity":"bar"},"cor":"#b45309","padrao":false},
 {"chave":"sorveteria","rotulo":"Sorveterias","grupo":"Alimentação","tag":{"amenity":"ice_cream"},"cor":"#fbbf24","padrao":false},
 {"chave":"acougue","rotulo":"Açougues","grupo":"Alimentação","tag":{"shop":"butcher"},"cor":"#dc2626","padrao":false},
 {"chave":"hortifruti","rotulo":"Hortifrutis","grupo":"Alimentação","tag":{"shop":"greengrocer"},"cor":"#65a30d","padrao":false},
 {"chave":"conveniencia","rotulo":"Lojas de conveniência","grupo":"Alimentação","tag":{"shop":"convenience"},"cor":"#84cc16","padrao":false},
 {"chave":"feira","rotulo":"Mercados/feiras","grupo":"Alimentação","tag":{"amenity":"marketplace"},"cor":"#4d7c0f","padrao":false},
 {"chave":"shopping","rotulo":"Shoppings","grupo":"Compras","tag":{"shop":"mall"},"cor":"#0d9488","padrao":false},
 {"chave":"roupas","rotulo":"Lojas de roupas","grupo":"Compras","tag":{"shop":"clothes"},"cor":"#14b8a6","padrao":false},
 {"chave":"calcados","rotulo":"Lojas de calçados","grupo":"Compras","tag":{"shop":"shoes"},"cor":"#2dd4bf","padrao":false},
 {"chave":"eletronicos","rotulo":"Lojas de eletrônicos","grupo":"Compras","tag":{"shop":"electronics"},"cor":"#06b6d4","padrao":false},
 {"chave":"moveis","rotulo":"Lojas de móveis","grupo":"Compras","tag":{"shop":"furniture"},"cor":"#0891b2","padrao":false},
 {"chave":"material_construcao","rotulo":"Material de construção","grupo":"Compras","tag":{"shop":"doityourself"},"cor":"#78716c","padrao":false},
 {"chave":"ferragens","rotulo":"Ferragens","grupo":"Compras","tag":{"shop":"hardware"},"cor":"#57534e","padrao":false},
 {"chave":"papelaria","rotulo":"Papelarias","grupo":"Compras","tag":{"shop":"stationery"},"cor":"#67e8f9","padrao":false},
 {"chave":"livraria","rotulo":"Livrarias","grupo":"Compras","tag":{"shop":"books"},"cor":"#155e75","padrao":false},
 {"chave":"petshop","rotulo":"Pet shops","grupo":"Compras","tag":{"shop":"pet"},"cor":"#a3e635","padrao":false},
 {"chave":"floricultura","rotulo":"Floriculturas","grupo":"Compras","tag":{"shop":"florist"},"cor":"#ec4899","padrao":false},
 {"chave":"celulares","rotulo":"Lojas de celulares","grupo":"Compras","tag":{"shop":"mobile_phone"},"cor":"#22d3ee","padrao":false},
 {"chave":"estacao_trem","rotulo":"Estações de trem/metrô","grupo":"Transporte","tag":{"railway":"station"},"cor":"#ca8a04","padrao":false},
 {"chave":"bicicletario","rotulo":"Bicicletários","grupo":"Transporte","tag":{"amenity":"bicycle_parking"},"cor":"#eab308","padrao":false},
 {"chave":"aluguel_bike","rotulo":"Aluguel de bicicletas","grupo":"Transporte","tag":{"amenity":"bicycle_rental"},"cor":"#facc15","padrao":false},
 {"chave":"taxi","rotulo":"Pontos de táxi","grupo":"Transporte","tag":{"amenity":"taxi"},"cor":"#fde047","padrao":false},
 {"chave":"playground","rotulo":"Playgrounds","grupo":"Lazer","tag":{"leisure":"playground"},"cor":"#4ade80","padrao":false},
 {"chave":"quadra","rotulo":"Quadras esportivas","grupo":"Lazer","tag":{"leisure":"pitch"},"cor":"#22c55e","padrao":false},
 {"chave":"centro_esportivo","rotulo":"Centros esportivos","grupo":"Lazer","tag":{"leisure":"sports_centre"},"cor":"#16a34a","padrao":false},
 {"chave":"academia","rotulo":"Academias","grupo":"Lazer","tag":{"leisure":"fitness_centre"},"cor":"#15803d","padrao":false},
 {"chave":"piscina","rotulo":"Piscinas públicas","grupo":"Lazer","tag":{"leisure":"swimming_pool"},"cor":"#0ea5e9","padrao":false},
 {"chave":"estadio","rotulo":"Estádios","grupo":"Lazer","tag":{"leisure":"stadium"},"cor":"#166534","padrao":false},
 {"chave":"praia","rotulo":"Praias","grupo":"Lazer","tag":{"natural":"beach"},"cor":"#fcd34d","padrao":false},
 {"chave":"cinema","rotulo":"Cinemas","grupo":"Cultura","tag":{"amenity":"cinema"},"cor":"#7c3aed","padrao":false},
 {"chave":"teatro","rotulo":"Teatros","grupo":"Cultura","tag":{"amenity":"theatre"},"cor":"#6d28d9","padrao":false},
 {"chave":"museu","rotulo":"Museus","grupo":"Cultura","tag":{"tourism":"museum"},"cor":"#5b21b6","padrao":false},
 {"chave":"correios","rotulo":"Correios","grupo":"Serviços","tag":{"amenity":"post_office"},"cor":"#f59e0b","padrao":false},
 {"chave":"caixa_eletronico","rotulo":"Caixas eletrônicos","grupo":"Serviços","tag":{"amenity":"atm"},"cor":"#10b981","padrao":false},
 {"chave":"salao_beleza","rotulo":"Salões de beleza","grupo":"Serviços","tag":{"shop":"hairdresser"},"cor":"#f9a8d4","padrao":false},
 {"chave":"lavanderia","rotulo":"Lavanderias","grupo":"Serviços","tag":{"shop":"laundry"},"cor":"#5eead4","padrao":false},
 {"chave":"oficina","rotulo":"Oficinas mecânicas","grupo":"Serviços","tag":{"shop":"car_repair"},"cor":"#475569","padrao":false},
 {"chave":"hotel","rotulo":"Hotéis","grupo":"Serviços","tag":{"tourism":"hotel"},"cor":"#818cf8","padrao":false},
 {"chave":"templo","rotulo":"Templos e igrejas","grupo":"Serviços","tag":{"amenity":"place_of_worship"},"cor":"#8b5cf6","padrao":false},
 {"chave":"centro_comunitario","rotulo":"Centros comunitários","grupo":"Serviços","tag":{"amenity":"community_centre"},"cor":"#34d399","padrao":false},
 {"chave":"assistencia_social","rotulo":"Assistência social","grupo":"Serviços","tag":{"amenity":"social_facility"},"cor":"#6ee7b7","padrao":false},
 {"chave":"prefeitura","rotulo":"Prefeitura/adm. pública","grupo":"Cívico","tag":{"amenity":"townhall"},"cor":"#64748b","padrao":false},
 {"chave":"forum","rotulo":"Fóruns/tribunais","grupo":"Cívico","tag":{"amenity":"courthouse"},"cor":"#94a3b8","padrao":false},
 {"chave":"policia","rotulo":"Delegacias","grupo":"Segurança","tag":{"amenity":"police"},"cor":"#1e40af","padrao":false},
 {"chave":"bombeiros","rotulo":"Corpo de bombeiros","grupo":"Segurança","tag":{"amenity":"fire_station"},"cor":"#b91c1c","padrao":false}
]
```

Regras: `chave` única e imutável; `rotulo` em pt-BR; UMA tag k=v por
entrada; cores em hex. Validar o JSON com um parse antes de commitar.

## 13.3 Banco

```sql
CREATE TABLE IF NOT EXISTS cidade_categoria (
    cidade_id    INTEGER NOT NULL REFERENCES cidade(id) ON DELETE CASCADE,
    categoria_id INTEGER NOT NULL REFERENCES categoria_servico(id),
    PRIMARY KEY (cidade_id, categoria_id)
);
```
Backfill (uma vez):
```sql
INSERT INTO cidade_categoria
SELECT DISTINCT cidade_id, categoria_id FROM alcancabilidade_no
ON CONFLICT DO NOTHING;
```
`categoria_servico` ganha entradas novas por UPSERT no momento do
processamento (13.5) — `INSERT ... ON CONFLICT (chave) DO NOTHING`,
deixando o id ser gerado pela sequence (já está em setval 100).

## 13.4 API — a vitrine

### `GET /api/v1/vitrine?osm_tipo=relation&osm_id=298285`
1. Monta o id de área do Overpass: relation → `3600000000 + osm_id`;
   way → `2400000000 + osm_id`.
2. Monta UM script Overpass QL com um `out count` por item do catálogo,
   na MESMA ORDEM do arquivo:
   ```
   [out:json][timeout:90];
   area(3600298285)->.a;
   nwr["amenity"="hospital"](area.a); out count;
   nwr["amenity"="pharmacy"](area.a); out count;
   ...
   ```
3. POST para `https://overpass-api.de/api/interpreter` com body
   `data=<script urlencoded>` e header
   `User-Agent: Plataforma-Alcancabilidade-TCC/1.0`.
4. A resposta traz um elemento `{"type":"count","tags":{"total":"27",...}}`
   por `out count`, NA ORDEM do script — faça zip com o catálogo pela
   ordem. Monte: `[{chave, rotulo, grupo, cor, padrao, quantidade}]`
   filtrando `quantidade > 0`.
5. Cache em memória por área (24 h). Erro 429/504 do Overpass → 1 retry
   após 10 s; persistindo → 503 com "OpenStreetMap sobrecarregado; tente
   em instantes". Timeout do fetch: 120 s.
6. Teste com curl em Águas de São Pedro antes de integrar (cidade pequena,
   resposta em segundos).

### `POST /api/v1/processamentos` (alterar)
- Body ganha `categorias: ["chave1", ...]` (opcional; default = as 12
  `padrao: true`). Validar: toda chave deve existir no catálogo; mínimo 1;
  máximo = tamanho do catálogo.
- Antes do spawn: UPSERT das categorias escolhidas em `categoria_servico`
  (dados vindos do catálogo). Depois: spawn com
  `--categorias chave1,chave2,...`.
- O reprocessar da fase 12 envia as categorias ATUAIS da cidade
  (`cidade_categoria`) por padrão.

## 13.5 Python CLI

- Novo argumento `--categorias chaves,separadas,por,virgula` (opcional;
  default: todas as categorias de `categoria_servico` exceto id 0 — o
  comportamento atual).
- `carregar_categorias(conn, chaves=None)`: filtra
  `WHERE chave = ANY(%s)` quando fornecido.
- `db.py / gravar_cidade`: gravar em `cidade_categoria` UMA linha por
  categoria PROCESSADA (mesmo que 0 serviços tenham sido encontrados —
  processada ≠ presente). O diagnóstico Moreno oficial continua usando
  apenas categorias com serviços (semântica da fase 09, inalterada).

## 13.6 Fonte da verdade na UI: só o que a cidade tem

Trocar, no frontend e nos endpoints, toda derivação de "categorias da
cidade" para `cidade_categoria`:
- `GET /cidades/:id` → `indices` continua igual (vem de `indice_cidade`,
  que já só tem processadas) e ganha array `categorias_processadas`
  (chave/rotulo/cor) vindo de `cidade_categoria`.
- Checkboxes de isócronas, select de heatmap, "Personalizar análise",
  "Cobertura por serviço": todos montados a partir de
  `categorias_processadas` da cidade selecionada — nunca do catálogo
  inteiro (é isso que mantém o frontend limpo: cada cidade só mostra o que
  baixou).
- `/comparar`: comparar SEMPRE na interseção das categorias das cidades;
  quando os conjuntos diferirem, exibir nota "comparação restrita aos N
  serviços em comum" (o Moreno oficial de cada cidade permanece o gravado
  — apenas sinalize que as bases diferem).

## 13.7 Testes

- vitest: `GET /vitrine` com osm_tipo inválido → 400; POST
  `/processamentos` com `categorias: ["nao_existe"]` → 400 listando chaves
  válidas; catálogo carrega e tem ≥ 70 itens com chaves únicas (teste de
  sanidade do JSON).
- pytest: `carregar_categorias` com filtro retorna só as pedidas.
- Manual (roteiro-chave): adicionar uma cidade nova escolhendo APENAS
  3 categorias → conferir que a UI daquela cidade mostra só as 3 (painel,
  heatmap, Moreno), enquanto as cidades antigas seguem com as 12.

## 13.8 Critérios de aceite

- [ ] Vitrine mostra apenas itens do catálogo com quantidade > 0, em
      grupos, com contagens e os 12 padrão pré-marcados
- [ ] Uma requisição Overpass por cidade (com cache); erros tratados
- [ ] Processamento respeita a seleção; `cidade_categoria` populada
- [ ] UI de cada cidade mostra somente o que ela baixou
- [ ] Comparação usa interseção com aviso
- [ ] Frontend segue vanilla (sem framework); visual atual preservado
- [ ] Testes verdes; openapi.yaml atualizado; commit; PROGRESSO

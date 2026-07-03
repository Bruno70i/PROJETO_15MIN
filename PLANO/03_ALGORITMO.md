# FASE 03 — Algoritmo de alcançabilidade otimizado (Python)

Objetivo: transformar a prova de conceito `CODIGO\v1.1.py` em um pacote
Python (`algorithm/`) que processa qualquer cidade do OSM e grava tudo no
banco — **com a otimização central: Dijkstra multi-source por categoria**.

## 3.1 A otimização (entenda antes de codar)

**v1.1 (lento e metodologicamente divergente):** para cada serviço s
(hospital A, hospital B, escola C, ...), roda `single_source_dijkstra(G, s)`
→ S execuções completas (centenas em Paris → ~1 h). E a métrica final é a
média dos tempos até TODOS os serviços — não corresponde à seção 2.3.2 do
TCC.

**v2 (este plano):** para cada CATEGORIA c (≈ 8), roda UMA execução
multi-source partindo simultaneamente de todos os serviços da categoria:

```python
tempos = nx.multi_source_dijkstra_path_length(G, sources=nos_da_categoria, weight="travel_time")
```

Isso devolve, para cada nó do grafo, o tempo até o serviço MAIS PRÓXIMO da
categoria — exatamente a definição da tabela `alcancabilidade_no`.
Complexidade cai de O(S·(E+V log V)) para O(C·(E+V log V)), S/C ≈ 30–100×
menos trabalho. Paris deve cair de ~1 h para poucos minutos.

Para saber QUAL serviço é o mais próximo (campo `servico_id`), use na mesma
passada:

```python
celulas = nx.voronoi_cells(G, center_nodes=set(nos_da_categoria), weight="travel_time")
# celulas: {no_do_servico: {nós atendidos por ele}, 'unreachable': {...}}
```

Nota importante sobre direção: o grafo do OSMnx é direcionado
(MultiDiGraph). Tanto o multi-source quanto o voronoi_cells calculam
distâncias DOS serviços PARA os nós; em rede de pedestres (network_type
"walk") as arestas existem nos dois sentidos, então serviço→nó ≈ nó→serviço.
Documente isso em docstring.

## 3.2 Estrutura do pacote

Crie os arquivos abaixo em `PROJETO_15MIN\algorithm\`. Assinaturas e
responsabilidades são contrato; corpo é implementação de referência (pode
melhorar sem mudar comportamento).

### `config.py`
```python
from dataclasses import dataclass, field
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent  # PROJETO_15MIN
PASTA_CACHE = RAIZ / "cache_osm"

@dataclass
class Configuracao:
    consulta_osm: str                      # "Praia Grande, São Paulo, Brazil"
    velocidade_kmh: float = 3.0            # conservadora (TCC, seção 1.2.4)
    limiar_minutos: int = 15
    minutos_isocronas: tuple = (5, 10, 15)
    usar_cache_grafo: bool = True
```

### `graph.py`
- `baixar_ou_carregar_grafo(cfg) -> nx.MultiDiGraph`
  1. Configure o cache do OSMnx logo no import do módulo:
     ```python
     import osmnx as ox
     ox.settings.use_cache = True
     ox.settings.cache_folder = str(PASTA_CACHE)
     ```
  2. Caminho do grafo em disco: `PASTA_CACHE / f"{slug(consulta)}.graphml"`
     (slug = minúsculas, sem acento, espaços/vírgulas → `_`).
  3. Se existir e `usar_cache_grafo`: `ox.load_graphml(caminho)`.
  4. Senão: `G = ox.graph_from_place(cfg.consulta_osm, network_type="walk")`.
  5. Pesos: adicione a TODAS as arestas `travel_time` em segundos:
     `data["travel_time"] = data["length"] / (cfg.velocidade_kmh * 1000/3600)`.
     Faça manualmente (loop sobre `G.edges(data=True)`) — não dependa de
     `add_edge_speeds` (assinatura muda entre versões do OSMnx e a
     velocidade de pedestre é uniforme; `length` está em metros).
  6. `ox.save_graphml(G, caminho)` quando baixado.
- `slug(texto) -> str` (função utilitária, testável).

### `services.py`
- `localizar_servicos(G, cfg, categorias) -> dict[int, list[Servico]]`
  - `categorias`: lista de dicts vindos do banco
    (`{id, chave, tag_osm}` — ignorar a categoria 0 'geral').
  - Para cada categoria: `ox.features_from_place(cfg.consulta_osm, tag)`
    dentro de try/except (categoria sem resultados → lista vazia + warning).
  - Para cada feição: centroide se não for ponto
    (`geom if geom.geom_type == "Point" else geom.centroid`), nome =
    `row.get("name")` (aceite NaN → `None`; NÃO descarte serviços sem nome —
    a v1.1 descartava e isso subestimava a oferta).
  - Nó mais próximo em LOTE (muito mais rápido que um a um):
    ```python
    nos = ox.distance.nearest_nodes(G, X=lista_lons, Y=lista_lats)
    ```
  - `Servico` = dataclass: `categoria_id, nome, lat, lon, osm_no_id`.

### `reachability.py` (o coração)
```python
import networkx as nx

def calcular_categoria(G, nos_servicos: set):
    """Tempos (min) de cada nó ao serviço mais próximo da categoria e
    qual serviço é. Retorna (tempos: dict[no, float], dono: dict[no, no_servico]).
    """
    if not nos_servicos:
        return {}, {}
    tempos_s = nx.multi_source_dijkstra_path_length(
        G, sources=list(nos_servicos), weight="travel_time"
    )
    tempos = {no: t / 60.0 for no, t in tempos_s.items()}
    celulas = nx.voronoi_cells(G, center_nodes=set(nos_servicos),
                               weight="travel_time")
    dono = {}
    for no_servico, atendidos in celulas.items():
        if no_servico == "unreachable":
            continue
        for no in atendidos:
            dono[no] = no_servico
    return tempos, dono
```
- Nós ausentes de `tempos` (desconectados) → `tempo_min = NULL` e
  `dentro_limiar = FALSE` na persistência.
- Se `voronoi_cells` não aceitar `center_nodes` na versão instalada do
  networkx, a assinatura antiga é posicional: `nx.voronoi_cells(G, centros,
  weight=...)` — trate as duas formas.

### `metrics.py`
- `indice_no(tempos_por_categoria: dict[int, float|None], limiar) -> float`
  = (nº de categorias com tempo ≤ limiar) / (nº de categorias com serviços
  na cidade), em 0–100.
- `agregados_cidade(...)` → por categoria: `tempo_medio_min` (média dos nós
  alcançáveis), `pct_dentro_limiar`, `indice = pct_dentro_limiar`; e a linha
  GERAL (categoria 0): `tempo_medio_min` = média das médias das categorias,
  `indice` = média dos índices de nó. Documente as fórmulas em docstring —
  elas entram no texto do TCC.

### `isochrones.py`
- Para cada categoria e cada corte em `cfg.minutos_isocronas`:
  pegue os nós com `tempo <= corte`, monte `shapely.MultiPoint` com
  (lon, lat), gere polígono `shapely.concave_hull(pontos, ratio=0.4)`
  (fallback `convex_hull` se < 4 pontos ou erro), converta com
  `shapely.geometry.mapping()` para dict GeoJSON.
- Retorne `{(categoria_id, minutos): geojson_dict}`.

### `db.py`
- Conexão via `psycopg2` + `python-dotenv` lendo `PROJETO_15MIN\.env`.
- `carregar_categorias(conn)` → lista de categorias (exceto id 0), com
  `tag_osm` já como dict.
- `gravar_cidade(conn, cfg, G, resultados)` — transação única:
  1. UPSERT em `cidade` por `consulta_osm` (repetiu → apaga dados antigos da
     cidade via `DELETE FROM cidade WHERE consulta_osm = %s` e recria —
     CASCADE limpa tudo);
  2. `no`: batch com `psycopg2.extras.execute_values` (page_size 10000);
  3. `servico`: batch; construa mapa `(categoria_id, osm_no_id) →
     servico.id` (para o dono do voronoi; se dois serviços da mesma
     categoria caírem no mesmo nó, o primeiro vence);
  4. `alcancabilidade_no`: batch (page_size 10000);
  5. `indice_cidade` e `isocrona`;
  6. atualiza `qtd_nos`, `qtd_arestas`, `tempo_execucao_s` em `cidade`.

### `cli.py`
```
uso: python -m algorithm.cli --place "Praia Grande, São Paulo, Brazil"
                             [--velocidade 3.0] [--limiar 15] [--sem-cache]
```
- `argparse`; imprime etapas com tempos parciais (baixar grafo, localizar
  serviços, calcular N categorias, isócronas, gravação) e o resumo final:
  nós, arestas, tempo por categoria, índice geral da cidade.
- Saída SEM emoji (console Windows cp1252 quebra) — use `[OK]`, `[AVISO]`.
- Código de saída 0 em sucesso; ≠0 com mensagem clara em erro.

### `algorithm/__init__.py` e `algorithm/tests/__init__.py`
Vazios (marcadores de pacote).

## 3.3 Testes (`algorithm\tests\test_pipeline.py`)

Use a cidade minúscula: `"Águas de São Pedro, São Paulo, Brazil"`.

1. `test_slug` — puro, sem rede.
2. `test_indice_no` — casos: todas as categorias dentro (100), metade (50),
   nenhuma (0), categoria sem serviço não conta no denominador.
3. `test_grafo_e_pesos` — baixa (ou usa cache) o grafo da cidade de teste;
   asserts: nº nós > 100; toda aresta tem `travel_time > 0`.
4. `test_pipeline_completo` (marcado `@pytest.mark.integration`) — roda o
   fluxo inteiro contra o banco real; asserts:
   - linhas em `no` == nº de nós do grafo;
   - para cada categoria com serviços: linhas em `alcancabilidade_no` ==
     nº de nós; `tempo_min >= 0`; pelo menos 1 nó `dentro_limiar` se houver
     serviço;
   - `indice_cidade` tem linha da categoria 0 com `indice BETWEEN 0 AND 100`;
   - reprocessar a mesma cidade NÃO duplica linhas (upsert ok).
5. Rode: `& ".venv\Scripts\python.exe" -m pytest algorithm\tests -v`
   (a partir da raiz do projeto; defina `$env:PYTHONIOENCODING="utf-8"`).

## 3.4 Validação de performance (obrigatória)

| Cidade | Meta de cálculo (sem download) |
|---|---|
| Águas de São Pedro | < 30 s |
| Praia Grande, SP | < 5 min |
| Paris, France | < 10 min |

Meça com o cronômetro do próprio CLI, rode Praia Grande e registre em
PROGRESSO.md a comparação com a v1.1 (~3 min PG / ~1 h Paris) e os NOVOS
tempos médios e índices (a equipe atualizará o TCC com eles). Paris é
opcional se a máquina tiver < 8 GB de RAM — registre se pulou.

## 3.5 Critérios de aceite da fase

- [ ] `python -m algorithm.cli --place "Águas de São Pedro, São Paulo, Brazil"` termina com [OK] e grava no banco
- [ ] Segunda execução usa o cache do grafo (loga "carregado do cache")
- [ ] Praia Grande < 5 min de cálculo; números registrados em PROGRESSO.md
- [ ] `pytest` verde (unitários e integração)
- [ ] Nenhum emoji na saída do CLI; nenhum crash de encoding
- [ ] Código commitado

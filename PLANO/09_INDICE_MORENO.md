# FASE 09 — Diagnóstico da cidade inteira segundo o conceito de Moreno

> **Para o agente executor**: leia `00_LEIA_PRIMEIRO.md` antes. Esta fase
> altera os dois contratos (schema e openapi) — as alterações exatas estão
> nas seções 9.2, 9.4 e 9.5. As FÓRMULAS da seção 9.1 são definitivas: não
> invente métricas nem mude nomes de campos. Execute a fase 08 antes OU
> depois — as duas são independentes entre si.

## 9.0 Objetivo

O sistema atual responde "este PONTO alcança os serviços em 15 minutos?"
(isso permanece intocado). Esta fase acrescenta a resposta para a CIDADE:

> **"Praia Grande é uma cidade de N minutos"** — e ela atende (ou não) ao
> conceito de Cidade de 15 Minutos de Carlos Moreno, com diagnóstico do
> gargalo e distribuição do território.

## 9.1 Definições matemáticas (fonte da verdade)

Considere, para um nó *v* e o conjunto **C** de categorias **presentes na
cidade** (categorias com ≥ 1 serviço; ver 9.1.1):

- `tempo_pior(v) = max{ tempo(v, c) : c ∈ C }` — o tempo para o nó ter
  acesso a TODOS os serviços essenciais. Se alguma categoria de C é
  inalcançável a partir de v (tempo NULL), então `tempo_pior(v) = NULL`
  (nó sem cobertura plena possível).
- **Cobertura plena** (`pct_cobertura_plena`): percentual de nós com
  `tempo_pior(v) ≤ limiar` (15 min). É O critério de Moreno aplicado ao
  território: % da cidade que alcança TODAS as categorias em 15 min a pé.
- **Minutos da cidade** (`minutos_cidade`): `ceil(P90(tempo_pior))` — o
  percentil 90 da distribuição de `tempo_pior` sobre os nós com valor não
  nulo. Leitura: "90% do território alcança todos os serviços essenciais em
  até N minutos" → *"cidade de N minutos"*. Usa-se P90 (e não o máximo)
  para não deixar um único nó periférico definir a cidade inteira.
- **Estatísticas de apoio**: `tempo_pior_medio`, `tempo_pior_mediana`
  (P50), ambos sobre os não nulos; `pct_nos_sem_cobertura` = % de nós com
  `tempo_pior` NULL.
- **Categoria gargalo** (`categoria_gargalo_id`, `pct_gargalo`): a
  categoria c ∈ C com o MENOR percentual de nós dentro do limiar
  (`pct_dentro_limiar` já existente em `indice_cidade`). É o que impede a
  cidade de ser 15 minutos.
- **Veredito** (`atende_conceito`, boolean): `minutos_cidade ≤ limiar`
  (15). Classificação textual (`classificacao`):

| Condição (nesta ordem) | classificacao |
|---|---|
| minutos_cidade ≤ 15 | `Cidade de 15 Minutos` |
| minutos_cidade ≤ 20 | `Muito proxima do conceito` |
| minutos_cidade ≤ 30 | `Parcialmente aderente` |
| acima de 30 | `Distante do conceito` |

- **Distribuição** (`distribuicao`, JSONB): histograma de `tempo_pior` nos
  bins fixos `[0-5, 5-10, 10-15, 15-20, 20-30, 30+]` (minutos), formato:
  `[{"faixa": "0-5", "qtd": 123}, ..., {"faixa": "30+", "qtd": 4},
  {"faixa": "sem_cobertura", "qtd": 2}]`.

### 9.1.1 Categorias ausentes (decisão metodológica — documentar no código)
Categoria sem NENHUM serviço na cidade (ex.: rodoviária em cidade pequena)
fica FORA de C — senão nenhuma cidade pequena poderia atender ao conceito
por lacuna de mapeamento do OSM, não por desenho urbano. Essas categorias
são listadas em `categorias_ausentes` (array de ids) e a interface as
exibe com a ressalva "sem dados no OpenStreetMap para esta cidade". Isso é
uma limitação honesta a citar no TCC.

## 9.2 Banco — nova tabela (adicionar ao `db\schema.sql`, contrato nº 1)

```sql
CREATE TABLE IF NOT EXISTS indice_moreno (
    cidade_id             INTEGER PRIMARY KEY REFERENCES cidade(id) ON DELETE CASCADE,
    limiar_minutos        INTEGER NOT NULL,
    pct_cobertura_plena   NUMERIC(5,2) NOT NULL,
    minutos_cidade        INTEGER,                -- NULL se cidade sem nós cobertos
    tempo_pior_medio      NUMERIC(8,2),
    tempo_pior_mediana    NUMERIC(8,2),
    pct_nos_sem_cobertura NUMERIC(5,2) NOT NULL DEFAULT 0,
    atende_conceito       BOOLEAN NOT NULL,
    classificacao         TEXT NOT NULL,
    categoria_gargalo_id  INTEGER REFERENCES categoria_servico(id),
    pct_gargalo           NUMERIC(5,2),
    categorias_ausentes   JSONB NOT NULL DEFAULT '[]'::jsonb,
    distribuicao          JSONB NOT NULL DEFAULT '[]'::jsonb
);
```

Aplicar com psql (o schema é idempotente). Nenhuma tabela existente muda.

## 9.3 Python — cálculo em `algorithm\metrics.py` + gravação em `db.py`

### 9.3.1 `metrics.py`: nova função
```python
def diagnostico_moreno(alcancabilidade_por_no, categorias_presentes, limiar):
    """Implementa EXATAMENTE as definicoes da fase 09 (secao 9.1).
    alcancabilidade_por_no: {no: {categoria_id: (tempo_min|None, dono)}}
    categorias_presentes: ids de categorias com >= 1 servico na cidade
    Retorna dict com todas as chaves da tabela indice_moreno."""
```
Implementação: itere os nós uma vez calculando `tempo_pior`; acumule
lista dos não nulos para percentis (use `statistics.quantiles(dados,
n=10)[8]` para P90 ou ordene e indexe `int(0.9 * (len-1))` — escolha um e
documente); monte o histograma com os bins da seção 9.1; derive gargalo a
partir dos agregados por categoria já computados em `agregados_cidade`
(reuse; não recalcule). Casos extremos que DEVEM funcionar: cidade sem
nenhuma categoria presente (retorne pct 0, minutos NULL, atende False,
classificacao `Distante do conceito`); todos os nós sem cobertura.

### 9.3.2 `db.py`: gravar em `gravar_cidade` (etapa 5.5, após indice_cidade)
INSERT na `indice_moreno` com `json.dumps` nos campos JSONB. Lembre que o
DELETE em cascata da cidade já limpa a linha antiga.

### 9.3.3 CLI
No resumo final do CLI, imprimir:
```
Diagnostico Moreno: cidade de N minutos | cobertura plena X% | gargalo: <rotulo> | <classificacao>
```

### 9.3.4 Reprocessar as cidades existentes
```powershell
$env:PYTHONIOENCODING = "utf-8"
Set-Location "C:\Users\User\Downloads\TCC\PROJETO_15MIN"
& ".venv\Scripts\python.exe" -m algorithm.cli --place "Águas de São Pedro, São Paulo, Brazil"
& ".venv\Scripts\python.exe" -m algorithm.cli --place "Praia Grande, São Paulo, Brazil"
```
(Se a fase 08 já criou outras cidades, reprocesse-as também — liste com
`SELECT consulta_osm FROM cidade;`.)

### 9.3.5 Testes (`algorithm\tests\test_pipeline.py` — adicionar)
- `test_diagnostico_moreno_unitario`: dados sintéticos de 4 nós × 2
  categorias cobrindo: todos plenos (pct=100, atende=True), nenhum pleno,
  um nó NULL (pct_nos_sem_cobertura=25.0), categoria ausente fora do
  cálculo. Verifique `minutos_cidade` contra valor calculado à mão.
- No `test_pipeline_completo`: assert de que `indice_moreno` tem 1 linha
  para a cidade e `pct_cobertura_plena BETWEEN 0 AND 100`.

## 9.4 API (contrato nº 2)

1. `GET /cidades/:id` — acrescentar ao JSON o objeto `moreno` (todas as
   colunas da tabela, com `categoria_gargalo` expandida em
   `{chave, rotulo, cor_hex}` e `categorias_ausentes` expandida em array de
   `{chave, rotulo}`). Se a cidade ainda não tem linha (processada antes da
   fase 09), retorne `moreno: null` — o frontend mostra "Reprocesse a
   cidade para obter o diagnóstico".
2. `GET /comparar` — incluir `moreno` em cada item (mesma expansão).
3. `GET /cidades/:id/mapa?categoria=plena` — NOVO valor especial `plena`:
   retorna por nó `tempo_min = tempo_pior(v)` e
   `dentro_limiar = (tempo_pior <= limiar)`. SQL de referência:
   ```sql
   SELECT n.lat, n.lon,
          CASE WHEN bool_and(a.tempo_min IS NOT NULL)
               THEN max(a.tempo_min) END AS tempo_min,
          bool_and(a.tempo_min IS NOT NULL AND a.dentro_limiar) AS dentro_limiar
   FROM no n
   JOIN alcancabilidade_no a ON a.cidade_id = n.cidade_id AND a.osm_no_id = n.osm_id
   WHERE n.cidade_id = $1
     AND a.categoria_id = ANY($2)   -- apenas categorias presentes
   GROUP BY n.id, n.lat, n.lon
   ORDER BY random() LIMIT $3
   ```
   (obtenha `$2` = ids das categorias presentes com
   `SELECT DISTINCT categoria_id FROM servico WHERE cidade_id = $1`).
   A validação de categoria deve aceitar `plena` além das chaves reais.
4. `openapi.yaml`: atualizar os três pontos acima (schema `Moreno` em
   components; exemplos completos).
5. Testes: `GET /cidades/:id` contém `moreno.pct_cobertura_plena` numérico;
   `/mapa?categoria=plena` → 200 com array não vazio.

## 9.5 Frontend

### 9.5.1 Cartão "Diagnóstico da cidade" (index.html)
Ao selecionar uma cidade (antes de qualquer clique), o painel lateral
mostra, no lugar do texto "clique no mapa...", o cartão com:

1. Frase-destaque: `<Cidade> é uma cidade de <N> minutos` (N =
   `minutos_cidade`; se null: "sem cobertura plena mensurável").
2. Selo com `classificacao` — cores: `Cidade de 15 Minutos` verde
   (#16a34a), `Muito proxima` amarelo (#eab308), `Parcialmente aderente`
   laranja (#f97316), `Distante` vermelho (#dc2626).
3. Linha "Cobertura plena: X% do território alcança todos os serviços em
   15 min".
4. Linha "Gargalo: <rotulo do gargalo> (apenas Y% do território o alcança
   em 15 min)" com a bolinha da cor da categoria.
5. Mini-histograma da `distribuicao`: barras CSS horizontais (sem lib),
   uma por faixa, rótulo `0-5`, `5-10`... e `sem cobertura`; largura
   proporcional a qtd/max(qtd).
6. Se `categorias_ausentes` não vazio: nota discreta "Sem dados no OSM:
   <rotulos>".
7. Botão/toggle "Ver cobertura plena no mapa" → liga o heatmap com
   `categoria=plena` (reusa `toggleHeatmap`; adicione a opção "Cobertura
   plena (todos os serviços)" no select do heatmap, valor `plena`).
8. Ao clicar num ponto do mapa, o cartão dá lugar aos resultados do ponto
   (comportamento atual); um botão "← Diagnóstico da cidade" volta ao
   cartão sem re-selecionar a cidade.

### 9.5.2 `comparar.html`
Adicionar às colunas de cada cidade: `minutos_cidade` (linha destacada
"Cidade de N minutos"), `pct_cobertura_plena` e o selo de classificação.

### 9.5.3 `sobre.html`
Parágrafo novo explicando a métrica em linguagem simples: percentil 90 do
pior tempo por ponto, critério de Moreno, e a ressalva das categorias
ausentes. (Este texto vai virar seção do TCC — capriche na clareza.)

## 9.6 Validação manual

1. Reprocessar as duas cidades; conferir no psql:
   `SELECT cidade_id, minutos_cidade, pct_cobertura_plena, classificacao FROM indice_moreno;`
2. Sanidade: Águas de São Pedro (317 nós, tudo perto) deve ter
   `minutos_cidade` BEM menor que Praia Grande. Se vier o contrário,
   investigue antes de prosseguir (provável inversão de max/min).
3. Interface: selecionar cada cidade → cartão aparece com números
   coerentes com o psql; heatmap "plena" pinta o território; comparar
   mostra os selos.
4. Registrar os números em `PROGRESSO.md` (tabela "Diagnóstico Moreno por
   cidade") — eles entram no TCC como resultado principal.

## 9.7 Critérios de aceite

- [ ] Fórmulas implementadas EXATAMENTE como na seção 9.1 (revisar lado a lado)
- [ ] Tabela `indice_moreno` criada e populada no reprocessamento
- [ ] `GET /cidades/:id` com objeto `moreno`; `mapa?categoria=plena` funcional
- [ ] Cartão de diagnóstico + histograma + toggle de cobertura plena na interface
- [ ] Comparação entre cidades exibe minutos_cidade e selo
- [ ] pytest e vitest verdes (testes novos incluídos)
- [ ] Números registrados em PROGRESSO.md; commit feito

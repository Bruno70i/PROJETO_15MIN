# FASE 10 — Análise configurável: categorias selecionáveis, velocidade ajustável e mapa por serviço

> **Para o agente executor**: leia `00_LEIA_PRIMEIRO.md`. Esta fase NÃO
> exige reprocessar cidades para recalcular com menos categorias nem para
> mudar a velocidade — as seções 10.1 e 10.2 explicam por quê; siga-as à
> risca e NÃO reimplemente Dijkstra em lugar nenhum. Só há reprocessamento
> quando NOVAS categorias são adicionadas ao catálogo (seção 10.5).

## 10.0 O que o usuário verá ao final

No cartão "Diagnóstico de Moreno":
1. Um bloco **"Personalizar análise"** com: checkboxes das categorias
   (todas marcadas por padrão — inclusive Transporte, que permanece) e um
   seletor de **velocidade de caminhada**. Qualquer mudança recalcula o
   diagnóstico na hora (sem reprocessar a cidade).
2. Uma lista **"Cobertura por serviço"**: cada categoria com seu % do
   território dentro de 15 min; clicar numa categoria pinta o mapa de calor
   DAQUELA categoria (resolve a limitação de só ver o mapa da cobertura
   plena/gargalo).
3. Um ícone **"?" (Como calculamos?)** que abre um modal com a explicação
   leiga da métrica (texto pronto na seção 10.7 — use-o literalmente).
4. Quatro categorias novas no catálogo, alinhadas aos pilares de Moreno
   (seção 10.5) — em especial **pontos de ônibus**, que corrige a distorção
   metodológica do terminal rodoviário.

## 10.1 Por que NÃO precisa reprocessar ao desmarcar categorias

A tabela `alcancabilidade_no` já guarda o tempo de CADA nó para CADA
categoria separadamente. O diagnóstico de Moreno é uma agregação desses
dados (`tempo_pior = max` sobre as categorias escolhidas). Mudar o conjunto
de categorias muda apenas a agregação — uma consulta SQL sobre dados que já
existem. Reprocessar (Dijkstra) seria necessário apenas para categorias que
nunca foram calculadas.

## 10.2 Por que NÃO precisa reprocessar ao mudar a velocidade

O peso de toda aresta é `tempo = comprimento / velocidade`, com a MESMA
velocidade em todas as arestas. Logo, todos os tempos escalam linearmente:

```
tempo_na_velocidade_v = tempo_gravado × (velocidade_base / v)
```

onde `velocidade_base` = `cidade.velocidade_kmh` (3.0 nos dados atuais).
Exemplo: um tempo gravado de 20 min a 3 km/h vira 15 min a 4 km/h
(20 × 3/4). A escala é EXATA porque a velocidade é uniforme — documente
essa justificativa em comentário no código. O limiar continua 15 min;
o que muda é o tempo ajustado comparado a ele.

**Exceção**: as isócronas são polígonos pré-calculados a 3 km/h para
5/10/15 min — NÃO tente escalá-las. Quando a velocidade escolhida for
diferente da base, desabilite os checkboxes de isócronas com a nota
"isócronas disponíveis apenas na velocidade padrão (3 km/h)".

## 10.3 API — endpoint dinâmico e parâmetros novos

### 10.3.1 `GET /api/v1/cidades/:id/moreno` (NOVO)
Query params (todos opcionais):
- `categorias` — CSV de chaves (ex.: `saude,educacao,mercado`). Default:
  todas as categorias presentes na cidade. Validar: toda chave deve existir
  e ao menos 1 deve restar (400 caso contrário).
- `velocidade` — número entre 2.0 e 6.0 (400 fora disso). Default:
  `cidade.velocidade_kmh`.

Implementação (uma única query principal + agregados por categoria):

```sql
-- $1 cidade_id, $2 int[] ids de categorias escolhidas E presentes,
-- $3 fator de escala = velocidade_base / velocidade_escolhida,
-- $4 limiar (cidade.limiar_minutos)
WITH por_no AS (
  SELECT a.osm_no_id,
         CASE WHEN bool_and(a.tempo_min IS NOT NULL)
              THEN max(a.tempo_min * $3) END AS tempo_pior
  FROM alcancabilidade_no a
  WHERE a.cidade_id = $1 AND a.categoria_id = ANY($2)
  GROUP BY a.osm_no_id
)
SELECT count(*)                                            AS total_nos,
       round(100.0 * avg((tempo_pior <= $4)::int), 2)      AS pct_cobertura_plena,
       round(100.0 * avg((tempo_pior IS NULL)::int), 2)    AS pct_nos_sem_cobertura,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY tempo_pior) AS p90,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY tempo_pior) AS mediana,
       avg(tempo_pior)                                     AS media
FROM por_no;
```

Notas de implementação:
- "presentes" = `SELECT DISTINCT categoria_id FROM servico WHERE
  cidade_id = $1`; interseccione com as escolhidas; as escolhidas-ausentes
  vão em `categorias_ausentes` na resposta (mesma semântica da fase 09).
- `percentile_cont` ignora NULLs — comportamento desejado (P90 dos nós com
  cobertura). Se TODOS forem NULL, `p90` vem NULL → `minutos_cidade: null`.
- `minutos_cidade = ceil(p90)`; `atende_conceito = minutos_cidade <= $4`;
  classificação = mesma tabela da fase 09 (15/20/30).
- Gargalo e lista por categoria (para a UI do item 10.0-2), na mesma
  resposta:
  ```sql
  SELECT a.categoria_id,
         round(100.0 * avg((a.tempo_min IS NOT NULL AND a.tempo_min * $3 <= $4)::int), 2) AS pct_dentro
  FROM alcancabilidade_no a
  WHERE a.cidade_id = $1 AND a.categoria_id = ANY($2)
  GROUP BY a.categoria_id;
  ```
  gargalo = menor `pct_dentro`. Expanda chave/rotulo/cor como na fase 09.
- Histograma: bins da fase 09 aplicados a `tempo_pior` escalado — calcule
  em JS a partir de uma query `SELECT tempo_pior FROM por_no` OU com
  `width_bucket` em SQL; escolha um e comente.
- Resposta: mesmo shape do objeto `moreno` da fase 09 **mais**
  `parametros: { categorias_usadas: [chaves], velocidade_kmh, dinamico: true }`.
- O `moreno` gravado na tabela continua intocado (é o diagnóstico oficial
  de referência do TCC — 3 km/h, todas as categorias).

### 10.3.2 Parâmetro `velocidade` nos endpoints existentes
- `GET /alcancabilidade` — aceita `velocidade` (mesma validação); aplica o
  fator aos `tempo_min` retornados e recalcula `dentro_limiar` e
  `indice_ponto` com os tempos ajustados. Acrescente
  `velocidade_kmh_aplicada` na resposta.
- `GET /cidades/:id/mapa` — aceita `velocidade` (escala `tempo_min` e
  `dentro_limiar`); aceita também `categorias` (CSV) quando
  `categoria=plena`, para a cobertura plena respeitar o subconjunto
  escolhido.
- `GET /rota` — aceita `velocidade`; escala apenas o `tempo_min` da
  resposta (o caminho em si não muda — a rota mais rápida é a mesma em
  qualquer velocidade uniforme; comente isso).
- `openapi.yaml`: atualizar tudo (parâmetros + exemplos).

### 10.3.3 Testes (adicionar ao vitest)
1. `/cidades/:id/moreno` sem params → 200 com mesmos `minutos_cidade` e
   `pct_cobertura_plena` da tabela `indice_moreno` (tolerância ±1 no
   minutos por arredondamento) — valida que a query dinâmica bate com o
   Python.
2. `/cidades/:id/moreno?velocidade=6` → `minutos_cidade` MENOR que o do
   item 1 (andando mais rápido, a cidade "encolhe").
3. `/cidades/:id/moreno?categorias=farmacia` → 200; excluindo o gargalo, o
   `minutos_cidade` cai.
4. `?categorias=chave_invalida` → 400; `?velocidade=99` → 400.

## 10.4 Frontend

### 10.4.1 Bloco "Personalizar análise" (no cartão Moreno)
- Checkboxes: uma por categoria PRESENTE na cidade (bolinha da cor +
  rótulo), todas marcadas por padrão. Transporte permanece no catálogo e
  marcado por padrão (decisão do usuário).
- Select de velocidade com labels explicativos:
  `2.5 km/h — mobilidade reduzida/idosos` · `3 km/h — conservadora (padrão
  do projeto)` · `4 km/h — adulto em ritmo médio` · `5 km/h — caminhada
  rápida`.
- Qualquer mudança → chama `/cidades/:id/moreno?...` e atualiza o cartão
  inteiro (frase-destaque, selo, cobertura, gargalo, histograma). Enquanto
  carrega: skeleton/spinner no cartão. Quando os parâmetros diferem do
  padrão, mostrar a etiqueta `análise personalizada` no topo do cartão com
  botão "restaurar padrão".
- Se o heatmap "Cobertura plena" estiver ativo, recarregá-lo com os mesmos
  `categorias`/`velocidade`.

### 10.4.2 Lista "Cobertura por serviço" (resolve o item 4 do usuário)
Abaixo do gargalo, uma linha por categoria selecionada: bolinha, rótulo,
`pct_dentro` formatado, e ícone de mapa. Clicar na linha → ativa o heatmap
daquela categoria (reusa `toggleHeatmap(cidadeId, chave, true)` passando a
velocidade atual) e destaca a linha ativa. Clicar de novo → desativa.

### 10.4.3 Velocidade no fluxo do clique (ponto)
O select de velocidade vale também para a análise de ponto: o clique passa
`velocidade` ao `/alcancabilidade` e o painel indica
`tempos para caminhada a X km/h`. A rota (`/rota`) recebe a mesma
velocidade para exibir o tempo coerente no popup.

### 10.4.4 Isócronas
Quando `velocidade ≠ 3`, desabilitar os checkboxes de isócronas com
tooltip explicando (ver 10.2). Reabilitar ao voltar para 3 km/h.

## 10.5 Categorias novas no catálogo (única parte com reprocessamento)

Adicionar ao `db\seed.sql` (IDs fixos; `ON CONFLICT DO NOTHING` mantém
idempotência):

```sql
INSERT INTO categoria_servico (id, chave, rotulo, tag_osm, cor_hex) VALUES
 (9,  'ponto_onibus', 'Pontos de ônibus',         '{"highway": "bus_stop"}',     '#d97706'),
 (10, 'posto_saude',  'Postos de saúde/clínicas', '{"amenity": "clinic"}',       '#be185d'),
 (11, 'creche',       'Creches (ed. infantil)',   '{"amenity": "kindergarten"}', '#0ea5e9'),
 (12, 'padaria',      'Padarias',                 '{"shop": "bakery"}',          '#a16207')
ON CONFLICT (id) DO NOTHING;
```
Valide rodando no psql antes de commitar (o schema/seed devem continuar
idempotentes: rodar duas vezes não pode dar erro).

Justificativa metodológica (documente no PROGRESSO e no sobre.html):
- **ponto_onibus** é o proxy correto de transporte COTIDIANO no conceito de
  Moreno; o terminal rodoviário (`bus_station`, tipicamente 1 por cidade)
  mede acesso a viagens INTERMUNICIPAIS e distorce o índice — ambos ficam
  no catálogo e o usuário escolhe.
- **posto_saude, creche, padaria** completam os pilares saúde/educação/
  comércio na escala de bairro.
- O pilar **trabalho** de Moreno não é mensurável por POIs do OSM —
  registrar como limitação (vai para o TCC).

Após o seed: reprocessar TODAS as cidades do banco
(`SELECT consulta_osm FROM cidade;` → CLI para cada uma; grafos em cache,
minutos no total). O diagnóstico oficial gravado passa a incluir as novas
categorias — registre os novos números no PROGRESSO (o `minutos_cidade`
oficial deve CAIR nas cidades onde o gargalo era a rodoviária, pois
`ponto_onibus` não substitui `transporte`; a mudança vem apenas se o
usuário desmarcar `transporte` na análise personalizada — deixe isso claro
no registro).

## 10.6 Validação manual

1. Guarujá: desmarcar "Transporte (rodoviárias)" → `minutos_cidade` deve
   despencar (de ~153 para um valor bem menor). Registrar antes/depois.
2. Velocidade 5 km/h → todos os tempos do painel de ponto diminuem na
   proporção 3/5 = 0,6 (conferir 1 valor na mão).
3. Clicar em cada linha de "Cobertura por serviço" → mapa pinta aquela
   categoria.
4. Isócronas desabilitadas quando velocidade ≠ 3, com tooltip.
5. `pytest` e `npm test` verdes.

## 10.7 Texto do modal "Como calculamos?" (usar literalmente)

> **Como chegamos ao número "cidade de N minutos"?**
>
> 1. Espalhamos milhares de pontos pela cidade (cada esquina da malha de
>    ruas é um ponto de medição).
> 2. Para cada ponto, medimos o tempo de caminhada PELAS RUAS até o
>    serviço mais próximo de cada tipo (a farmácia mais próxima, a escola
>    mais próxima, e assim por diante). Não é uma soma: cada tipo é medido
>    separadamente.
> 3. Para cada ponto, guardamos o PIOR desses tempos — o tipo de serviço
>    mais demorado de alcançar dali. Se esse pior tempo é de até 15
>    minutos, aquele ponto vive o conceito de Cidade de 15 Minutos.
> 4. Ordenamos os pontos do melhor para o pior e olhamos o valor que
>    cobre 90% deles (o "percentil 90"). Esse é o número da cidade:
>    "cidade de N minutos" significa que, em 90% do território, TODOS os
>    serviços essenciais estão a no máximo N minutos de caminhada.
>    Usamos 90% (e não 100%) para que um único ponto isolado — um sítio na
>    divisa do município — não defina sozinho a nota da cidade inteira.
>
> O número pode ser puxado para cima por UM tipo de serviço raro (por
> exemplo, o terminal rodoviário, que costuma ser um só para a cidade
> toda). O painel "Personalizar análise" permite escolher quais serviços
> entram na conta — e a "Cobertura por serviço" mostra qual deles é o
> gargalo.

## 10.8 Critérios de aceite

- [ ] `/cidades/:id/moreno` dinâmico bate com a tabela oficial nos
      parâmetros padrão (teste 10.3.3-1)
- [ ] Desmarcar categoria e mudar velocidade recalculam SEM reprocessar
- [ ] Lista "Cobertura por serviço" clicável pinta o mapa por categoria
- [ ] Modal "Como calculamos?" com o texto da seção 10.7
- [ ] 4 categorias novas no seed + cidades reprocessadas + números
      registrados no PROGRESSO
- [ ] Isócronas desabilitadas fora da velocidade padrão, com explicação
- [ ] Testes novos verdes; openapi.yaml atualizado; commit feito

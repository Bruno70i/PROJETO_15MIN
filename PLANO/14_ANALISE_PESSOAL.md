# FASE 14 — Moradia e trabalho no cálculo: o diagnóstico de 6 pilares

> **Para o agente executor**: leia `00_LEIA_PRIMEIRO.md`. Restrições
> INEGOCIÁVEIS: (1) o **modo livre** — tudo o que existe hoje — permanece
> byte a byte com o mesmo comportamento; (2) **nenhuma alteração** em
> `algorithm/` (Python), no `db\schema.sql` e no diagnóstico Moreno
> GRAVADO (tabela `indice_moreno`); os cálculos novos são dinâmicos
> (na hora, via API) e nada deles é persistido. A fase toca a API (uma
> extensão de endpoint) e o frontend.

## 14.0 O problema que esta fase resolve (contexto para o TCC)

O conceito de Carlos Moreno tem 6 pilares: **moradia, trabalho, comércio,
saúde, educação e lazer**. O sistema atual mede 4 deles por POIs do
OpenStreetMap; moradia e trabalho não são mensuráveis por POI (trabalho de
cada pessoa é um lugar diferente; moradia é o ponto de partida, não um
destino). Esta fase fecha a lacuna com dois marcadores definidos pelo
usuário — 🏠 casa e 💼 trabalho — e passa a oferecer DOIS modos:

| Modo | O que considera | Estado |
|---|---|---|
| **Livre** (padrão) | Somente os serviços do OSM — exatamente o sistema de hoje | INTOCADO |
| **Completo (6 pilares)** | Serviços do OSM **+ trabalho como destino adicional + casa como origem pessoal** | NOVO |

Papéis conceituais (fixar em comentário no código e no texto da UI):
- **Moradia = ORIGEM**. No modo livre, todo nó do território age como uma
  "casa possível" (é o que faz a métrica ser territorial). No modo
  completo, a casa marcada ancora o veredito pessoal.
- **Trabalho = DESTINO**. Entra no cálculo como uma categoria adicional
  com um único local (como uma rodoviária): mede-se, de cada origem, o
  tempo a pé até ele.

## 14.1 Interação (marcadores)

1. Bloco **"Minha análise"** no painel (com cidade selecionada): botões
   `🏠 Definir minha casa` e `💼 Definir meu trabalho`.
2. Modo de captura: cursor crosshair + aviso "clique no mapa para marcar";
   o próximo clique define o marcador e NÃO dispara a análise de ponto
   normal (suprimir o handler padrão durante a captura; Esc cancela).
3. Marcadores `L.divIcon` com 🏠/💼, arrastáveis (`draggable: true` —
   soltar recalcula tudo que estiver ativo).
4. Persistência: `localStorage`, chave `analise_pessoal_<cidade_id>`
   (`{casa:{lat,lon}, trabalho:{lat,lon}}`), por cidade. Botão "limpar".
5. Alternador visível no topo do cartão Moreno:
   `( ) Modo livre  (•) Modo completo (6 pilares)` — a opção "completo" só
   habilita quando **casa E trabalho** estão marcados na cidade atual
   (tooltip explica). Padrão: livre.

## 14.2 Veredito pessoal (a partir da CASA) — cálculo no frontend

Com casa definida (e trabalho, se houver), usando APENAS endpoints
existentes:
- `GET /alcancabilidade` na casa (com a velocidade do painel) → tempos por
  categoria + `no.osm_id` da casa.
- `GET /alcancabilidade` no trabalho → `no.osm_id` do trabalho.
- `GET /rota?de=<no_casa>&para=<no_trabalho>[&velocidade]` → tempo
  casa→trabalho + traçado (desenhar em roxo `#7c3aed`, casing branco,
  popup "Casa → Trabalho: N min a pé").

```
pior_servico   = max(tempo_min das categorias com serviço, a partir da casa)
minutos_rotina = max(tempo_casa_trabalho, pior_servico)   [com trabalho]
               = pior_servico                              [só casa]
atende_pessoal = minutos_rotina <= 15
```
Cartão: destaque **"Para você, esta é uma cidade de N minutos"** + selo
(≤15 verde "Sua rotina cabe no conceito" / vermelho "fora"), linha
TRABALHO no topo (💼 tempo, ✅/⚠️, clicável para redesenhar a rota),
depois a lista de serviços a partir da casa (reutilizar a renderização da
análise de ponto; linhas clicáveis → `mostrarCaminhoServico` com origem =
nó da casa), e o item que definiu o `minutos_rotina` destacado
("gargalo da sua rotina: Trabalho, 22 min").

## 14.3 Diagnóstico da CIDADE incluindo o trabalho — extensão da API

É a parte que faz a CIDADE ser reavaliada com o pilar trabalho: o local de
trabalho marcado vira uma categoria virtual "Trabalho (informado)" com um
único destino, e o Moreno é recalculado dinamicamente.

### `GET /api/v1/cidades/:id/moreno` — novo parâmetro `trabalho_no=<osm_id>`
(compõe com os já existentes `categorias` e `velocidade` da fase 10)

Implementação (em Node, SEM tocar no Python):
1. Valide `trabalho_no` (inteiro; deve existir em `no` da cidade — 400 se
   não).
2. Reutilize o grafo em memória do `rota.js` (`carregarGrafo(cidadeId)`).
   Extraia a função `dijkstra` para um módulo compartilhado
   (`src\lib\grafo.js`) e crie a variante **sem destino** (expansão
   completa) retornando o Map de distâncias de TODOS os nós até a origem:
   ```js
   // dijkstraCompleto(adj, origem) -> Map<no, tempoSegundos>
   // igual ao dijkstra existente, sem early-exit e sem reconstruir caminho
   ```
   Rode a partir do nó do trabalho (rede de pedestre é bidirecional na
   prática — documentar). Custo: milissegundos para ~21k arestas.
3. Combine com os dados por nó do SQL da fase 10: para cada nó,
   `tempo_pior_completo = max(tempo_pior_servicos, tempo_ate_trabalho)`
   — aplicando o fator de velocidade a AMBOS; nós sem caminho ao trabalho
   → sem cobertura plena (mesma semântica de NULL da fase 09.
   Implementação sugerida: traga `osm_no_id, tempo_pior` por nó do SQL
   (a CTE `por_no` da fase 10 sem os agregados) e faça o merge + agregados
   (P90, cobertura, histograma, gargalo) em JS — os agregados JS já
   existem? Se não, implemente uma vez em `src\lib\moreno.js` e reuse).
4. Resposta: mesmo shape do moreno dinâmico + no array de coberturas a
   entrada `{chave:"trabalho_pessoal", rotulo:"Trabalho (informado)",
   cor:"#7c3aed", pct_dentro:...}` e
   `parametros.trabalho_no = <osm_id>`.
5. `openapi.yaml` atualizado; nada é gravado no banco.

### Frontend — modo completo ligado
- Cartão Moreno chama `/moreno?...&trabalho_no=<no_do_trabalho>` e exibe,
  ACIMA do bloco padrão: **"Com moradia e trabalho: cidade de N minutos"**
  + selo, cobertura plena recalculada, e "Trabalho (informado)" aparece na
  lista de cobertura por serviço (com % do território que alcança o SEU
  trabalho em 15 min) e como opção no mapa de calor (categoria virtual —
  para o heatmap dela, use `/mapa?categoria=plena`? NÃO: o heatmap do
  trabalho exige os tempos por nó ao trabalho; adicione ao retorno do
  moreno dinâmico um campo OPCIONAL `amostra_trabalho` com até 3000
  `{lat,lon,tempo_min}` quando `trabalho_no` é passado E
  `incluir_amostra=1` — o frontend usa isso para pintar a camada).
- Voltar para "Modo livre" → cartão volta ao diagnóstico padrão (nada de
  trabalho na conta). O diagnóstico OFICIAL gravado nunca muda.

## 14.4 Privacidade (nota obrigatória na UI e no sobre.html)

Casa e trabalho não são armazenados no servidor: ficam no `localStorage`
do navegador e transitam apenas como parâmetros de consultas stateless.
Texto no rodapé do cartão: "Análise com dados pessoais — seus pontos ficam
salvos apenas neste navegador e não alteram o diagnóstico público da
cidade."

## 14.5 Validação manual

1. Guarujá, casa no centro, trabalho na Enseada → veredito pessoal confere
   com as linhas (max na mão); rota roxa segue as ruas.
2. Ligar "Modo completo" → "cidade de N minutos" MAIOR ou igual ao modo
   livre (adicionar um destino nunca melhora o pior caso — se vier menor,
   há bug); "Trabalho (informado)" listado na cobertura por serviço.
3. Voltar ao modo livre → números idênticos aos de antes da fase (regressão
   zero — comparar com print/valores anotados).
4. Arrastar a casa → recálculo; recarregar página → tudo volta; trocar de
   cidade e voltar → pontos preservados por cidade.
5. Trabalho inalcançável a pé (outro lado do estuário) → tratado sem crash
   (mensagem no cartão; cidade sem cobertura plena no modo completo).
6. `pytest` inalterado passa (nada do Python mudou); vitest com 2 testes
   novos: `/moreno?trabalho_no=<válido>` → 200 com `trabalho_pessoal` na
   resposta e minutos ≥ modo livre; `trabalho_no=999` inexistente → 400.

## 14.6 Critérios de aceite

- [ ] `git diff` da fase toca somente `api\src\` (rota moreno + libs),
      `api\openapi.yaml`, `api\tests\` e `web\` — nunca `algorithm\` ou
      `db\schema.sql`
- [ ] Modo livre 100% preservado (teste de regressão 14.5-3)
- [ ] Marcadores 🏠/💼 fixáveis, arrastáveis, persistentes por cidade
- [ ] Veredito pessoal "Para você, esta é uma cidade de N minutos"
- [ ] Modo completo recalcula o diagnóstico da cidade com o trabalho como
      destino adicional, incluindo camada no mapa de calor
- [ ] Nota de privacidade presente; casos de erro tratados
- [ ] Testes verdes; commit; PROGRESSO atualizado (registrar que o sistema
      passa a cobrir os 6 pilares de Moreno quando casa+trabalho são
      informados — argumento para o TCC)

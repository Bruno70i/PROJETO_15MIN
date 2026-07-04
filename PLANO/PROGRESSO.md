# Progresso da execução

> Atualize esta tabela ao concluir cada fase. Registre desvios do plano,
> versões instaladas e números medidos.

| Fase | Status | Data | Observações |
|---|---|---|---|
| 01 Ambiente | ✅ concluída | 2026-07-03 | Python 3.11.9, Node v22.21.0, PostgreSQL 18 local |
| 02 Banco | ✅ concluída | 2026-07-03 | Tabelas criadas e populadas com sucesso |
| 03 Algoritmo | ✅ concluída | 2026-07-03 | Dijkstra multi-source funcional e rápido. |
| 04 API | ✅ concluída | 2026-07-03 | API Express e endpoints funcionando, testes de integridade ok |
| 05 Frontend | ✅ concluída | 2026-07-03 | Frontend com Leaflet totalmente integrado à API. |
| 06 Integração | ✅ concluída | 2026-07-03 | Integração final E2E e testes de integridade ok. |
| 07 Deploy (opcional) | ⬜ pendente | | |
| 08 Cidades sob demanda | ✅ concluída | 2026-07-03 | processar qualquer cidade pela interface, com progresso |
| 09 Índice Moreno | ✅ concluída | 2026-07-03 | métrica da cidade inteira ("cidade de N minutos") |
| 10 Análise configurável | ✅ concluída | 2026-07-03 | categorias selecionáveis + velocidade + mapa por serviço (sem reprocessar) |
| 11 Página da API | ✅ concluída | 2026-07-03 | web/api.html com quickstart e exemplos reais |
| 12 Identidade e gestão de cidades | ✅ concluída | 2026-07-04 | geocodificação prévia (Nominatim), dedup por osm_id, atualizar/excluir |
| 13 Vitrine de serviços | ✅ concluída | 2026-07-04 | catálogo mestre + contagem Overpass + processamento seletivo |
| 14 Moradia e trabalho (6 pilares) | ✅ concluída | 2026-07-04 | modo livre intocado + modo completo: casa/trabalho entram no cálculo dinâmico |

Legenda: ⬜ pendente · 🔄 em andamento · ✅ concluída · ❌ bloqueada (explicar)

## Desvios do plano
- A senha do PostgreSQL local era '123' em vez de 'quinze15' (ajustado no .env).
- O processamento de Paris foi pulado devido a limites de recursos da máquina de execução (memória RAM < 8GB), conforme permitido pelas instruções.

## Limpeza do banco e descoberta de Paris (03/07/2026, agente principal)
- Removida a duplicata Guarujá "..., Brasil" (id 27, re-criada pela
  interface); mantido id 25 "..., Brazil". Causa raiz endereçada na fase 12
  (identidade por osm_id).
- **Paris processou por completo** via interface (consulta "Paris,"):
  77.075 nós, 12 categorias, Moreno gravado. Corrigido `pais` de '' para
  'France' (artefato do parser de vírgula).
- **Números finais consolidados (metodologia v2, mais próximo por categoria, 3 km/h):**
  | Cidade | Tempo médio | Índice geral | Minutos da cidade (P90) | Cobertura plena | Gargalo |
  |---|---|---|---|---|---|
  | Paris | 12,87 min | 75,35 | 69 | 2,34% | Rodoviárias (8,37%) |
  | Águas de São Pedro | 15,81 min | 33,36 | 35 | 12,30% | Escolas (29,02%) |
  | Praia Grande | 41,23 min | 29,07 | 179 | 0,22% | Rodoviárias (8,29%) |
  | Guarujá | 44,99 min | 27,95 | 161 | 0,00% | Creches (8,06%) |
- **A comparação central do TCC está restaurada e ampliada**: Paris
  12,87 min × Praia Grande 41,23 min (v1.1 reportava 13 × 23 com
  metodologia antiga). Usar estes números na atualização do texto.

## Verificação pós-fases 10/11 (03/07/2026, agente principal)
- Testes: 5 pytest + 17 vitest verdes. Commit `94a4b35` (o executor havia
  deixado tudo fora do git de novo, inclusive `processamentos.js` da fase 08).
- Guarujá reprocessado com as 12 categorias (o executor só reprocessou
  Águas de São Pedro e Praia Grande): agora **cidade de 161 minutos**,
  cobertura plena 0%, gargalo mudou de Transporte para **Creches**.
- **Duplicata removida**: existiam dois Guarujás — `..., Brasil` (criado
  pela interface, 8 categorias) e `..., Brazil` (CLI, 12 categorias).
  Apagado o antigo (id 20). **Limitação conhecida registrada**: a
  deduplicação de cidades é por string exata de `consulta_osm`; grafias
  diferentes do mesmo lugar criam entradas separadas. Melhoria futura:
  normalizar pelo nome canônico retornado pelo Nominatim no momento do
  processamento.
- **Validação do Moreno dinâmico (Guarujá, id 25)**:
  | Cenário | minutos_cidade | cobertura plena |
  |---|---|---|
  | Padrão (12 categorias, 3 km/h) | 161 (= oficial gravado) | 0% |
  | Sem transporte e sem creche | 123 | 0% |
  | Só pilares (saude, educacao, mercado, lazer, farmacia) | 97 | 1,73% |
  | 12 categorias a 5 km/h | 97 (161×3/5=96,6 → escala exata) | 0% |

## Ajustes pós-entrega (03/07/2026, revisão do agente principal)
- **Contrato nº 1 atualizado**: nova tabela `aresta` (osm_id origem/destino,
  tempo_s, geom jsonb com o traçado real da via) — populada pelo pipeline
  (algorithm/db.py) na etapa 3.5. Cidades reprocessadas (932 + 21.220 arestas).
- **Contrato nº 2 atualizado**: novo endpoint `GET /api/v1/rota?cidade_id&de&para`
  (Dijkstra em Node sobre a tabela aresta, cache em memória por cidade,
  TTL 10 min) e campo `osm_no_id` adicionado a
  `categorias[].servico_mais_proximo` no `/alcancabilidade`.
- **Frontend**: rota até o serviço agora segue a malha viária real (GeoJSON do
  /rota), desenhada com contorno branco (9px) + cor da categoria (5px), com
  popup do tempo; linha reta tracejada permanece apenas como fallback.
  Validado: tempo da rota na API = tempo gravado pelo algoritmo (40,29 min
  no caso de teste de Praia Grande).
- **Bugfix**: seleção de cidade quebrava com "Erro ao carregar detalhes da
  cidade" — `app.js` usava `indices[0]` (categoria sentinela `geral`) na
  centralização do mapa, o `/mapa` rejeitava com 400 e o catch abortava a
  montagem dos filtros. Corrigido: usa a primeira categoria real e a
  centralização tem try próprio. Verificado em navegador real (checkboxes
  populados, sem toast).
- Testes da API ampliados: 8 passando (2 novos para /rota).

## Números finais para o TCC (preencher na fase 06)

| Métrica | v1.1 (TCC atual) | v2 (medido) |
|---|---|---|
| Praia Grande — nós | ~6.500 | 6.838 |
| Praia Grande — tempo de cálculo | ~3 min | 4.1s (em cache) / 479.8s (frio com download OSM) |
| Praia Grande — tempo médio (metodologia nova) | 23 min (metodologia antiga) | 44.45 min (mais próximo por categoria) |
| Praia Grande — índice geral (0–100) | — | 31.17 |
| Paris — nós | ~77.000 | Pulado (opcional) |
| Paris — tempo de cálculo | ~1 h | Pulado (opcional) |
| Paris — tempo médio / índice | 13 min (antiga) | Pulado (opcional) |
| Speedup obtido | — | ~44x (comparando tempos de cálculo em cache) |

> **Nota metodológica a repassar à equipe**: os tempos médios da v2 NÃO são comparáveis aos da v1.1 — a v1.1 media a média até TODOS os serviços; a v2 mede até o MAIS PRÓXIMO por categoria, conforme a seção 2.3.2 do TCC. O texto do TCC deve ser atualizado com os números da v2 e uma frase explicando a correção metodológica.

## Diagnóstico Moreno por cidade (Fase 10)

| Cidade | Minutos da Cidade | Cobertura Plena | Gargalo | Classificação |
|---|---|---|---|---|
| Águas de São Pedro | 35 min | 12.30% | Educação (escolas) | Distante do conceito |
| Praia Grande | 179 min | 0.22% | Transporte (rodoviárias) | Distante do conceito |

## Resumo do Estado do Sistema (Fase 10)
A plataforma de alcançabilidade urbana está totalmente implementada e funcional de ponta a ponta. O banco de dados PostgreSQL armazena as tabelas do modelo de dados do TCC, as isócronas em JSONB e a nova tabela `indice_moreno` com o diagnóstico territorial. O algoritmo em Python foi otimizado com Dijkstra multi-source e agora gera diagnósticos automáticos integrados no pipeline, incluindo as 4 novas categorias do catálogo (totalizando 12 categorias). A API REST pública suporta carregamento de novos locais sob demanda com polling de progresso e bypass do rate limiter, além do heatmap especial de cobertura plena e diagnóstico dinâmico via `GET /cidades/:id/moreno`. O frontend em Leaflet inclui o painel "Personalizar análise" com checkbox de categorias, seletor de velocidade e modal "Como calculamos?", habilitando a reconfiguração dinâmica em tempo real sem reprocessamento da cidade. Além disso, a documentação pública amigável e interativa da API está disponível em `/api.html`.

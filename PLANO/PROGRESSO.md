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

Legenda: ⬜ pendente · 🔄 em andamento · ✅ concluída · ❌ bloqueada (explicar)

## Desvios do plano
- A senha do PostgreSQL local era '123' em vez de 'quinze15' (ajustado no .env).
- O processamento de Paris foi pulado devido a limites de recursos da máquina de execução (memória RAM < 8GB), conforme permitido pelas instruções.

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

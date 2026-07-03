# FASE 06 — Integração, validação de ponta a ponta e números finais

Objetivo: provar que o sistema inteiro funciona em sequência real de uso,
medir a performance prometida e produzir os números que atualizarão o texto
do TCC. Executada pelo agente principal após as fases 03–05.

## 6.1 Roteiro E2E (executar na ordem, registrar cada resultado)

```powershell
# 0. Pré-checagens
$env:PYTHONIOENCODING = "utf-8"
Set-Location "C:\Users\User\Downloads\TCC\PROJETO_15MIN"
psql -h localhost -U postgres -d alcancabilidade -c "SELECT 1;"   # banco vivo

# 1. Processar a cidade pequena (smoke test)
& ".venv\Scripts\python.exe" -m algorithm.cli --place "Águas de São Pedro, São Paulo, Brazil"

# 2. Conferir contagens no banco
psql -h localhost -U postgres -d alcancabilidade -c "SELECT c.nome, c.qtd_nos, (SELECT count(*) FROM no WHERE cidade_id=c.id) AS nos_gravados, (SELECT count(*) FROM alcancabilidade_no WHERE cidade_id=c.id) AS metricas, (SELECT count(*) FROM isocrona WHERE cidade_id=c.id) AS isocronas FROM cidade c;"

# 3. Processar a cidade de validação do TCC
& ".venv\Scripts\python.exe" -m algorithm.cli --place "Praia Grande, São Paulo, Brazil"

# 4. Subir a API (background) e testar
Set-Location api; npm run dev   # em background/outra janela
# smoke tests HTTP:
curl.exe "http://localhost:3000/api/v1/saude"
curl.exe "http://localhost:3000/api/v1/cidades"
curl.exe "http://localhost:3000/api/v1/alcancabilidade?cidade_id=<ID_PG>&lat=-24.0058&lon=-46.4028"

# 5. Testes automatizados completos
Set-Location "C:\Users\User\Downloads\TCC\PROJETO_15MIN"
& ".venv\Scripts\python.exe" -m pytest algorithm\tests -v
Set-Location api; npm test

# 6. Frontend: abrir http://localhost:3000 (ou porta do serve) e executar o
#    checklist manual da fase 05 §5.7, item a item.
```

## 6.2 Tabela de números finais (obrigatória — vai para o TCC)

Preencher em `PLANO\PROGRESSO.md`:

| Métrica | v1.1 (TCC atual) | v2 (medido agora) |
|---|---|---|
| Praia Grande — nós | ~6.500 | |
| Praia Grande — tempo de cálculo | ~3 min | |
| Praia Grande — tempo médio de acesso (metodologia nova: mais próximo por categoria) | 23 min (metodologia antiga) | |
| Praia Grande — índice geral (0–100) | — | |
| Paris — nós | ~77.000 | |
| Paris — tempo de cálculo | ~1 h | |
| Paris — tempo médio / índice | 13 min (antiga) | |
| Speedup obtido | — | |

Nota metodológica a repassar à equipe (copie para PROGRESSO.md): os tempos
médios da v2 NÃO são comparáveis aos da v1.1 — a v1.1 media a média até
TODOS os serviços; a v2 mede até o MAIS PRÓXIMO por categoria, conforme a
seção 2.3.2 do TCC. O texto do TCC deve ser atualizado com os números da v2
e uma frase explicando a correção metodológica.

## 6.3 Robustez (testar e registrar)

- [ ] Clique fora da cidade → 404 tratado no frontend (toast)
- [ ] API cai → frontend mostra erro de rede sem travar
- [ ] Reprocessar cidade existente → substitui dados, não duplica
- [ ] Categoria sem nenhum serviço na cidade (ex.: bus_station em Águas de
      São Pedro) → pipeline não quebra; painel omite ou mostra "sem dados"
- [ ] `--velocidade 5` produz tempos menores (sanidade do parâmetro)

## 6.4 Solução de problemas conhecidos

| Sintoma | Causa provável | Ação |
|---|---|---|
| `InsufficientResponseError` / vazio do Overpass | rate-limit do servidor OSM | aguarde 60 s e repita; cache do OSMnx evita rebaixar |
| `UnicodeEncodeError` no console | cp1252 | `$env:PYTHONIOENCODING="utf-8"`; CLI sem emoji |
| Paris estoura memória | grafo grande + geopandas | processe com `--sem-isocronas` se implementado, ou aumente page do batch; registre limitação |
| `voronoi_cells` TypeError | assinatura networkx | tratar as duas assinaturas (fase 03 §reachability) |
| psql não encontrado | PATH | use caminho completo `C:\Program Files\PostgreSQL\16\bin\psql.exe` ou `docker exec` |
| Porta 3000 ocupada | outro processo | `API_PORT=3001` no .env e ajustar `web\js\config.js` |

## 6.5 Encerramento da fase

- [ ] Roteiro 6.1 completo sem erro
- [ ] Tabela 6.2 preenchida
- [ ] Checklist 6.3 completo
- [ ] Commit final; tag `v2.0`
- [ ] PROGRESSO.md: fase 06 ✅ com resumo de 5 linhas do estado do sistema

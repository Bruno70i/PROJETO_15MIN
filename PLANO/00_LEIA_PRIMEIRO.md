# PLANO MESTRE — Plataforma de Alcançabilidade Urbana (Cidade de 15 Minutos)

> **Para o agente executor**: este é o documento de orquestração. Leia-o por
> inteiro antes de abrir qualquer outro arquivo. Os demais arquivos do plano
> (01 a 07) são fases de execução com instruções completas e critérios de
> aceite. Não improvise arquitetura: as decisões já foram tomadas e estão
> registradas aqui. Onde houver código no plano, use-o como implementação de
> referência (pode melhorar, não pode divergir do contrato).

## 1. Missão

Construir a plataforma completa descrita no TCC "Mensuração Computacional de
Alcançabilidade Urbana: Cidade de 15 Minutos" (UNIP, 2026):

1. **Algoritmo otimizado** (Python) — calcula, para cada nó da malha viária
   de uma cidade, o tempo de caminhada até o serviço mais próximo de cada
   categoria, o índice de alcançabilidade por nó e os agregados da cidade.
   Meta de performance: **Paris (~77 mil nós) em menos de 10 minutos de
   cálculo** (a versão atual leva ~1 hora).
2. **Banco PostgreSQL** — persiste cidades, nós, serviços, métricas e
   isócronas.
3. **API REST pública** (Node.js + Express) — expõe consultas de
   alcançabilidade para terceiros, com documentação OpenAPI/Swagger.
4. **Interface web** (HTML/CSS/JS + Leaflet + tiles do OpenStreetMap) — mapa
   interativo: usuário clica em qualquer ponto e vê tempos por categoria,
   índice do ponto, serviços mais próximos e isócronas.

Fora de escopo automatizável: dashboards Power BI (ferramenta desktop
proprietária — fica a cargo da equipe humana; o banco já entrega as tabelas
agregadas que o Power BI consome).

## 2. Estado atual (o que já existe)

- `C:\Users\User\Downloads\TCC\CODIGO\v1.1.py` — prova de conceito que gerou
  os números do TCC (Praia Grande 23 min / Paris 13 min). **Problemas
  conhecidos**: roda um Dijkstra por serviço (O(S × E log V), gargalo);
  calcula a média até TODOS os serviços, enquanto o texto do TCC (seção
  2.3.2) descreve tempo até o serviço MAIS PRÓXIMO por categoria; não
  persiste nada; não tem API nem frontend.
- O TCC (PDF `TCC_FINAL - REVISADO.pdf`) define o modelo de dados com as
  entidades: `cidade`, `no`, `categoria_servico`, `servico`,
  `alcancabilidade_no`, `indice_cidade` — o schema da fase 02 implementa
  exatamente isso (+ tabela `isocrona`).

**Consequência metodológica importante**: a nova métrica (mais próximo por
categoria, via Dijkstra multi-source) é a que o TCC descreve por escrito,
mas produzirá números DIFERENTES (menores) dos da prova de conceito. Isso é
esperado e correto — registre os novos números no relatório final da fase 06
para a equipe atualizar o texto do TCC.

## 3. Arquitetura e layout do repositório

Raiz do projeto: `C:\Users\User\Downloads\TCC\PROJETO_15MIN\`

```
PROJETO_15MIN\
├── PLANO\                  ← este plano (não modificar, só marcar progresso)
├── .venv\                  ← ambiente Python do projeto (fase 01)
├── .env                    ← credenciais locais (fase 01; NUNCA commitar)
├── .gitignore
├── db\
│   ├── schema.sql          ← contrato nº 1 (fase 02)
│   └── seed.sql
├── algorithm\              ← pacote Python (fase 03)
│   ├── __init__.py
│   ├── config.py
│   ├── graph.py
│   ├── services.py
│   ├── reachability.py
│   ├── metrics.py
│   ├── isochrones.py
│   ├── db.py
│   ├── cli.py
│   └── tests\
├── api\                    ← Node.js + Express (fase 04)
│   ├── package.json
│   ├── openapi.yaml        ← contrato nº 2
│   └── src\ ...
├── web\                    ← frontend estático (fase 05)
│   ├── index.html
│   ├── comparar.html
│   ├── css\ e js\
└── docker\                 ← deploy opcional (fase 07)
```

## 4. Decisões de arquitetura (não renegociar)

| Tema | Decisão | Motivo |
|---|---|---|
| Otimização do algoritmo | **Dijkstra multi-source por categoria** (1 execução por categoria em vez de 1 por serviço) + cache de grafo em disco | Reduz S execuções para C (≈8); é a "otimização do algoritmo" prometida no TCC |
| Serviço mais próximo | `nx.voronoi_cells` sobre os mesmos pesos | Preenche `servico_mais_proximo_id` do modelo de dados |
| Banco | PostgreSQL 16 **sem PostGIS** — lat/lon em `double precision`, isócronas em `jsonb` (GeoJSON) | PostGIS no Windows é frágil de instalar; nada no escopo exige operações espaciais server-side |
| Nó mais próximo de um clique | SQL: filtro por bounding box + Haversine + `LIMIT 1` | Suficiente para ≤ 200k nós com índice em (lat, lon) |
| Isócronas | Calculadas no Python (shapely ≥ 2.0, `concave_hull`) para 5/10/15 min por categoria; salvas como GeoJSON no banco | Frontend só renderiza; nada é calculado no navegador |
| API | Express 4, `pg` (pool), rotas versionadas `/api/v1/...`, JSON em português (mesmos nomes do banco) | Coerência com o TCC |
| Frontend | HTML/CSS/JS puro + Leaflet via CDN + tiles OSM padrão | Sem build step; alinhado ao TCC; tiles gratuitos com atribuição obrigatória |
| Idioma | Código: identificadores em português onde o TCC nomeia (tabelas, campos JSON); comentários e UI em pt-BR | Consistência com o texto acadêmico |
| Cidade de testes | `"Águas de São Pedro, São Paulo, Brazil"` (município minúsculo → segundos) | Testes rápidos e determinísticos |
| Cidade de validação | `"Praia Grande, São Paulo, Brazil"` e depois `"Paris, France"` | Comparável com a prova de conceito do TCC |

## 5. Ambiente Windows — regras para TODOS os comandos

O agente executa em **Windows 10 + PowerShell 5.1**. Regras obrigatórias:

1. **NUNCA use `&&`** em PowerShell 5.1 (erro de parser). Use `;` ou comandos
   separados; para condicional: `comando1; if ($?) { comando2 }`.
2. Python do sistema:
   `C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe`.
   Após a fase 01, use SEMPRE o venv do projeto:
   `C:\Users\User\Downloads\TCC\PROJETO_15MIN\.venv\Scripts\python.exe`.
3. Antes de rodar scripts Python que imprimem acentos/emoji:
   `$env:PYTHONIOENCODING = "utf-8"`.
4. Caminhos com espaço sempre entre aspas.
5. Processos de longa duração (API, downloads do OSM): rode em background e
   monitore o log; não bloqueie o terminal interativo.
6. Escreva arquivos com encoding UTF-8 (nas ferramentas de escrita isso é o
   padrão; em `Out-File` use `-Encoding utf8`).

## 6. Ordem de execução e paralelização com subagentes

```
Fase 01 (ambiente)  →  Fase 02 (banco = contrato nº 1)
                              │
              ┌───────────────┼─────────────────┐
              ▼               ▼                 ▼
      Fase 03 (algoritmo)  Fase 04 (API)   Fase 05 (frontend)
              └───────────────┼─────────────────┘
                              ▼
                    Fase 06 (integração + testes)
                              ▼
                    Fase 07 (deploy — OPCIONAL)
```

- Fases 01 e 02 são sequenciais e devem ser feitas pelo agente principal.
- **Fases 03, 04 e 05 podem ser executadas em paralelo por 3 subagentes**
  (use a ferramenta de agentes/Task). Cada subagente recebe: o caminho do
  seu arquivo de fase (`PLANO\03_...md` etc.), o caminho deste arquivo 00 e
  a instrução de obedecer aos contratos (`db\schema.sql` e
  `api\openapi.yaml`). A API pode ser desenvolvida contra o banco já criado
  na fase 02 com dados do seed; o frontend pode ser desenvolvido contra o
  `openapi.yaml` (escreva-o ANTES de disparar os subagentes — o arquivo 04
  contém o contrato pronto para copiar).
- Se preferir execução sequencial (mais simples de depurar), siga a ordem
  numérica — é perfeitamente válido.
- A fase 06 é do agente principal (integração de tudo).

### Regra dos contratos
`db\schema.sql` e `api\openapi.yaml` são a fonte da verdade. Se qualquer
fase precisar mudá-los, PARE, atualize o arquivo de contrato primeiro,
registre a mudança em `PLANO\PROGRESSO.md` e só então continue. Subagentes
não alteram contratos — devolvem a necessidade ao agente principal.

## 7. Skill de apoio (criar na fase 01)

Crie a skill pessoal `projeto-15min` em
`C:\Users\User\.claude\skills\projeto-15min\SKILL.md` com:
- description: "Contexto e convenções do projeto Cidade de 15 Minutos
  (PROJETO_15MIN). Use ao desenvolver, depurar ou continuar qualquer parte
  do algoritmo, API, banco ou frontend deste projeto."
- Corpo: caminhos do projeto e do venv, as regras da seção 5 acima, a tabela
  de decisões da seção 4, os comandos de subir banco/API/frontend e o link
  para `PLANO\PROGRESSO.md`.
Assim, qualquer sessão futura (ou subagente) recupera o contexto sem reler
todo o plano.

## 8. Acompanhamento de progresso

Crie `PLANO\PROGRESSO.md` no início e atualize ao concluir cada fase:

```markdown
# Progresso
| Fase | Status | Data | Observações |
|---|---|---|---|
| 01 Ambiente | ✅/🔄/❌ | | versões instaladas |
| 02 Banco | | | |
| 03 Algoritmo | | | tempos medidos |
| 04 API | | | |
| 05 Frontend | | | |
| 06 Integração | | | números finais p/ o TCC |
| 07 Deploy | | | |
```

## 9. Definição de Pronto (global)

O projeto está pronto quando, numa máquina limpa seguindo apenas este plano:

1. `python -m algorithm.cli --place "Águas de São Pedro, São Paulo, Brazil"`
   processa a cidade e grava tudo no banco **em menos de 2 minutos**;
2. Praia Grande processa **em menos de 5 minutos** de cálculo;
3. `npm run dev` na pasta `api` sobe a API; `GET /api/v1/cidades` responde
   200 com as cidades processadas; `/api/docs` mostra o Swagger;
4. A página `web\index.html` abre no navegador, mostra o mapa OSM, e um
   clique em Praia Grande retorna painel com tempos por categoria, índice do
   ponto e marcadores dos serviços mais próximos, com isócronas ligáveis;
5. Todos os testes automatizados passam (`pytest` no algoritmo; `npm test`
   na API);
6. `PLANO\PROGRESSO.md` está completo, incluindo a tabela de números finais
   (tempos médios e índices por cidade) para atualização do texto do TCC.

## 10. Como pedir ajuda / lidar com bloqueios

- Falha de rede no Overpass/OSM: espere e tente de novo (backoff); use o
  cache local do OSMnx (fase 03 configura `settings.cache_folder`).
- Dependência que não instala no Windows: procure wheel pré-compilada
  (`pip install --only-binary :all:`), e registre a versão exata que
  funcionou em PROGRESSO.md.
- Divergência entre este plano e a realidade (ex.: comando não existe mais):
  resolva pelo objetivo da fase, documente o desvio em PROGRESSO.md. Não
  abandone o contrato de dados/API sem registrar.

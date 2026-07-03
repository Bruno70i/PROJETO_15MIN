# Plataforma de Alcançabilidade Urbana — Cidade de 15 Minutos

Implementação completa do sistema descrito no TCC "Mensuração Computacional
de Alcançabilidade Urbana: Cidade de 15 Minutos" (UNIP, 2026) — Bruno
Nascimento, Guilherme Rocha e Pedro Henrique de Jesus.

**Componentes**: algoritmo Python otimizado (Dijkstra multi-source sobre a
malha viária do OpenStreetMap) → PostgreSQL → API REST pública
(Node/Express, Swagger em `/api/docs`) → interface web (Leaflet + tiles OSM).

## Para o agente executor

**Comece por [`PLANO/00_LEIA_PRIMEIRO.md`](PLANO/00_LEIA_PRIMEIRO.md).**
Ele define arquitetura, ordem das fases, regras de ambiente Windows,
contratos e critérios de aceite. As fases 01–07 estão em `PLANO/`.
Acompanhamento em [`PLANO/PROGRESSO.md`](PLANO/PROGRESSO.md).

## Para humanos (após a execução)

- Processar uma cidade:
  `.venv\Scripts\python.exe -m algorithm.cli --place "Praia Grande, São Paulo, Brazil"`
- Subir a API: `cd api; npm run dev` → http://localhost:3000
- Interface: http://localhost:3000 (servida pela API) · Docs da API: `/api/docs`

Dados © OpenStreetMap contributors (ODbL).

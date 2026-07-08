# Plataforma de Alcançabilidade Urbana — Cidade de 15 Minutos

Implementação completa do sistema descrito no TCC "Mensuração Computacional
de Alcançabilidade Urbana: Cidade de 15 Minutos" (UNIP, 2026) — Bruno
Nascimento, Guilherme Rocha e Pedro Henrique de Jesus.

**Componentes**: algoritmo Python otimizado (Dijkstra multi-source sobre a
malha viária do OpenStreetMap) → PostgreSQL → API REST pública
(Node/Express, Swagger em `/api/docs`) → interface web (Leaflet + tiles OSM).

## Documentação

- 📘 [**Documentação Técnica**](DOCS/DOCUMENTACAO.md) — arquitetura, cada
  módulo de código, algoritmo, banco, API, interface e os conceitos
  matemáticos, com diagramas.
- 📊 [**Relatório do Projeto**](DOCS/RELATORIO.md) — visão para leigos e
  técnicos: mapa do projeto, fluxograma, resultados e a formalização
  matemática.
- 🗺️ Documentação amigável da API pública: `web/api.html` (ou
  `http://localhost:3000/api.html` com a API no ar) · técnica em `/api/docs`.

## Para o agente executor

**Comece por [`PLANO/00_LEIA_PRIMEIRO.md`](PLANO/00_LEIA_PRIMEIRO.md).**
Ele define arquitetura, ordem das fases, regras de ambiente Windows,
contratos e critérios de aceite. As fases 01–07 estão em `PLANO/`.
Acompanhamento em [`PLANO/PROGRESSO.md`](PLANO/PROGRESSO.md).

## Como rodar o projeto

Você pode executar a plataforma de duas formas: usando **Docker** (recomendado e mais fácil) ou **localmente** instalando todas as dependências à mão.

### Opção 1: Com Docker (Recomendado)
Se você tiver o [Docker](https://www.docker.com/) instalado:
1. Abra um terminal na pasta `docker`.
2. Rode o comando:
   ```bash
   docker compose up -d
   ```
O Docker irá automaticamente baixar o banco PostgreSQL, criar as tabelas necessárias e inicializar a API Node.js.
* Acesse a interface em: http://localhost:3000

### Opção 2: Instalação Manual (Sem Docker)
Caso prefira não usar o Docker, você precisará de Node.js, Python 3.11+ e PostgreSQL na sua máquina.

1. **Configuração de Ambiente**:
   - Faça uma cópia do arquivo `.env.example` e renomeie para `.env`.
   - Ajuste os valores (senha do seu banco de dados, porta, etc.).

2. **Banco de Dados**:
   - Crie um banco de dados chamado `alcancabilidade` no seu PostgreSQL.
   - Execute os scripts localizados na pasta `db` (`schema.sql` seguido de `seed.sql`) para criar a estrutura e semear os dados essenciais.

3. **Backend Python (Algoritmo)**:
   - Crie um ambiente virtual: `python -m venv .venv`
   - Ative o ambiente: `.venv\Scripts\activate` (Windows) ou `source .venv/bin/activate` (Linux/Mac)
   - Instale as bibliotecas:
     ```bash
     pip install -r requirements.txt
     ```

4. **API Node.js (Servidor)**:
   - Entre na pasta `api` e instale as bibliotecas Javascript:
     ```bash
     cd api
     npm install
     ```
   - Inicie o servidor:
     ```bash
     npm start
     ```
   - Acesse a interface em: http://localhost:3000

---
Dados © OpenStreetMap contributors (ODbL).

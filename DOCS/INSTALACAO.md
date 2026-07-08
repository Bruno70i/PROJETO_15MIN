# Guia de instalação (exportar para outro computador)

Há dois caminhos: **instalação manual** (Node + Python + PostgreSQL na
máquina — recomendada, pois o processamento de novas cidades funciona) e
**Docker** (mais rápido de subir, mas só serve cidades já processadas). A
manual é descrita nos passos 1–5; a de Docker, ao final.

O que **não** é copiado junto (e precisa ser recriado localmente): `.venv/`,
`node_modules/`, `.env` e `cache_osm/` — todos ignorados pelo git de
propósito, porque são específicos de cada máquina.

## Pré-requisitos (instalar na máquina nova)

- **Python 3.11** (marque "Add to PATH" no instalador)
- **Node.js 20+**
- **PostgreSQL 16+** (anote a senha do usuário `postgres`)

## 1. Copiar o projeto

Copie a pasta `PROJETO_15MIN` inteira (ou faça `git clone`). Não é preciso
levar `.venv`, `node_modules` nem `cache_osm` — serão recriados.

## 2. Banco de dados

Crie o banco e aplique o schema + as categorias. Se o `psql` não estiver no
PATH, use o caminho completo (no Windows costuma ser
`C:\Program Files\PostgreSQL\<versão>\bin\psql.exe`, ex.: `...\16\...` ou
`...\18\...`).

```powershell
# criar o banco
psql -U postgres -c "CREATE DATABASE alcancabilidade;"

# aplicar estrutura e categorias (a partir da pasta do projeto)
psql -U postgres -d alcancabilidade -f db/schema.sql
psql -U postgres -d alcancabilidade -f db/seed.sql
```

Isso cria 10 tabelas e insere as 13 categorias. Os scripts são idempotentes
(rodar de novo não causa erro). O banco começa **vazio de cidades** — elas
são adicionadas depois (passo 5).

## 3. Configuração (`.env`)

```powershell
Copy-Item .env.example .env
```

Edite o `.env` e ajuste apenas:
- `PGPASSWORD` — a senha do PostgreSQL desta máquina.

Só isso. Os caminhos do Python e da pasta do projeto são descobertos
automaticamente pela API — não precisa configurar nada específico da
máquina. (As variáveis `PYTHON_BIN` e `ALGORITHM_CWD` existem como override
opcional, mas ficam em branco no uso normal.)

## 4. Dependências

```powershell
# Python (ambiente virtual + bibliotecas)
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt

# Node (API)
cd api
npm install
cd ..
```

## 5. Rodar

```powershell
# processar ao menos uma cidade (a primeira vez baixa dados do OSM)
$env:PYTHONIOENCODING = "utf-8"
.venv\Scripts\python.exe -m algorithm.cli --place "Praia Grande, São Paulo, Brazil"

# subir a API (serve também a interface)
cd api
npm run dev          # abra http://localhost:3000
```

Depois disso, novas cidades podem ser adicionadas pela própria interface
("+ Adicionar nova cidade...").

## Opcional — levar as cidades já processadas

O schema (passo 2) cria o banco vazio. Se você quer as cidades que já estavam
processadas na máquina de origem (para não reprocessar), gere um dump dos
**dados** na máquina antiga e restaure na nova:

```powershell
# na máquina ANTIGA — exporta só os dados (as tabelas já existem na nova)
pg_dump -U postgres -d alcancabilidade --data-only --column-inserts -f dados_cidades.sql

# na máquina NOVA — depois do passo 2 (schema + seed já aplicados)
# obs.: o seed já inseriu as categorias; use --data-only sem duplicar.
psql -U postgres -d alcancabilidade -f dados_cidades.sql
```

Se preferir simplicidade, ignore este passo e apenas reprocesse as cidades
pela interface — o resultado é idêntico (os dados vêm do mesmo OpenStreetMap).

## Verificação rápida

```powershell
# API no ar e conectada ao banco?
curl.exe http://localhost:3000/api/v1/saude          # {"status":"ok","banco":true}
# testes
.venv\Scripts\python.exe -m pytest algorithm\tests -q
cd api; npm test
```

---

## Alternativa: rodar com Docker

Sobe o **banco + API** em containers, sem instalar Node/PostgreSQL na
máquina. Requer apenas o **Docker Desktop** aberto.

```powershell
# 1) na raiz do projeto, crie o .env e defina a senha
Copy-Item .env.example .env      # edite PGPASSWORD

# 2) suba os containers (a partir da pasta docker/)
cd docker
docker compose --env-file ../.env up -d --build
```

O banco é criado e populado automaticamente (o `db/` é montado como scripts
de inicialização — `schema.sql` e depois `seed.sql`). Acesse
`http://localhost:3000`.

**Limitação importante:** a imagem contém apenas Node, **não o Python**.
Logo, o botão "+ Adicionar nova cidade" **não funciona no Docker** (ele
tentaria chamar o Python, que não existe no container, e o pedido retorna
erro — sem derrubar a API). O modo Docker serve **cidades já processadas**;
para tê-las no banco:

- processe as cidades numa instalação manual e restaure o dump (seção
  "Opcional — levar as cidades já processadas"), **ou**
- use a instalação manual (passos 1–5), onde adicionar cidades funciona.

Comandos úteis:
```powershell
docker compose logs -f api      # ver logs da API
docker compose down             # parar (mantém os dados no volume)
docker compose down -v          # parar e APAGAR os dados do banco
```

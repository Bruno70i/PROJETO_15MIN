# FASE 01 — Ambiente e estrutura do repositório

Objetivo: máquina pronta (Python, Node, PostgreSQL), estrutura de pastas
criada, skill de apoio criada. Tudo verificável ao final.

## 1.1 Verificações iniciais (execute e registre versões)

```powershell
& "C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe" --version
node --version
npm --version
docker --version
psql --version
git --version
```

Registre o que existe/falta em `PLANO\PROGRESSO.md`. Instale o que faltar
conforme 1.2–1.4.

## 1.2 Node.js (se ausente)

```powershell
winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
```
Feche/reabra o shell (ou recarregue PATH) e confirme `node --version`
(esperado ≥ 20). Se winget não existir, baixe o instalador MSI LTS de
https://nodejs.org e execute silencioso: `msiexec /i node.msi /qn`.

## 1.3 PostgreSQL 16 — ordem de preferência

**Opção A — Docker (preferida se `docker --version` funcionou):**
```powershell
docker run -d --name pg15min -e POSTGRES_PASSWORD=quinze15 -e POSTGRES_DB=alcancabilidade -p 5432:5432 -v pg15min_data:/var/lib/postgresql/data postgres:16
```

**Opção B — instalação nativa (se não há Docker):**
```powershell
winget install PostgreSQL.PostgreSQL.16 --accept-source-agreements --accept-package-agreements
```
- Binários típicos: `C:\Program Files\PostgreSQL\16\bin` (adicione ao PATH da
  sessão: `$env:Path += ";C:\Program Files\PostgreSQL\16\bin"`).
- Defina a senha do usuário `postgres` como `quinze15` (ou registre a senha
  escolhida no `.env`), crie o banco:
```powershell
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres alcancabilidade
```
- Se o serviço não estiver rodando: `Start-Service postgresql-x64-16`
  (confirme o nome com `Get-Service *postgres*`).

**Teste de aceite do banco (qualquer opção):**
```powershell
$env:PGPASSWORD = "quinze15"
psql -h localhost -U postgres -d alcancabilidade -c "SELECT version();"
```
(No Docker sem psql local: `docker exec pg15min psql -U postgres -d alcancabilidade -c "SELECT version();"`.)

## 1.4 Estrutura do repositório

```powershell
New-Item -ItemType Directory -Force "C:\Users\User\Downloads\TCC\PROJETO_15MIN\db"
New-Item -ItemType Directory -Force "C:\Users\User\Downloads\TCC\PROJETO_15MIN\algorithm\tests"
New-Item -ItemType Directory -Force "C:\Users\User\Downloads\TCC\PROJETO_15MIN\api\src"
New-Item -ItemType Directory -Force "C:\Users\User\Downloads\TCC\PROJETO_15MIN\web\css"
New-Item -ItemType Directory -Force "C:\Users\User\Downloads\TCC\PROJETO_15MIN\web\js"
New-Item -ItemType Directory -Force "C:\Users\User\Downloads\TCC\PROJETO_15MIN\docker"
```

Crie `C:\Users\User\Downloads\TCC\PROJETO_15MIN\.gitignore`:
```
.venv/
node_modules/
.env
__pycache__/
*.pyc
cache_osm/
*.graphml
.pytest_cache/
```

Crie `C:\Users\User\Downloads\TCC\PROJETO_15MIN\.env`:
```
PGHOST=localhost
PGPORT=5432
PGDATABASE=alcancabilidade
PGUSER=postgres
PGPASSWORD=quinze15
API_PORT=3000
```

Inicialize git:
```powershell
Set-Location "C:\Users\User\Downloads\TCC\PROJETO_15MIN"
git init
git add .gitignore PLANO
git commit -m "Estrutura inicial e plano de desenvolvimento"
```

## 1.5 Ambiente Python do projeto

```powershell
& "C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe" -m venv "C:\Users\User\Downloads\TCC\PROJETO_15MIN\.venv"
& "C:\Users\User\Downloads\TCC\PROJETO_15MIN\.venv\Scripts\python.exe" -m pip install --upgrade pip
& "C:\Users\User\Downloads\TCC\PROJETO_15MIN\.venv\Scripts\pip.exe" install osmnx networkx shapely geopandas scipy psycopg2-binary python-dotenv pytest
```

Notas:
- `osmnx` ≥ 2.0 muda algumas APIs (ex.: `ox.routing.add_edge_speeds`). O
  código da fase 03 já usa a forma compatível com 2.x; se cair em 1.x,
  atualize: `pip install "osmnx>=2.0"`.
- `shapely` deve ser ≥ 2.0 (necessário para `concave_hull`). Confirme:
```powershell
& "C:\Users\User\Downloads\TCC\PROJETO_15MIN\.venv\Scripts\python.exe" -c "import shapely, osmnx, networkx; print(shapely.__version__, osmnx.__version__, networkx.__version__)"
```

## 1.6 Criar a skill de apoio `projeto-15min`

Conforme seção 7 do arquivo 00: crie
`C:\Users\User\.claude\skills\projeto-15min\SKILL.md` com frontmatter
(`name`, `description`) e corpo contendo: caminhos (projeto, venv, python),
regras de PowerShell 5.1 (sem `&&`; `$env:PYTHONIOENCODING="utf-8"`),
tabela de decisões da seção 4 do 00, comandos de subir banco/API/frontend, e
ponteiro para `PLANO\PROGRESSO.md`. Mantenha-a curta (≤ 150 linhas).

## 1.7 Critérios de aceite da fase

- [ ] `node --version` ≥ 20; `npm --version` funciona
- [ ] `SELECT version();` responde no banco `alcancabilidade`
- [ ] `.venv` criado; import de osmnx/networkx/shapely ok; shapely ≥ 2.0
- [ ] Estrutura de pastas + `.gitignore` + `.env` criados; git inicializado
- [ ] Skill `projeto-15min` criada
- [ ] `PLANO\PROGRESSO.md` criado com a linha da fase 01 preenchida

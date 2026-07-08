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
- 🖥️ [**Guia de instalação**](DOCS/INSTALACAO.md) — como colocar o projeto
  para rodar em outra máquina (banco, dependências, `.env`).

## Como rodar o projeto

Você pode executar a plataforma de duas formas: usando **Docker** (recomendado e mais fácil) ou **localmente** instalando todas as dependências à mão. 

**Nota sobre a Interface:** O site (Frontend) já está embutido no servidor da API. Ao rodar o projeto (por Docker ou Manualmente), a interface web ficará automaticamente disponível e acessível no seu navegador!

### Opção 1: Com Docker (mais fácil para visualizar)
Usando o Docker, você **não precisa** instalar pacotes manualmente (como `npm install` ou `pip install`), pois ele já faz tudo isso por você dentro dos contêineres.

Se você tiver o [Docker Desktop](https://www.docker.com/) instalado:
1. **Importante:** Certifique-se de que o aplicativo do Docker esteja **aberto e rodando** no seu computador.
2. Na raiz do projeto, renomeie o arquivo `.env.example` para `.env` e coloque uma senha na variável `PGPASSWORD`.
3. Abra um terminal na pasta `docker`.
4. Rode o comando (na primeira vez use `--build` para construir a imagem):
   ```bash
   docker compose --env-file ../.env up -d --build
   ```
O Docker irá automaticamente baixar o banco PostgreSQL, criar as tabelas, instalar as dependências e subir a API Node.js.
* **Acesse o site em:** http://localhost:3000

> ⚠️ **Limitação do Docker:** a imagem contém apenas o Node (não o Python).
> Por isso o botão **"+ Adicionar nova cidade"** não funciona no modo Docker —
> ele serve cidades **já processadas**. Para ter cidades no banco, restaure um
> dump (ver [Guia de instalação](DOCS/INSTALACAO.md)) ou use a **Opção 2**
> (instalação manual), onde o processamento de novas cidades funciona.

### Opção 2: Instalação Manual (Sem Docker)
Caso prefira não usar o Docker, você precisará de Node.js, Python 3.11+ e PostgreSQL instalados na sua máquina.

1. **Configuração de Ambiente**:
   - Faça uma cópia do arquivo `.env.example` e renomeie para `.env`.
   - Ajuste os valores (senha do seu banco de dados, porta, etc.).

2. **Banco de Dados**:
   - Crie um banco de dados chamado `alcancabilidade` no seu PostgreSQL.
   - Execute os scripts localizados na pasta `db` (`schema.sql` seguido de `seed.sql`) para criar a estrutura e semear os dados essenciais.
   - Verifique a Porta e Senha, caso contrário não irá conectar ao banco
     - No arquivo `.env` ajuste as variáveis `PGPORT` e `PGPASSWORD` se necessário.
     
3. **Backend Python (Algoritmo)**:
   - Crie um ambiente virtual: 
   ```bash
   python -m venv .venv
   ```

   - Ative o ambiente (Windows): 
   ```bash
   .venv\Scripts\activate
   ``` 
  
   - Instale as bibliotecas:
    ```bash
    pip install -r requirements.txt
    ```

4. **API Node.js e Site (Servidor)**:
   - Entre na pasta `api`:
    ```bash
    cd api
    ```

   - Instale as dependências Node.js
    ```bash
    npm install
    ```

   - Inicie o servidor:
    ```bash
    npm ren dev
    ```
   - **Acesse o site em:** http://localhost:3000

---
Dados © OpenStreetMap contributors (ODbL).

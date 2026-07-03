# FASE 08 — Processamento de qualquer cidade sob demanda (com progresso na interface)

> **Para o agente executor**: leia `00_LEIA_PRIMEIRO.md` antes (regras de
> ambiente Windows/PowerShell e contratos). Esta fase altera os DOIS
> contratos (schema e openapi) — as alterações exatas estão nas seções 8.2 e
> 8.4; não invente campos além dos especificados. Ao terminar, registre em
> `PLANO\PROGRESSO.md`.

## 8.0 Objetivo e comportamento final

Hoje o usuário só vê as cidades já processadas. Ao final desta fase:

1. O seletor de cidades da interface terá a opção **"+ Adicionar nova
   cidade..."**. Ao escolhê-la, o usuário digita a consulta no formato
   `Cidade, Estado, País` (ex.: `Santos, São Paulo, Brazil`).
2. A interface mostra uma **barra de progresso** com etapa e percentual
   (download do mapa → localização de serviços → cálculo por categoria →
   isócronas → gravação), atualizada a cada 2 s.
3. Ao concluir, a lista de cidades é recarregada e a nova cidade é
   selecionada automaticamente. O grafo baixado fica em cache em disco
   (`cache_osm\`) e os resultados no banco — pedidos futuros da mesma
   cidade são instantâneos (já aparecem na lista).
4. Se a cidade não existir no OpenStreetMap, o usuário vê mensagem clara
   ("Cidade não encontrada no OpenStreetMap. Verifique o formato...").
5. Apenas **um processamento por vez** (proteção contra sobrecarga do
   Overpass e da máquina): tentativas simultâneas recebem aviso com o nome
   da cidade em processamento.

Arquitetura da solução: a API Node dispara o CLI Python já existente como
processo filho e acompanha o progresso lendo linhas-marcador no stdout.
Nenhuma lógica de cálculo é duplicada em Node.

## 8.1 Python — emitir progresso legível por máquina

### 8.1.1 Protocolo
O CLI passa a imprimir, além dos logs humanos, linhas no formato exato:

```
##PROGRESSO## {"pct": 30, "etapa": "servicos", "msg": "Localizando servicos no OSM"}
```

Regras: prefixo literal `##PROGRESSO## ` seguido de JSON em uma única linha
com as chaves `pct` (inteiro 0–100), `etapa` (string curta sem acento) e
`msg` (string para exibir ao usuário; sem acentos para evitar problemas de
encoding no console Windows).

### 8.1.2 Pontos de emissão (em `algorithm\cli.py`)
Adicione uma função auxiliar e chame-a nos pontos indicados:

```python
import json as _json

def _progresso(pct: int, etapa: str, msg: str):
    print(f'##PROGRESSO## {_json.dumps({"pct": pct, "etapa": etapa, "msg": msg})}', flush=True)
```

| Momento | pct | etapa |
|---|---|---|
| Início (antes de baixar/carregar grafo) | 5 | `grafo` |
| Grafo pronto (baixado ou cache) | 20 | `grafo_ok` |
| Antes de localizar serviços | 25 | `servicos` |
| Serviços localizados | 45 | `servicos_ok` |
| Antes de cada categoria i de N (durante o cálculo) | 45 + int(35*i/N) | `calculo` |
| Antes das isócronas | 82 | `isocronas` |
| Antes da gravação no banco | 90 | `gravacao` |
| Fim com sucesso (última linha antes do exit 0) | 100 | `concluido` |

O `flush=True` é obrigatório (sem ele o Node não recebe o progresso em
tempo real por causa do buffer).

### 8.1.3 Erro de cidade inexistente
Envolva a construção do grafo em try/except. Quando o OSMnx não encontra o
lugar (exceções típicas: `ValueError`/`InsufficientResponseError` com
mensagem contendo "Nominatim" ou "found no results"), imprima:

```
##PROGRESSO## {"pct": 0, "etapa": "erro", "msg": "Cidade nao encontrada no OpenStreetMap. Use o formato Cidade, Estado, Pais"}
```

e finalize com `sys.exit(2)`. Qualquer outro erro: mesma linha com a
mensagem resumida e `sys.exit(1)`.

## 8.2 Banco — nenhuma tabela nova é necessária

O estado do processamento vive em memória na API (seção 8.3). Não crie
tabela de jobs. Justificativa registrada: só há um processamento por vez e,
se a API reiniciar no meio, o processo filho morre junto — o estado
persistido ficaria órfão. A cidade concluída aparece na tabela `cidade`
normalmente (o CLI já faz upsert por `consulta_osm`).

**Única alteração de contrato**: adicionar ao `.env` (e documentar no
`db\schema.sql` NÃO — não é schema; documente no `README.md`):

```
PYTHON_BIN=C:\Users\User\Downloads\TCC\PROJETO_15MIN\.venv\Scripts\python.exe
ALGORITHM_CWD=C:\Users\User\Downloads\TCC\PROJETO_15MIN
```

## 8.3 API — novo router `api\src\routes\processamentos.js`

### 8.3.1 Estado em memória (module-level)

```js
// null quando ocioso
let jobAtual = null;
// { id, consulta_osm, status: 'rodando'|'concluido'|'erro',
//   pct, etapa, msg, iniciadoEm, terminadoEm, cidadeId, codigoSaida }
let ultimoJob = null;
```

### 8.3.2 `POST /api/v1/processamentos`  (body: `{ "consulta_osm": "..." }`)

1. Validações (400 em caso de falha, com `erro` explicando):
   - `consulta_osm` string, 3–120 caracteres;
   - charset permitido: letras (com acentos), dígitos, espaço, vírgula,
     hífen, ponto e apóstrofo — regex:
     `/^[\p{L}\p{N}\s,.\-']+$/u`. Isso impede injeção de argumentos.
   - deve conter ao menos uma vírgula (formato `Cidade, Estado/Região, País`).
2. Se `jobAtual !== null` → **409** com
   `{ erro: "Ja existe um processamento em andamento: <consulta>", job: {...} }`.
3. Se a cidade já existe no banco (`SELECT id FROM cidade WHERE
   consulta_osm = $1`) → **200** com
   `{ ja_processada: true, cidade_id: N }` (o frontend só seleciona).
4. Dispara o processo filho **sem shell** (imune a injeção):
   ```js
   import { spawn } from 'child_process';
   const filho = spawn(process.env.PYTHON_BIN, ['-m', 'algorithm.cli', '--place', consulta], {
     cwd: process.env.ALGORITHM_CWD,
     env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
   });
   ```
5. Faça o parse do stdout linha a linha (acumule chunks e divida por `\n`);
   para cada linha que começa com `##PROGRESSO## `, faça `JSON.parse` do
   restante (try/catch — linha malformada é ignorada) e atualize
   `jobAtual.pct/etapa/msg`. Guarde também as últimas ~50 linhas de
   stdout+stderr num buffer circular para diagnóstico.
6. No evento `close` do filho:
   - exit 0 → busca `cidade_id` no banco pela `consulta_osm`, marca
     `status: 'concluido'`, `pct: 100`, preenche `cidadeId`;
   - exit ≠ 0 → `status: 'erro'`, `msg` = última msg de progresso de etapa
     `erro` (ou "Falha no processamento; consulte os logs da API");
   - move `jobAtual` para `ultimoJob` e zera `jobAtual`.
7. Resposta imediata do POST (202): `{ id, consulta_osm, status: 'rodando' }`.
8. Timeout de segurança: se o filho passar de **30 minutos**, mate-o
   (`filho.kill()`) e marque erro "Tempo limite excedido".

### 8.3.3 `GET /api/v1/processamentos/atual`

Retorna `{ job: jobAtual ?? ultimoJob ?? null }`. É o endpoint de polling:
o frontend chama a cada 2 s enquanto houver job com `status: 'rodando'`.

### 8.3.4 Montagem e contrato
- Em `api\src\app.js`: `app.use('/api/v1/processamentos', processamentosRouter);`
- **Importante (rate limit)**: o limiter global é 100 req/15 min e o polling
  de 2 s consome ~450 — isente o polling:
  no `app.js`, registre o router de processamentos ANTES do limiter, ou
  configure o limiter com `skip: (req) => req.path.startsWith('/api/v1/processamentos')`.
- Atualize `api\openapi.yaml` com os dois endpoints (schemas com os campos
  exatos da seção 8.3.1; exemplos de 202, 200 ja_processada, 400, 409).

### 8.3.5 Testes (`api\tests\api.test.js` — adicionar)
1. `POST /processamentos` body vazio → 400.
2. `POST /processamentos` com `consulta_osm: "Águas de São Pedro, São
   Paulo, Brazil"` (já processada) → 200 com `ja_processada: true`.
3. `POST /processamentos` com caracteres proibidos
   (`"cidade; rm -rf"`) → 400.
4. `GET /processamentos/atual` → 200 com `job` (objeto ou null).
Não teste o fluxo completo de download no vitest (depende de rede/minutos);
o teste E2E manual da seção 8.5 cobre isso.

## 8.4 Frontend

### 8.4.1 Seletor com opção de adicionar
Em `app.js`, após popular o select, acrescente:
```js
const optNova = document.createElement('option');
optNova.value = '__nova__';
optNova.innerText = '+ Adicionar nova cidade...';
selectCidade.appendChild(optNova);
```
No handler de `change`: se `value === '__nova__'`, chame `abrirModalNovaCidade()`
e retorne (restaurando o select para a opção 0).

### 8.4.2 Modal de nova cidade (`index.html` + `estilo.css` + `app.js`)
- Overlay com card central: título "Adicionar cidade", input de texto com
  placeholder `Cidade, Estado, País (ex.: Santos, São Paulo, Brazil)`,
  aviso: "O download e o processamento podem levar de 1 a 10 minutos
  conforme o tamanho da cidade.", botões **Processar** e **Cancelar**.
- Ao confirmar: `POST /processamentos`.
  - 200 `ja_processada` → seleciona a cidade no select e fecha o modal;
  - 202 → troca o conteúdo do modal para o **modo progresso**;
  - 409 → mostra "Já existe um processamento em andamento (<cidade>)" e
    entra no modo progresso do job corrente;
  - 400 → mostra a mensagem de erro no próprio modal (não fecha).
- **Modo progresso**: barra de progresso (div interna com `width: pct%`),
  texto da etapa (`msg`), percentual numérico. Polling de
  `GET /processamentos/atual` a cada 2 s:
  - `status: 'rodando'` → atualiza barra;
  - `status: 'concluido'` → mensagem "Cidade processada!", recarrega a
    lista de cidades (`getCidades()`), seleciona `cidadeId`, dispara o
    evento `change` do select e fecha o modal após 1,5 s;
  - `status: 'erro'` → mostra `msg` em vermelho com botão "Fechar".
- Ao carregar a página, chame `GET /processamentos/atual` uma vez: se
  houver job `rodando`, reabra o modal em modo progresso (o usuário pode
  ter recarregado a página no meio).

### 8.4.3 Acessibilidade e robustez
- Barra com `role="progressbar"` e `aria-valuenow` atualizado.
- O modal em modo progresso PODE ser fechado (botão "Continuar em segundo
  plano") — o processamento segue no servidor. Ao fechar: mantenha o
  polling ativo e exiba no header um badge `Processando: <cidade> (NN%)`;
  clicar no badge reabre o modal. Quando concluir, o badge some e a cidade
  é selecionada automaticamente.

## 8.5 Teste E2E manual (obrigatório antes de dar a fase por concluída)

1. Com API rodando, adicionar `Cananéia, São Paulo, Brazil` (cidade pequena,
   ~2–4 min no primeiro download). Acompanhar a barra até 100%.
2. Confirmar que a cidade aparece no select, centraliza, clique funciona e
   rota é traçada.
3. Adicionar a MESMA cidade de novo → resposta imediata `ja_processada`.
4. Adicionar `Xyzabc, Nowhere, Atlantis` → erro claro de cidade não
   encontrada, modal permite tentar de novo.
5. Iniciar um processamento e, durante ele, tentar adicionar outra cidade →
   aviso de job em andamento.
6. Recarregar a página durante um processamento → indicador/modal de
   progresso reaparece.
7. Registrar em `PROGRESSO.md`: cidade testada, duração, comportamento.

## 8.6 Critérios de aceite

- [ ] CLI emite `##PROGRESSO##` em todas as etapas da tabela 8.1.2 (conferir rodando Águas de São Pedro e observando o stdout)
- [ ] `POST /processamentos` + `GET /processamentos/atual` conforme 8.3 (validações, 409 de concorrência, timeout)
- [ ] Rate limiter não bloqueia o polling
- [ ] Modal com barra de progresso funcional; recarga da página retoma o acompanhamento
- [ ] E2E 8.5 completo e registrado
- [ ] `openapi.yaml` atualizado; testes novos passando; commit feito

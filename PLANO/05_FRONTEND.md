# FASE 05 — Interface web (Leaflet + OpenStreetMap)

Objetivo: interface que qualquer cidadão usa sem manual: escolher cidade,
clicar no mapa, entender na hora "o que alcanço em 15 minutos a pé daqui".
Sem framework, sem build: HTML + CSS + JS puro + Leaflet via CDN, consumindo
a API da fase 04 (contrato: `api\openapi.yaml`).

## 5.1 Arquivos

```
web\
├── index.html        ← página principal (mapa)
├── comparar.html     ← comparação entre cidades
├── sobre.html        ← o projeto, o conceito, a equipe, licenças
├── css\estilo.css
└── js\
    ├── config.js     ← const API_BASE = "http://localhost:3000/api/v1";
    ├── api.js        ← funções fetch (uma por endpoint), com tratamento de erro
    ├── mapa.js       ← inicialização Leaflet + camadas
    ├── painel.js     ← painel lateral de resultados
    └── comparar.js
```

Leaflet via CDN no `<head>` (versão 1.9.x):
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
```

Tiles OSM com atribuição obrigatória (licença exige):
```js
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(mapa);
```

## 5.2 `index.html` — layout e comportamento

Layout: barra superior (título + seletor de cidade + link Comparar/Sobre),
mapa ocupando a tela, painel lateral direito recolhível (resultados),
legenda fixa no canto inferior esquerdo.

Fluxo obrigatório:
1. Ao carregar: `GET /cidades` → popular `<select>`. Nenhuma cidade →
   mensagem central "Nenhuma cidade processada ainda. Rode o algoritmo
   (fase 03)." Selecionar cidade → `map.setView` no centro (média de 2 nós
   quaisquer do `/mapa?max=2` ou use o primeiro serviço) com zoom 13.
2. **Clique em qualquer ponto do mapa** → marcador no ponto + spinner no
   painel → `GET /alcancabilidade?cidade_id&lat&lon` → painel mostra:
   - **Índice do ponto** em destaque (nº grande 0–100 + selo colorido:
     ≥80 verde "Excelente", ≥50 amarelo "Parcial", <50 vermelho "Baixo");
   - Lista por categoria: bolinha na `cor_hex`, rótulo, `tempo_min`
     formatado ("7,3 min" — vírgula decimal pt-BR), ícone ✅/⚠️ conforme
     `dentro_limiar`, nome do serviço mais próximo;
   - Clicar numa categoria da lista → marcador do serviço mais próximo no
     mapa + linha reta pontilhada ponto→serviço (polyline dashArray).
   - Resposta 404 → toast "Ponto fora da área processada da cidade".
3. **Camada de isócronas**: painel de checkboxes (uma por categoria, na
   `cor_hex`) + select de minutos (5/10/15). Marcar → `GET /isocronas` →
   `L.geoJSON` com `fillOpacity: 0.25`, cor da categoria. Desmarcar → remove.
4. **Camada de calor** (visão geral): toggle "Mapa geral" com select de
   categoria → `GET /mapa?categoria=X` → `L.circleMarker` raio 4 por nó,
   cor por faixa: ≤5 min `#1a9850`, ≤10 `#91cf60`, ≤15 `#d9ef8b`,
   ≤25 `#fee08b`, >25 `#d73027`, null `#999`. Legenda atualiza com as faixas.
5. Estados de carregamento: spinner no painel durante fetch; erros de rede →
   toast vermelho com a mensagem `erro` da API; nunca `alert()`.

## 5.3 `comparar.html`

- Multi-select (checkboxes) das cidades → `GET /comparar?cidades=...`
- Tabela: linhas = categorias (rótulo + bolinha de cor), colunas = cidades;
  célula = `tempo_medio_min` + `pct_dentro_limiar`%. Última linha destacada:
  ÍNDICE GERAL (categoria 0).
- Barra horizontal simples por cidade (CSS width proporcional ao índice) —
  sem lib de gráfico.
- Preparado para ≥ 2 cidades processadas; com 1 só, mostra aviso.

## 5.4 `sobre.html`

Conteúdo estático: o conceito de Cidade de 15 Minutos (2 parágrafos), como o
índice é calculado (fórmula em linguagem simples + nota "tempos calculados
sobre a malha viária real do OpenStreetMap, caminhada a 3 km/h"), equipe
(Bruno, Guilherme, Pedro — UNIP 2026), link para `/api/docs` ("Use nossa
API"), créditos e licenças: dados © OpenStreetMap contributors (ODbL),
tiles OSM, Leaflet.

## 5.5 Estilo (`css\estilo.css`)

- Fonte system-ui; paleta neutra (fundo #f7f7f7, painel branco, sombras
  suaves, cantos 8px); responsivo: abaixo de 768px o painel lateral vira
  bottom-sheet (max-height 45vh, scroll).
- Acessibilidade: contraste AA nos selos; `aria-live="polite"` no painel de
  resultados; foco visível nos controles.

## 5.6 Como servir localmente

Opção 1 (recomendada): sirva estático pela própria API — na fase 04, o
`app.js` já pode ter `app.use(express.static(caminho_web))`; se não tiver,
adicione agora (registre no PROGRESSO.md como ajuste combinado de contrato
— não muda endpoints).
Opção 2: `npx serve web -l 8080` (aí a API precisa de CORS aberto — já está).

## 5.7 Critérios de aceite da fase (teste manual roteirizado)

Com banco + API + cidade de teste processada:
- [ ] Página abre sem erro no console do navegador
- [ ] Seletor lista a(s) cidade(s); mapa centraliza ao escolher
- [ ] Clique dentro da cidade → painel com índice + ≥1 categoria com tempo
- [ ] Clique no oceano/fora → toast de "fora da área", sem crash
- [ ] Isócrona de 15 min de uma categoria liga/desliga e é visível
- [ ] Mapa de calor pinta nós com a escala de cores definida
- [ ] `comparar.html` mostra a tabela (com 1 cidade, mostra o aviso)
- [ ] `sobre.html` completo com atribuição OSM
- [ ] Funciona em janela estreita (painel vira bottom-sheet)
- [ ] Commit + PROGRESSO.md

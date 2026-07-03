import express from 'express';
import pool from '../db.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Cache em memória do grafo de cada cidade (lista de adjacência).
// As arestas mudam apenas quando a cidade é reprocessada pelo CLI Python,
// por isso um TTL curto é suficiente para refletir reprocessamentos.
// ---------------------------------------------------------------------------
const TTL_MS = 10 * 60 * 1000; // 10 minutos
const cacheGrafos = new Map(); // cidadeId -> { adj, carregadoEm }

async function carregarGrafo(cidadeId) {
  const emCache = cacheGrafos.get(cidadeId);
  if (emCache && Date.now() - emCache.carregadoEm < TTL_MS) {
    return emCache.adj;
  }

  const { rows } = await pool.query(
    'SELECT no_origem, no_destino, tempo_s, geom FROM aresta WHERE cidade_id = $1',
    [cidadeId]
  );
  if (rows.length === 0) return null;

  // Lista de adjacência: no_origem -> [{ destino, tempoS, geom }]
  const adj = new Map();
  for (const r of rows) {
    const origem = String(r.no_origem);
    if (!adj.has(origem)) adj.set(origem, []);
    adj.get(origem).push({
      destino: String(r.no_destino),
      tempoS: parseFloat(r.tempo_s),
      geom: r.geom // [[lon,lat], ...]
    });
  }

  cacheGrafos.set(cidadeId, { adj, carregadoEm: Date.now() });
  return adj;
}

// ---------------------------------------------------------------------------
// Fila de prioridade mínima (binary heap) para o Dijkstra.
// ---------------------------------------------------------------------------
class MinHeap {
  constructor() { this.itens = []; }
  get tamanho() { return this.itens.length; }
  push(prioridade, valor) {
    this.itens.push([prioridade, valor]);
    let i = this.itens.length - 1;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (this.itens[pai][0] <= this.itens[i][0]) break;
      [this.itens[pai], this.itens[i]] = [this.itens[i], this.itens[pai]];
      i = pai;
    }
  }
  pop() {
    const topo = this.itens[0];
    const ultimo = this.itens.pop();
    if (this.itens.length > 0) {
      this.itens[0] = ultimo;
      let i = 0;
      for (;;) {
        const esq = 2 * i + 1, dir = 2 * i + 2;
        let menor = i;
        if (esq < this.itens.length && this.itens[esq][0] < this.itens[menor][0]) menor = esq;
        if (dir < this.itens.length && this.itens[dir][0] < this.itens[menor][0]) menor = dir;
        if (menor === i) break;
        [this.itens[menor], this.itens[i]] = [this.itens[i], this.itens[menor]];
        i = menor;
      }
    }
    return topo;
  }
}

// Dijkstra de origem única com parada antecipada no destino.
// Retorna { tempoS, caminho: [nós...] } ou null se inalcançável.
function dijkstra(adj, origem, destino) {
  if (origem === destino) return { tempoS: 0, caminho: [origem] };

  const dist = new Map([[origem, 0]]);
  const anterior = new Map();
  const visitado = new Set();
  const heap = new MinHeap();
  heap.push(0, origem);

  while (heap.tamanho > 0) {
    const [d, u] = heap.pop();
    if (visitado.has(u)) continue;
    visitado.add(u);
    if (u === destino) break;

    const vizinhos = adj.get(u) || [];
    for (const { destino: v, tempoS } of vizinhos) {
      if (visitado.has(v)) continue;
      const nd = d + tempoS;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        anterior.set(v, u);
        heap.push(nd, v);
      }
    }
  }

  if (!dist.has(destino) || !visitado.has(destino)) return null;

  const caminho = [destino];
  let atual = destino;
  while (atual !== origem) {
    atual = anterior.get(atual);
    caminho.push(atual);
  }
  caminho.reverse();
  return { tempoS: dist.get(destino), caminho };
}

// Monta a geometria GeoJSON (LineString) concatenando o traçado real de cada
// aresta do caminho, sem duplicar os pontos de junção.
function montarGeometria(adj, caminho) {
  const coordenadas = [];
  for (let i = 0; i < caminho.length - 1; i++) {
    const u = caminho[i], v = caminho[i + 1];
    const aresta = (adj.get(u) || []).find(a => a.destino === v);
    if (!aresta) continue;
    const coords = aresta.geom;
    const inicio = coordenadas.length > 0 ? 1 : 0; // evita ponto duplicado na junção
    for (let j = inicio; j < coords.length; j++) {
      coordenadas.push(coords[j]);
    }
  }
  return { type: 'LineString', coordinates: coordenadas };
}

// GET /api/v1/rota?cidade_id=&de=&para=&velocidade=
// 'de' e 'para' são osm_id de nós do grafo da cidade.
router.get('/', async (req, res, next) => {
  const cidadeId = parseInt(req.query.cidade_id, 10);
  const de = String(req.query.de || '');
  const para = String(req.query.para || '');
  const { velocidade } = req.query;

  if (isNaN(cidadeId)) {
    return res.status(400).json({ erro: "O parametro 'cidade_id' deve ser um numero inteiro", codigo: 400 });
  }
  if (!/^\d+$/.test(de) || !/^\d+$/.test(para)) {
    return res.status(400).json({ erro: "Os parametros 'de' e 'para' devem ser osm_id de nos (inteiros)", codigo: 400 });
  }

  try {
    // Busca velocidade base da cidade
    const cityRes = await pool.query("SELECT velocidade_kmh FROM cidade WHERE id = $1", [cidadeId]);
    if (cityRes.rowCount === 0) {
      return res.status(404).json({ erro: "Cidade nao encontrada", codigo: 404 });
    }
    const city = cityRes.rows[0];
    const velBase = parseFloat(city.velocidade_kmh);

    let velEscolhida = velBase;
    if (velocidade) {
      const v = parseFloat(velocidade);
      if (isNaN(v) || v < 2.0 || v > 6.0) {
        return res.status(400).json({ erro: "A velocidade deve ser um numero entre 2.0 e 6.0", codigo: 400 });
      }
      velEscolhida = v;
    }
    const fator = velBase / velEscolhida;

    const adj = await carregarGrafo(cidadeId);
    if (!adj) {
      return res.status(404).json({
        erro: 'Cidade nao encontrada ou sem malha viaria gravada. Reprocesse a cidade com a versao atual do algoritmo.',
        codigo: 404
      });
    }

    const resultado = dijkstra(adj, de, para);
    if (!resultado) {
      return res.status(404).json({ erro: 'Nao ha caminho na malha viaria entre os dois pontos', codigo: 404 });
    }

    // A rota mais rápida (menor caminho) permanece inalterada porque a velocidade
    // de caminhada é uniforme sobre todo o grafo viário. Apenas o tempo_min de 
    // viagem é escalado linearmente.
    res.json({
      tempo_min: parseFloat(((resultado.tempoS / 60) * fator).toFixed(2)),
      qtd_nos_caminho: resultado.caminho.length,
      geojson: montarGeometria(adj, resultado.caminho),
      velocidade_kmh_aplicada: velEscolhida
    });
  } catch (error) {
    next(error);
  }
});

export default router;

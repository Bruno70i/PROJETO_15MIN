import pool from '../db.js';

const TTL_MS = 10 * 60 * 1000; // 10 minutos
const cacheGrafos = new Map(); // cidadeId -> { adj, carregadoEm }

export async function carregarGrafo(cidadeId) {
  const emCache = cacheGrafos.get(cidadeId);
  if (emCache && Date.now() - emCache.carregadoEm < TTL_MS) {
    return emCache.adj;
  }

  const { rows } = await pool.query(
    'SELECT no_origem, no_destino, tempo_s, geom FROM aresta WHERE cidade_id = $1',
    [cidadeId]
  );
  if (rows.length === 0) return null;

  const adj = new Map();
  for (const r of rows) {
    const origem = String(r.no_origem);
    if (!adj.has(origem)) adj.set(origem, []);
    adj.get(origem).push({
      destino: String(r.no_destino),
      tempoS: parseFloat(r.tempo_s),
      geom: r.geom
    });
  }

  cacheGrafos.set(cidadeId, { adj, carregadoEm: Date.now() });
  return adj;
}

export class MinHeap {
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

export function dijkstra(adj, origem, destino) {
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

export function dijkstraCompleto(adj, origem) {
  const dist = new Map([[origem, 0]]);
  const visitado = new Set();
  const heap = new MinHeap();
  heap.push(0, origem);

  while (heap.tamanho > 0) {
    const [d, u] = heap.pop();
    if (visitado.has(u)) continue;
    visitado.add(u);

    const vizinhos = adj.get(u) || [];
    for (const { destino: v, tempoS } of vizinhos) {
      if (visitado.has(v)) continue;
      const nd = d + tempoS;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        heap.push(nd, v);
      }
    }
  }

  return dist;
}

export function montarGeometria(adj, caminho) {
  const coordenadas = [];
  for (let i = 0; i < caminho.length - 1; i++) {
    const u = caminho[i], v = caminho[i + 1];
    const aresta = (adj.get(u) || []).find(a => a.destino === v);
    if (!aresta) continue;
    const coords = aresta.geom;
    const inicio = coordenadas.length > 0 ? 1 : 0;
    for (let j = inicio; j < coords.length; j++) {
      coordenadas.push(coords[j]);
    }
  }
  return { type: 'LineString', coordinates: coordenadas };
}

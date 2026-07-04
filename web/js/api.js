import API_BASE from './config.js';

// Função auxiliar para requisições fetch com tratamento de erro em JSON
async function request(url) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.erro || `Erro HTTP ${res.status}`);
    }
    return data;
  } catch (error) {
    console.error(`Falha ao requisitar ${url}:`, error);
    throw error;
  }
}

export async function getCidades() {
  return request(`${API_BASE}/cidades`);
}

export async function getCidadeDetalhe(id) {
  return request(`${API_BASE}/cidades/${id}`);
}

export async function getServicos(cidadeId, categoria = '') {
  let url = `${API_BASE}/cidades/${cidadeId}/servicos`;
  if (categoria) {
    url += `?categoria=${encodeURIComponent(categoria)}`;
  }
  return request(url);
}

export async function getIsocronas(cidadeId, categoria, minutos = 15) {
  return request(`${API_BASE}/cidades/${cidadeId}/isocronas?categoria=${encodeURIComponent(categoria)}&minutos=${minutos}`);
}

export async function getMapa(cidadeId, categoria, max = 3000, velocidade = '', categorias = '') {
  const query = new URLSearchParams({ categoria, max: max.toString() });
  if (velocidade) query.append('velocidade', velocidade.toString());
  if (categorias) query.append('categorias', categorias);
  return request(`${API_BASE}/cidades/${cidadeId}/mapa?${query.toString()}`);
}

export async function getAlcancabilidade(cidadeId, lat, lon, velocidade = '') {
  let url = `${API_BASE}/alcancabilidade?cidade_id=${cidadeId}&lat=${lat}&lon=${lon}`;
  if (velocidade) {
    url += `&velocidade=${velocidade}`;
  }
  return request(url);
}

export async function getRota(cidadeId, deOsmId, paraOsmId, velocidade = '') {
  let url = `${API_BASE}/rota?cidade_id=${cidadeId}&de=${deOsmId}&para=${paraOsmId}`;
  if (velocidade) {
    url += `&velocidade=${velocidade}`;
  }
  return request(url);
}

export async function getComparar(cidadesIds) {
  return request(`${API_BASE}/comparar?cidades=${encodeURIComponent(cidadesIds.join(','))}`);
}

export async function getMoreno(cidadeId, params = {}) {
  const query = new URLSearchParams();
  if (params.categorias) query.append('categorias', params.categorias);
  if (params.velocidade) query.append('velocidade', params.velocidade);
  if (params.trabalho_no) query.append('trabalho_no', params.trabalho_no);
  if (params.incluir_amostra !== undefined) query.append('incluir_amostra', params.incluir_amostra);
  const qStr = query.toString();
  return request(`${API_BASE}/cidades/${cidadeId}/moreno${qStr ? '?' + qStr : ''}`);
}

export async function getGeocodificar(q) {
  return request(`${API_BASE}/geocodificar?q=${encodeURIComponent(q)}`);
}

export async function getVitrine(osm_tipo, osm_id) {
  return request(`${API_BASE}/vitrine?osm_tipo=${osm_tipo}&osm_id=${osm_id}`);
}

export async function deleteCidade(id, token = '') {
  const headers = {};
  if (token) headers['x-admin-token'] = token;
  const res = await fetch(`${API_BASE}/cidades/${id}`, {
    method: 'DELETE',
    headers
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro || `Erro HTTP ${res.status}`);
  return data;
}

export async function reprocessarCidade(id, token = '') {
  const headers = {};
  if (token) headers['x-admin-token'] = token;
  const res = await fetch(`${API_BASE}/cidades/${id}/reprocessar`, {
    method: 'POST',
    headers
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro || `Erro HTTP ${res.status}`);
  return data;
}

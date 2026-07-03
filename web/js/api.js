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

export async function getMapa(cidadeId, categoria, max = 3000) {
  return request(`${API_BASE}/cidades/${cidadeId}/mapa?categoria=${encodeURIComponent(categoria)}&max=${max}`);
}

export async function getAlcancabilidade(cidadeId, lat, lon) {
  return request(`${API_BASE}/alcancabilidade?cidade_id=${cidadeId}&lat=${lat}&lon=${lon}`);
}

export async function getRota(cidadeId, deOsmId, paraOsmId) {
  return request(`${API_BASE}/rota?cidade_id=${cidadeId}&de=${deOsmId}&para=${paraOsmId}`);
}

export async function getComparar(cidadesIds) {
  return request(`${API_BASE}/comparar?cidades=${encodeURIComponent(cidadesIds.join(','))}`);
}

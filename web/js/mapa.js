import { getAlcancabilidade, getIsocronas, getMapa, getRota } from './api.js';
import { exibirResultadosPonto, limparPainelLateral, mostrarCarregando, mostrarToast } from './painel.js';

let mapa;
let marcadorClique;
let marcadoresServicos = [];
let linhaCaminho = null;
let camadaIsocronas = {};
let camadaHeatmap = null;

export function inicializarMapa() {
  // Inicializa o mapa centralizado no Brasil por padrão
  mapa = L.map('map').setView([-15.77972, -47.92972], 4);
  
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(mapa);
  
  // Evento de clique no mapa
  mapa.on('click', onMapaClick);
  
  return mapa;
}

export function centralizarMapa(lat, lon, zoom = 13) {
  if (mapa) {
    mapa.setView([lat, lon], zoom);
  }
}

async function onMapaClick(e) {
  const cidadeSelect = document.getElementById('cidade-select');
  const cidadeId = parseInt(cidadeSelect.value, 10);
  
  if (isNaN(cidadeId) || cidadeId === 0) {
    mostrarToast("Selecione uma cidade antes de consultar o mapa.");
    return;
  }
  
  const { lat, lng } = e.latlng;
  
  // Limpa elementos anteriores do mapa e painel
  limparElementosMapa();
  mostrarCarregando();
  
  // Adiciona marcador no ponto clicado
  marcadorClique = L.marker([lat, lng]).addTo(mapa)
    .bindPopup(`Ponto selecionado:<br>Lat: ${lat.toFixed(5)}<br>Lon: ${lng.toFixed(5)}`)
    .openPopup();
    
  try {
    const dados = await getAlcancabilidade(cidadeId, lat, lng);
    dados.cidade_id = cidadeId; // usado depois para tracar a rota real
    exibirResultadosPonto(dados);
  } catch (error) {
    if (marcadorClique) {
      mapa.removeLayer(marcadorClique);
      marcadorClique = null;
    }
    limparPainelLateral();
    mostrarToast("Ponto fora da area de cobertura processada para esta cidade.");
  }
}

export function limparElementosMapa() {
  if (marcadorClique) {
    mapa.removeLayer(marcadorClique);
    marcadorClique = null;
  }
  
  limparServicosMapa();
  limparCaminho();
}

function limparServicosMapa() {
  marcadoresServicos.forEach(m => mapa.removeLayer(m));
  marcadoresServicos = [];
}

function limparCaminho() {
  if (linhaCaminho) {
    mapa.removeLayer(linhaCaminho);
    linhaCaminho = null;
  }
}

// Traça a rota REAL pela malha viária entre o nó do clique e o serviço mais
// próximo, usando o endpoint /rota (Dijkstra sobre as arestas do OSM).
// corHex = cor da categoria, para a linha ficar legível e coerente com o painel.
// origem = dados.no do /alcancabilidade: { osm_id, lat, lon }
export async function mostrarCaminhoServico(cidadeId, origem, servico, corHex) {
  limparServicosMapa();
  limparCaminho();

  const latDest = servico.lat;
  const lonDest = servico.lon;
  const cor = corHex || '#e11d48';

  // Marcador do serviço com a cor da categoria
  const marcadorServico = L.circleMarker([latDest, lonDest], {
    radius: 9,
    fillColor: cor,
    color: '#ffffff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.95
  }).addTo(mapa)
    .bindPopup(`<b>Servico Mais Proximo</b><br>${servico.nome || 'Sem nome'}`)
    .openPopup();

  marcadoresServicos.push(marcadorServico);

  try {
    const rota = await getRota(cidadeId, origem.osm_id, servico.osm_no_id);

    // Duas polylines sobrepostas: contorno branco embaixo (casing) e a cor
    // da categoria por cima — legível sobre qualquer fundo do mapa.
    const casing = L.geoJSON(rota.geojson, {
      style: { color: '#ffffff', weight: 9, opacity: 0.9 }
    });
    const linha = L.geoJSON(rota.geojson, {
      style: { color: cor, weight: 5, opacity: 1 }
    });
    linha.bindPopup(`Caminho a pe pela malha viaria: <b>${rota.tempo_min.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min</b>`);

    linhaCaminho = L.featureGroup([casing, linha]).addTo(mapa);
    mapa.fitBounds(linhaCaminho.getBounds(), { padding: [50, 50] });
  } catch (error) {
    // Fallback: sem rota disponivel (cidade antiga sem arestas ou nos
    // desconexos) — linha reta tracejada, sinalizando que e aproximacao.
    mostrarToast('Rota pela malha viaria indisponivel; exibindo linha reta aproximada.');
    linhaCaminho = L.polyline([[origem.lat, origem.lon], [latDest, lonDest]], {
      color: cor,
      weight: 4,
      dashArray: '6, 10',
      opacity: 0.9
    }).addTo(mapa);
    mapa.fitBounds(linhaCaminho.getBounds(), { padding: [50, 50] });
  }
}

// Adiciona ou remove isócrona no mapa
export async function toggleIsocrona(cidadeId, categoria, minutos, ativo, corHex) {
  const chaveCamada = `${categoria}_${minutos}`;
  
  if (!ativo) {
    if (camadaIsocronas[chaveCamada]) {
      mapa.removeLayer(camadaIsocronas[chaveCamada]);
      delete camadaIsocronas[chaveCamada];
    }
    return;
  }
  
  try {
    const geojson = await getIsocronas(cidadeId, categoria, minutos);
    
    // Remove camada existente se houver
    if (camadaIsocronas[chaveCamada]) {
      mapa.removeLayer(camadaIsocronas[chaveCamada]);
    }
    
    // Desenha polígono GeoJSON
    camadaIsocronas[chaveCamada] = L.geoJSON(geojson, {
      style: {
        fillColor: corHex,
        fillOpacity: 0.25,
        color: corHex,
        weight: 2,
        opacity: 0.7
      }
    }).addTo(mapa);
  } catch (error) {
    mostrarToast(`Nao foi possivel carregar isocrona para ${categoria} (${minutos} min).`);
  }
}

// Limpa todas as isócronas do mapa
export function limparIsocronas() {
  Object.keys(camadaIsocronas).forEach(k => {
    mapa.removeLayer(camadaIsocronas[k]);
  });
  camadaIsocronas = {};
}

// Mostra o mapa de calor/camada de nós
export async function toggleHeatmap(cidadeId, categoria, ativo) {
  if (camadaHeatmap) {
    mapa.removeLayer(camadaHeatmap);
    camadaHeatmap = null;
  }
  
  if (!ativo) return;
  
  try {
    const pontos = await getMapa(cidadeId, categoria, 3000);
    
    // Escala de cores dos nós do heatmap
    // ≤5 min #1a9850, ≤10 #91cf60, ≤15 #d9ef8b, ≤25 #fee08b, >25 #d73027, null #999
    const getCorNo = (tempo) => {
      if (tempo === null) return '#999999';
      if (tempo <= 5) return '#1a9850';
      if (tempo <= 10) return '#91cf60';
      if (tempo <= 15) return '#d9ef8b';
      if (tempo <= 25) return '#fee08b';
      return '#d73027';
    };
    
    const circulos = pontos.map(p => {
      return L.circleMarker([p.lat, p.lon], {
        radius: 4,
        fillColor: getCorNo(p.tempo_min),
        color: '#ffffff',
        weight: 0.5,
        fillOpacity: 0.7
      });
    });
    
    camadaHeatmap = L.featureGroup(circulos).addTo(mapa);
  } catch (error) {
    mostrarToast("Erro ao carregar mapa geral de calor.");
  }
}

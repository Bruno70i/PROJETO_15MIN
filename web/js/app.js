import { getCidades, getCidadeDetalhe, getMapa } from './api.js';
import { inicializarMapa, centralizarMapa, limparElementosMapa, toggleIsocrona, toggleHeatmap, limparIsocronas } from './mapa.js';
import { limparPainelLateral, mostrarToast } from './painel.js';

let cidadeAtualDetalhada = null;
let legendaHeatmap = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializa Mapa
  const map = inicializarMapa();
  
  // 2. Carrega Cidades
  const selectCidade = document.getElementById('cidade-select');
  try {
    const cidades = await getCidades();
    selectCidade.innerHTML = '';
    
    if (cidades.length === 0) {
      selectCidade.innerHTML = '<option value="0">Nenhuma cidade processada</option>';
      document.getElementById('panel-results').innerHTML = `
        <p style="text-align:center; color:#ef4444; font-weight:600; padding:20px;">
          Nenhuma cidade processada ainda. Rode o algoritmo (fase 03) para carregar os dados no banco.
        </p>
      `;
      return;
    }
    
    // Adiciona opção default
    const optDefault = document.createElement('option');
    optDefault.value = '0';
    optDefault.innerText = 'Selecione uma cidade...';
    selectCidade.appendChild(optDefault);
    
    cidades.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = `${c.nome} (${c.pais})`;
      selectCidade.appendChild(opt);
    });
  } catch (error) {
    selectCidade.innerHTML = '<option value="0">Erro ao carregar cidades</option>';
    mostrarToast("Nao foi possivel conectar a API. Certifique-se de que o servidor esta rodando.");
  }
  
  // 3. Evento de Seleção de Cidade
  selectCidade.addEventListener('change', async () => {
    const cidadeId = parseInt(selectCidade.value, 10);
    
    // Limpar tudo
    limparElementosMapa();
    limparIsocronas();
    if (document.getElementById('heatmap-toggle')) {
      document.getElementById('heatmap-toggle').checked = false;
    }
    toggleHeatmap(cidadeId, '', false);
    limparPainelLateral();
    removerLegendaHeatmap(map);
    
    if (cidadeId === 0) return;
    
    try {
      cidadeAtualDetalhada = await getCidadeDetalhe(cidadeId);

      // Centraliza na cidade a partir de um nó de amostra. A categoria 'geral'
      // (id 0) é sentinela do índice agregado e não é aceita pelo /mapa —
      // usa-se a primeira categoria real. Falha na centralização não pode
      // impedir a montagem dos filtros, por isso o try separado.
      try {
        const primeiraCategoria = cidadeAtualDetalhada.indices.find(i => i.chave !== 'geral');
        if (primeiraCategoria) {
          const amostra = await getMapa(cidadeId, primeiraCategoria.chave, 1);
          if (amostra && amostra.length > 0) {
            centralizarMapa(amostra[0].lat, amostra[0].lon, 13);
          }
        }
      } catch (e) {
        console.warn('Nao foi possivel centralizar o mapa na cidade:', e);
      }
      
      // Popula lista de checkboxes de isócronas
      const containerChecks = document.getElementById('isocronas-check-container');
      containerChecks.innerHTML = '';
      
      // Popula select do heatmap
      const selectHeatmap = document.getElementById('heatmap-categoria-select');
      selectHeatmap.innerHTML = '<option value="">Escolha a categoria...</option>';
      selectHeatmap.disabled = false;
      
      cidadeAtualDetalhada.indices.forEach(idx => {
        if (idx.chave === 'geral') return;
        
        // Checkbox Isócrona
        const label = document.createElement('label');
        label.className = 'layer-checkbox';
        label.style.borderLeft = `4px solid ${idx.cor_hex}`;
        label.style.paddingLeft = '5px';
        label.innerHTML = `
          <input type="checkbox" class="isocrona-checkbox" data-chave="${idx.chave}" data-cor="${idx.cor_hex}">
          Isocrona ${idx.rotulo}
        `;
        containerChecks.appendChild(label);
        
        // Opção Heatmap
        const opt = document.createElement('option');
        opt.value = idx.chave;
        opt.innerText = idx.rotulo;
        selectHeatmap.appendChild(opt);
      });
      
      // Registra eventos para os checkboxes recém criados
      document.querySelectorAll('.isocrona-checkbox').forEach(chk => {
        chk.addEventListener('change', () => {
          const categoria = chk.getAttribute('data-chave');
          const cor = chk.getAttribute('data-cor');
          const minutos = parseInt(document.getElementById('isocrona-minutos-select').value, 10);
          toggleIsocrona(cidadeId, categoria, minutos, chk.checked, cor);
        });
      });
      
    } catch (error) {
      mostrarToast("Erro ao carregar detalhes da cidade.");
    }
  });
  
  // 4. Seletor de Minutos das Isócronas
  document.getElementById('isocrona-minutos-select').addEventListener('change', () => {
    const selectCidade = document.getElementById('cidade-select');
    const cidadeId = parseInt(selectCidade.value, 10);
    if (cidadeId === 0) return;
    
    // Atualiza todas as isócronas ativas para o novo tempo
    document.querySelectorAll('.isocrona-checkbox').forEach(chk => {
      if (chk.checked) {
        const categoria = chk.getAttribute('data-chave');
        const cor = chk.getAttribute('data-cor');
        const minutos = parseInt(document.getElementById('isocrona-minutos-select').value, 10);
        toggleIsocrona(cidadeId, categoria, minutos, true, cor);
      }
    });
  });
  
  // 5. Controles do Heatmap (Mapa Geral de Nós)
  const heatmapToggle = document.getElementById('heatmap-toggle');
  const heatmapSelect = document.getElementById('heatmap-categoria-select');
  
  const updateHeatmap = () => {
    const cidadeId = parseInt(selectCidade.value, 10);
    const cat = heatmapSelect.value;
    const ativo = heatmapToggle.checked && cat !== '';
    
    toggleHeatmap(cidadeId, cat, ativo);
    
    if (ativo) {
      adicionarLegendaHeatmap(map);
    } else {
      removerLegendaHeatmap(map);
    }
  };
  
  heatmapToggle.addEventListener('change', updateHeatmap);
  heatmapSelect.addEventListener('change', updateHeatmap);
  
  // 6. Colapso do painel lateral (responsividade / interatividade)
  const sidePanel = document.querySelector('.side-panel');
  const togglePanelBtn = document.getElementById('toggle-panel-btn');
  
  togglePanelBtn.addEventListener('click', () => {
    sidePanel.classList.toggle('collapsed');
    if (sidePanel.classList.contains('collapsed')) {
      togglePanelBtn.innerText = 'Exibir';
    } else {
      togglePanelBtn.innerText = 'Ocultar';
    }
  });
});

// Adiciona a legenda de cores do heatmap
function adicionarLegendaHeatmap(map) {
  if (legendaHeatmap) return;
  
  legendaHeatmap = L.control({ position: 'bottomleft' });
  
  legendaHeatmap.onAdd = function () {
    const div = L.DomUtil.create('div', 'info legend');
    const grades = [0, 5, 10, 15, 25];
    const cores = ['#1a9850', '#91cf60', '#d9ef8b', '#fee08b', '#d73027'];
    const rotulos = ['&le; 5 min', '&le; 10 min', '&le; 15 min', '&le; 25 min', '&gt; 25 min'];
    
    div.innerHTML = '<strong>Tempo de Acesso</strong><br>';
    for (let i = 0; i < grades.length; i++) {
      div.innerHTML +=
        `<i style="background:${cores[i]}"></i> ${rotulos[i]}<br>`;
    }
    div.innerHTML += `<i style="background:#999999"></i> Inalcancavel`;
    return div;
  };
  
  legendaHeatmap.addTo(map);
}

function removerLegendaHeatmap(map) {
  if (legendaHeatmap) {
    map.removeControl(legendaHeatmap);
    legendaHeatmap = null;
  }
}

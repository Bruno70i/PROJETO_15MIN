import { mostrarCaminhoServico } from './mapa.js';

let ultimoDadosPonto = null;

// Função para exibir mensagem rápida (Toast)
export function mostrarToast(mensagem) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = mensagem;
  
  container.appendChild(toast);
  
  // Auto remove após 3 segundos (tempo da animação no CSS)
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Limpa o painel lateral
export function limparPainelLateral() {
  const panel = document.getElementById('panel-results');
  if (panel) {
    panel.innerHTML = `<p class="info-msg" style="text-align:center; color:#64748b; font-size:0.9rem; padding: 20px;">
      Clique em qualquer ponto do mapa para ver o tempo de alcancabilidade dos servicos.
    </p>`;
  }
  ultimoDadosPonto = null;
}

// Mostra o spinner de carregamento no painel
export function mostrarCarregando() {
  const panel = document.getElementById('panel-results');
  if (panel) {
    panel.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px 0;">
        <div class="spinner"></div>
        <p style="color:#64748b; font-size:0.85rem; margin-top:10px;">Calculando tempos de acesso...</p>
      </div>
    `;
  }
}

// Exibe os dados retornados pelo clique
export function exibirResultadosPonto(dados) {
  ultimoDadosPonto = dados;
  const panel = document.getElementById('panel-results');
  if (!panel) return;
  
  // Determina rótulo e cor do índice do ponto
  const idx = dados.indice_ponto;
  let classeCor = 'baixo';
  let rotuloIndice = 'Baixo';
  
  if (idx >= 80) {
    classeCor = 'excelente';
    rotuloIndice = 'Excelente';
  } else if (idx >= 50) {
    classeCor = 'parcial';
    rotuloIndice = 'Parcial';
  }
  
  let html = `
    <!-- Botão para voltar ao diagnóstico geral da cidade (Fase 09) -->
    <button id="btn-voltar-moreno" class="btn-secundario" style="width: 100%; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
      &larr; Diagnostico da Cidade
    </button>

    <!-- Card de Índice Geral do Ponto -->
    <div class="index-badge">
      <span class="index-value">${idx.toFixed(0)}</span>
      <span class="index-label ${classeCor}">${rotuloIndice}</span>
      <span style="font-size:0.75rem; color:#64748b; margin-top:5px; text-align:center;">
        Alcancabilidade de servicos nesse ponto (limiar: 15 min)
      </span>
    </div>
    
    <!-- Lista por categoria -->
    <div class="category-list" role="region" aria-live="polite">
  `;
  
  dados.categorias.forEach((cat, index) => {
    const tempoStr = cat.tempo_min !== null ? `${cat.tempo_min.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} min` : 'Inalcançável';
    const statusIcon = cat.dentro_limiar ? '✅' : '⚠️';
    const servicoNome = cat.servico_mais_proximo ? cat.servico_mais_proximo.nome || 'Estabelecimento sem nome' : 'Nenhum serviço próximo';
    
    html += `
      <div class="category-item" data-index="${index}">
        <div class="category-info">
          <div class="color-dot" style="background-color: ${cat.cor_hex}"></div>
          <div>
            <div class="category-label">${cat.rotulo}</div>
            <div class="nearest-service">${servicoNome}</div>
          </div>
        </div>
        <div class="category-value">
          <span>${statusIcon} ${tempoStr}</span>
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  panel.innerHTML = html;
  
  // Adiciona eventos de clique nos itens para traçar rota para o serviço
  const items = panel.querySelectorAll('.category-item');
  items.forEach(el => {
    el.addEventListener('click', () => {
      const idxCat = parseInt(el.getAttribute('data-index'), 10);
      const cat = dados.categorias[idxCat];
      if (cat && cat.servico_mais_proximo) {
        mostrarCaminhoServico(dados.cidade_id, dados.no, cat.servico_mais_proximo, cat.cor_hex);
      } else {
        mostrarToast("Nao ha servicos dessa categoria proximos o suficiente.");
      }
    });
  });

  // Listener para o botão de voltar ao diagnóstico da cidade (Fase 09)
  const btnVoltar = panel.querySelector('#btn-voltar-moreno');
  if (btnVoltar) {
    btnVoltar.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('voltarAoDiagnostico'));
    });
  }
}

import { getCidades, getCidadeDetalhe, getMapa, getMoreno, getGeocodificar, getVitrine, deleteCidade, reprocessarCidade, getAlcancabilidade, getRota } from './api.js';
import { inicializarMapa, centralizarMapa, limparElementosMapa, toggleIsocrona, toggleHeatmap, limparIsocronas, setDefinindoMarcador, getDefinindoMarcador, carregarMarcadoresCidade, limparMarcadoresPessoais, desenharRotaCasaTrabalho } from './mapa.js';
import { limparPainelLateral, mostrarToast } from './painel.js';

let cidadeAtualDetalhada = null;
let legendaHeatmap = null;
let pollingIntervalId = null;
let activeJobId = null;

// Fase 10: Variáveis de estado da análise dinâmica
let velocidadeAtual = 3.0;
let categoriasAtivas = new Set();
let categoriaHeatmapAtiva = null; // Categoria do heatmap ativa no clique ("Cobertura por serviço")

let noCasaSalvo = null;
let noTrabalhoSalvo = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializa Mapa
  const map = inicializarMapa();
  
  // 2. Carrega Cidades
  const selectCidade = document.getElementById('cidade-select');
  await carregarCidades();

  // 3. Evento de Seleção de Cidade
  selectCidade.addEventListener('change', async () => {
    const cidadeIdVal = selectCidade.value;
    
    if (cidadeIdVal === '__nova__') {
      // Restaura o select para a opção anterior ou 0
      selectCidade.value = cidadeAtualDetalhada ? cidadeAtualDetalhada.id.toString() : '0';
      abrirModalNovaCidade();
      return;
    }

    const cidadeId = parseInt(cidadeIdVal, 10);
    
    // Limpar tudo
    limparElementosMapa();
    limparIsocronas();
    limparMarcadoresPessoais();
    if (document.getElementById('heatmap-toggle')) {
      document.getElementById('heatmap-toggle').checked = false;
    }
    toggleHeatmap(cidadeId, '', false);
    limparPainelLateral();
    removerLegendaHeatmap(map);
    
    if (cidadeId === 0) {
      limparMarcadoresPessoais();
      return;
    }
    
    try {
      cidadeAtualDetalhada = await getCidadeDetalhe(cidadeId);
      
      // Carrega marcadores pessoais
      carregarMarcadoresCidade(cidadeId);
      
      // Reset modo
      document.getElementById('analise-modo-select').value = 'livre';
      document.getElementById('caminho-trabalho-info').style.display = 'none';
      desenharRotaCasaTrabalho(null);
      
      // Inicializa estados dinâmicos (Fase 10)
      velocidadeAtual = parseFloat(cidadeAtualDetalhada.velocidade_kmh);
      categoriasAtivas = new Set(cidadeAtualDetalhada.indices.map(i => i.chave).filter(k => k !== 'geral'));
      categoriaHeatmapAtiva = null; // Reseta heatmap por serviço

      // Centraliza na cidade
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
      
      // Opção especial "Cobertura plena" (Fase 09)
      const optPlena = document.createElement('option');
      optPlena.value = 'plena';
      optPlena.innerText = 'Cobertura plena (todos os servicos)';
      selectHeatmap.appendChild(optPlena);

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

      // Exibe Cartão de Diagnóstico de Moreno (Fase 09 & 10)
      await exibirDiagnosticoMoreno();
      
    } catch (error) {
      mostrarToast("Erro ao carregar detalhes da cidade.");
    }
  });
  
  // 4. Seletor de Minutos das Isócronas
  document.getElementById('isocrona-minutos-select').addEventListener('change', () => {
    const cidadeId = parseInt(selectCidade.value, 10);
    if (isNaN(cidadeId) || cidadeId === 0) return;
    
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
    if (isNaN(cidadeId) || cidadeId === 0) return;
    const cat = heatmapSelect.value;
    const ativo = heatmapToggle.checked && cat !== '';
    
    // Se a categoria for plena, passamos as categoriasAtivas
    const catList = cat === 'plena' ? Array.from(categoriasAtivas).join(',') : '';
    
    toggleHeatmap(cidadeId, cat, ativo, velocidadeAtual, catList);
    
    if (ativo) {
      adicionarLegendaHeatmap(map);
    } else {
      removerLegendaHeatmap(map);
    }
  };
  
  heatmapToggle.addEventListener('change', updateHeatmap);
  heatmapSelect.addEventListener('change', updateHeatmap);
  
  // 6. Colapso do painel lateral
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

  // 7. Escuta o evento de voltar ao diagnóstico (Fase 09)
  document.addEventListener('voltarAoDiagnostico', () => {
    limparElementosMapa();
    exibirDiagnosticoMoreno();
  });

  // 8. Eventos do Modal de Processamento (Fases 12 e 13)
  document.getElementById('modal-close-btn').addEventListener('click', fecharModal);
  document.getElementById('modal-result-close-btn').addEventListener('click', fecharModal);
  document.getElementById('modal-minimizar-btn').addEventListener('click', minimizarModal);
  document.getElementById('badge-processamento-bg').addEventListener('click', reabrirModalBackground);

  document.getElementById('btn-search-geocodificar').addEventListener('click', buscarNominatim);
  document.getElementById('modal-search-cancelar-btn').addEventListener('click', fecharModal);
  
  document.getElementById('btn-vitrine-selecionar-todos').addEventListener('click', () => {
    document.querySelectorAll('.vitrine-chk').forEach(c => c.checked = true);
  });
  document.getElementById('btn-vitrine-limpar-selecao').addEventListener('click', () => {
    document.querySelectorAll('.vitrine-chk').forEach(c => c.checked = false);
  });
  document.getElementById('modal-vitrine-voltar-btn').addEventListener('click', () => {
    document.getElementById('modal-vitrine-section').style.display = 'none';
    document.getElementById('modal-search-section').style.display = 'block';
  });
  document.getElementById('modal-vitrine-processar-btn').addEventListener('click', processarCidadeVitrine);

  // 9. Eventos de Análise Pessoal (Fase 14)
  document.getElementById('btn-definir-casa').addEventListener('click', () => {
    setDefinindoMarcador('casa');
    mostrarToast("Clique no mapa para posicionar sua casa 🏠");
  });

  document.getElementById('btn-definir-trabalho').addEventListener('click', () => {
    setDefinindoMarcador('trabalho');
    mostrarToast("Clique no mapa para posicionar seu trabalho 💼");
  });

  document.getElementById('analise-modo-select').addEventListener('change', () => {
    verificarEAplicarModoPessoal();
  });

  document.addEventListener('marcadorPessoalAlterado', async (e) => {
    await verificarEAplicarModoPessoal(true);
  });

  // 10. Gestão de Cidades (Fase 12.4)
  document.getElementById('btn-gestao').addEventListener('click', abrirModalGestao);
  document.getElementById('modal-gestao-close-x').addEventListener('click', fecharModalGestao);
  document.getElementById('modal-gestao-fechar-btn').addEventListener('click', fecharModalGestao);

  // Verifica na inicialização se há um job ativo rodando
  verificarJobAtivoAoCarregar();

  // Função auxiliar para carregar cidades
  async function carregarCidades() {
    try {
      const cidades = await getCidades();
      selectCidade.innerHTML = '';
      
      if (cidades.length === 0) {
        selectCidade.innerHTML = '<option value="0">Nenhuma cidade processada</option>';
        document.getElementById('panel-results').innerHTML = `
          <p style="text-align:center; color:#ef4444; font-weight:600; padding:20px;">
            Nenhuma cidade processada ainda. Adicione uma nova cidade ou rode o algoritmo.
          </p>
        `;
      } else {
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
      }
      
      // Adiciona a opção de processamento
      const optNova = document.createElement('option');
      optNova.value = '__nova__';
      optNova.innerText = '+ Adicionar nova cidade...';
      selectCidade.appendChild(optNova);

    } catch (error) {
      selectCidade.innerHTML = '<option value="0">Erro ao carregar cidades</option>';
      mostrarToast("Nao foi possivel conectar a API para carregar as cidades.");
    }
  }

  // Renderiza o Cartão de Diagnóstico de Moreno no painel lateral (Fase 09 & 10)
  async function exibirDiagnosticoMoreno(trabalhoNo = null) {
    const panel = document.getElementById('panel-results');
    if (!panel || !cidadeAtualDetalhada) return;

    // Coloca spinner/esqueleto de carregamento enquanto busca dados dinâmicos
    panel.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px 0;">
        <div class="spinner"></div>
        <p style="color:#64748b; font-size:0.85rem; margin-top:10px;">Calculando diagnostico dinamico...</p>
      </div>
    `;

    try {
      const catList = Array.from(categoriasAtivas).join(',');
      const params = {
        velocidade: velocidadeAtual,
        categorias: catList
      };

      const modo = document.getElementById('analise-modo-select').value;
      if (modo === 'completo' && noTrabalhoSalvo) {
        params.trabalho_no = noTrabalhoSalvo.osm_id;
        params.incluir_amostra = 1;
      }

      const moreno = await getMoreno(cidadeAtualDetalhada.id, params);
      const amostraTrabalhoEspecial = moreno.amostra_trabalho;

      const isPersonalizado = (velocidadeAtual !== parseFloat(cidadeAtualDetalhada.velocidade_kmh)) || 
                              (categoriasAtivas.size !== cidadeAtualDetalhada.indices.filter(i => i.chave !== 'geral').length) ||
                              (modo === 'completo');

      // Cores de status de acordo com a classificação
      let classeCor = 'vermelho';
      if (moreno.classificacao === 'Cidade de 15 Minutos') {
        classeCor = 'excelente';
      } else if (moreno.classificacao === 'Muito proxima do conceito') {
        classeCor = 'amarelo';
      } else if (moreno.classificacao === 'Parcialmente aderente') {
        classeCor = 'laranja';
      }

      const minutosText = moreno.minutos_cidade !== null ? `${moreno.minutos_cidade} minutos` : 'sem cobertura plena';
      
      let html = `
        <div class="moreno-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div class="moreno-card-header" style="margin:0;">Diagnóstico de Moreno</div>
            <button id="btn-como-calculamos" class="btn-secundario" style="font-size:0.75rem; padding:2px 8px; border-radius:12px; display:flex; align-items:center; gap:4px; cursor:pointer;">
              <span>?</span> Como calculamos?
            </button>
          </div>
      `;

      if (isPersonalizado) {
        html += `
          <div style="display:flex; align-items:center; justify-content:space-between; background-color:#eff6ff; border:1px solid #bfdbfe; border-radius:4px; padding:4px 8px; margin-bottom:10px;">
            <span style="font-size:0.75rem; color:#1d4ed8; font-weight:700;">ANÁLISE PERSONALIZADA</span>
            <button id="btn-restaurar-padrao" class="btn-secundario" style="font-size:0.7rem; padding:1px 6px; background-color:#ffffff; cursor:pointer;">Restaurar padrao</button>
          </div>
        `;
      }

      html += `
          <div class="moreno-highlight">
            ${cidadeAtualDetalhada.nome} é uma <br><strong>cidade de ${minutosText}</strong>
          </div>
          <span class="moreno-badge ${classeCor}">${moreno.classificacao}</span>
          
          <hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">
          
          <div class="moreno-metric-line">
            <strong>Cobertura plena:</strong> ${moreno.pct_cobertura_plena}% do território alcança todos os serviços em 15 min.
          </div>
      `;

      if (moreno.categoria_gargalo) {
        html += `
          <div class="moreno-metric-line">
            <strong>Gargalo:</strong> 
            <span class="color-dot" style="background-color: ${moreno.categoria_gargalo.cor_hex}; display:inline-block; margin:0 4px;"></span>
            ${moreno.categoria_gargalo.rotulo} (${moreno.pct_gargalo}% alcançam em 15 min)
          </div>
        `;
      }

      // Seção de Personalizar Análise (Fase 10)
      html += `
        <hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">
        <span style="font-size:0.8rem; font-weight:700; color:#64748b; display:block; margin-bottom:8px;">PERSONALIZAR ANÁLISE</span>
        
        <div class="custom-panel-row" style="margin-bottom:12px;">
          <label style="font-size:0.75rem; font-weight:600; color:#475569; display:block; margin-bottom:4px;">Velocidade de caminhada</label>
          <select id="moreno-velocidade-select" style="width:100%; padding:6px; font-size:0.8rem; border-radius:4px; border:1px solid var(--border-color);">
            <option value="2.5" ${velocidadeAtual === 2.5 ? 'selected' : ''}>2.5 km/h (idosos/mobilidade reduzida)</option>
            <option value="3.0" ${velocidadeAtual === 3.0 ? 'selected' : ''}>3.0 km/h (conservadora - padrao)</option>
            <option value="4.0" ${velocidadeAtual === 4.0 ? 'selected' : ''}>4.0 km/h (ritmo medio)</option>
            <option value="5.0" ${velocidadeAtual === 5.0 ? 'selected' : ''}>5.0 km/h (caminhada rapida)</option>
          </select>
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-size:0.75rem; font-weight:600; color:#475569; display:block; margin-bottom:6px;">Servicos incluidos</label>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; max-height: 120px; overflow-y: auto; padding: 4px; border: 1px solid var(--border-color); border-radius:4px;">
      `;

      cidadeAtualDetalhada.indices.forEach(idx => {
        if (idx.chave === 'geral') return;
        const isChecked = categoriasAtivas.has(idx.chave);
        html += `
          <label style="display:flex; align-items:center; gap:4px; font-size:0.75rem; cursor:pointer;">
            <input type="checkbox" class="moreno-cat-chk" value="${idx.chave}" ${isChecked ? 'checked' : ''}>
            <span class="color-dot" style="background-color: ${idx.cor_hex}; width:8px; height:8px; border-radius:50%; display:inline-block; flex-shrink:0;"></span>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${idx.rotulo.split(' ')[0]}</span>
          </label>
        `;
      });

      html += `
          </div>
        </div>
      `;

      // Histograma
      html += `
        <hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">
        <span style="font-size:0.8rem; font-weight:700; color:#64748b;">DISTRIBUIÇÃO DA COBERTURA PLENA</span>
        <div class="histogram-container">
      `;

      const maxQtd = Math.max(...moreno.distribuicao.map(d => d.qtd), 1);
      moreno.distribuicao.forEach(d => {
        const label = d.faixa === 'sem_cobertura' ? 'Sem cobertura' : `${d.faixa.replace('_', ' a ')} min`;
        const pctBar = (d.qtd / maxQtd) * 100;
        html += `
          <div class="histogram-row">
            <span class="histogram-label">${label}</span>
            <div class="histogram-bar-outer">
              <div class="histogram-bar-inner" style="width: ${pctBar}%;"></div>
            </div>
            <span class="histogram-value">${d.qtd}</span>
          </div>
        `;
      });

      html += `</div>`;

      // Cobertura por serviço (Fase 10.4.2)
      html += `
        <hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">
        <span style="font-size:0.8rem; font-weight:700; color:#64748b; display:block; margin-bottom:8px;">COBERTURA POR SERVIÇO</span>
        <div style="display:flex; flex-direction:column; gap:6px;">
      `;

      moreno.categorias_resultado.forEach(cRes => {
        const isHeatmapAtivo = categoriaHeatmapAtiva === cRes.chave;
        const btnClass = isHeatmapAtivo ? 'active-service-row' : '';
        html += `
          <div class="service-coverage-row ${btnClass}" data-chave="${cRes.chave}" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:6px; border-radius:4px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="color-dot" style="background-color: ${cRes.cor_hex || '#7c3aed'};"></span>
              <span class="service-label">${cRes.rotulo}</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:0.8rem; font-weight:600;">${cRes.pct_dentro}%</span>
              <span class="map-icon" style="opacity: ${isHeatmapAtivo ? 1 : 0.4};">🗺️</span>
            </div>
          </div>
        `;
      });

      html += `</div>`;

      if (moreno.categorias_ausentes && moreno.categorias_ausentes.length > 0) {
        const rotulosAusentes = moreno.categorias_ausentes.map(c => c.rotulo).join(', ');
        html += `
          <p style="font-size:0.7rem; color:#64748b; margin-top:8px; font-style:italic;">
            * Sem dados no OSM: ${rotulosAusentes} (desconsideradas no cálculo).
          </p>
        `;
      }

      html += `
        <button id="moreno-btn-plena" class="btn-primario moreno-btn-plena" style="margin-top:10px; cursor:pointer;">Ver cobertura plena no mapa</button>
        </div>
      `;

      panel.innerHTML = html;

      // Habilita/Desabilita as isócronas no menu lateral esquerdo
      const isocronaChecks = document.querySelectorAll('.isocrona-checkbox');
      const isocronaSelect = document.getElementById('isocrona-minutos-select');
      const isocronasWarning = document.getElementById('isocronas-warning-msg');

      if (velocidadeAtual !== 3.0) {
        isocronaChecks.forEach(c => {
          c.disabled = true;
          if (c.checked) {
            c.checked = false;
            c.dispatchEvent(new Event('change'));
          }
        });
        if (isocronaSelect) isocronaSelect.disabled = true;
        if (isocronasWarning) isocronasWarning.style.display = 'block';
      } else {
        isocronaChecks.forEach(c => c.disabled = false);
        if (isocronaSelect) isocronaSelect.disabled = false;
        if (isocronasWarning) isocronasWarning.style.display = 'none';
      }

      // Registra listeners
      document.getElementById('moreno-btn-plena').addEventListener('click', () => {
        const toggle = document.getElementById('heatmap-toggle');
        const select = document.getElementById('heatmap-categoria-select');
        
        toggle.checked = true;
        select.value = 'plena';
        
        updateHeatmap();
      });

      // Listener velocidade
      document.getElementById('moreno-velocidade-select').addEventListener('change', (e) => {
        velocidadeAtual = parseFloat(e.target.value);
        exibirDiagnosticoMoreno(modo === 'completo' && noTrabalhoSalvo ? noTrabalhoSalvo.osm_id : null);
      });

      // Listeners checkboxes de categorias
      document.querySelectorAll('.moreno-cat-chk').forEach(chk => {
        chk.addEventListener('change', () => {
          if (chk.checked) {
            categoriasAtivas.add(chk.value);
          } else {
            if (categoriasAtivas.size <= 1) {
              chk.checked = true;
              mostrarToast("Pelo menos uma categoria deve estar ativa!");
              return;
            }
            categoriasAtivas.delete(chk.value);
          }
          exibirDiagnosticoMoreno(modo === 'completo' && noTrabalhoSalvo ? noTrabalhoSalvo.osm_id : null);
        });
      });

      // Restaurar padrão
      const btnRestaurar = document.getElementById('btn-restaurar-padrao');
      if (btnRestaurar) {
        btnRestaurar.addEventListener('click', () => {
          velocidadeAtual = parseFloat(cidadeAtualDetalhada.velocidade_kmh);
          categoriasAtivas = new Set(cidadeAtualDetalhada.indices.map(i => i.chave).filter(k => k !== 'geral'));
          document.getElementById('analise-modo-select').value = 'livre';
          verificarEAplicarModoPessoal();
        });
      }

      // Como Calculamos modal
      document.getElementById('btn-como-calculamos').addEventListener('click', () => {
        document.getElementById('modal-explicativo-moreno').style.display = 'flex';
      });

      document.getElementById('modal-explicativo-close-x').addEventListener('click', () => {
        document.getElementById('modal-explicativo-moreno').style.display = 'none';
      });
      document.getElementById('modal-explicativo-close-btn').addEventListener('click', () => {
        document.getElementById('modal-explicativo-moreno').style.display = 'none';
      });

      // Cobertura por serviço (clique para heatmap)
      document.querySelectorAll('.service-coverage-row').forEach(row => {
        row.addEventListener('click', () => {
          const chave = row.getAttribute('data-chave');
          
          if (categoriaHeatmapAtiva === chave) {
            // Desativa heatmap
            categoriaHeatmapAtiva = null;
            document.getElementById('heatmap-toggle').checked = false;
            document.getElementById('heatmap-categoria-select').value = '';
            updateHeatmap();
            exibirDiagnosticoMoreno(modo === 'completo' && noTrabalhoSalvo ? noTrabalhoSalvo.osm_id : null);
          } else {
            // Ativa heatmap da categoria clicada
            categoriaHeatmapAtiva = chave;
            document.getElementById('heatmap-toggle').checked = true;
            
            if (chave === 'trabalho_pessoal') {
              document.getElementById('heatmap-categoria-select').value = '';
              toggleHeatmap(cidadeAtualDetalhada.id, 'trabalho_pessoal', true, velocidadeAtual, '', amostraTrabalhoEspecial);
            } else {
              document.getElementById('heatmap-categoria-select').value = chave;
              updateHeatmap();
            }
            exibirDiagnosticoMoreno(modo === 'completo' && noTrabalhoSalvo ? noTrabalhoSalvo.osm_id : null);
          }
        });
      });

    } catch (e) {
      console.error(e);
      panel.innerHTML = `<p style="color:#ef4444; padding:20px;">Erro ao calcular diagnostico dinamico.</p>`;
    }
  }

  // --- Funções do Modal e Processamento (Fase 08) ---
  
  // --- Funções do Modal e Processamento (Fase 12, 13 e 14) ---
  
  function abrirModalNovaCidade() {
    document.getElementById('modal-processamento').style.display = 'flex';
    document.getElementById('modal-search-section').style.display = 'block';
    document.getElementById('modal-vitrine-section').style.display = 'none';
    document.getElementById('modal-progress-section').style.display = 'none';
    document.getElementById('modal-result-section').style.display = 'none';
    document.getElementById('input-search-q').value = '';
    document.getElementById('search-results-list').innerHTML = '';
  }

  function fecharModal() {
    document.getElementById('modal-processamento').style.display = 'none';
    if (!pollingIntervalId && document.getElementById('badge-processamento-bg').style.display !== 'none') {
      document.getElementById('badge-processamento-bg').style.display = 'none';
    }
  }

  function minimizarModal() {
    document.getElementById('modal-processamento').style.display = 'none';
    document.getElementById('badge-processamento-bg').style.display = 'flex';
  }

  function reabrirModalBackground() {
    document.getElementById('modal-processamento').style.display = 'flex';
    document.getElementById('modal-search-section').style.display = 'none';
    document.getElementById('modal-vitrine-section').style.display = 'none';
    document.getElementById('modal-progress-section').style.display = 'block';
    document.getElementById('modal-result-section').style.display = 'none';
  }

  async function buscarNominatim() {
    const q = document.getElementById('input-search-q').value.trim();
    if (q.length < 3) {
      mostrarToast("Digite pelo menos 3 caracteres.");
      return;
    }
    const list = document.getElementById('search-results-list');
    list.innerHTML = '<p style="text-align:center; padding:10px; font-size:0.8rem; color:#64748b;">Buscando no Nominatim...</p>';
    try {
      const results = await getGeocodificar(q);
      list.innerHTML = '';
      if (results.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding:10px; font-size:0.8rem; color:#64748b;">Nenhum local encontrado.</p>';
        return;
      }
      results.forEach(res => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '8px';
        div.style.border = '1px solid var(--border-color)';
        div.style.borderRadius = '4px';
        div.style.backgroundColor = '#f8fafc';
        
        const span = document.createElement('span');
        span.style.fontSize = '0.75rem';
        span.style.flex = '1';
        span.style.marginRight = '8px';
        span.innerText = res.nome_exibicao;
        
        const btn = document.createElement('button');
        btn.className = 'btn-primario';
        btn.style.padding = '4px 10px';
        btn.style.fontSize = '0.75rem';
        btn.style.cursor = 'pointer';
        btn.innerText = res.ja_processada ? 'Carregar' : 'Selecionar';
        
        btn.addEventListener('click', async () => {
          if (res.ja_processada) {
            fecharModal();
            await carregarCidades();
            selectCidade.value = res.cidade_id.toString();
            selectCidade.dispatchEvent(new Event('change'));
          } else {
            abrirVitrineCidade(res);
          }
        });
        
        div.appendChild(span);
        div.appendChild(btn);
        list.appendChild(div);
      });
    } catch (err) {
      list.innerHTML = `<p style="text-align:center; color:#ef4444; padding:10px; font-size:0.8rem;">Erro: ${err.message}</p>`;
    }
  }

  let localSelecionado = null;
  async function abrirVitrineCidade(local) {
    localSelecionado = local;
    document.getElementById('modal-search-section').style.display = 'none';
    document.getElementById('modal-vitrine-section').style.display = 'block';
    document.getElementById('vitrine-cidade-nome').innerText = local.nome_exibicao.split(',')[0];
    
    const list = document.getElementById('vitrine-categorias-list');
    list.innerHTML = '<p style="text-align:center; padding:10px; grid-column:span 2; font-size:0.8rem; color:#64748b;">Consultando Overpass...</p>';
    
    try {
      const items = await getVitrine(local.osm_tipo, local.osm_id);
      list.innerHTML = '';
      if (items.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding:10px; grid-column:span 2; font-size:0.8rem; color:#ef4444;">Nenhum serviço do catálogo mestre encontrado nessa localidade.</p>';
        return;
      }
      items.forEach(item => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '6px';
        label.style.cursor = 'pointer';
        
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'vitrine-chk';
        chk.value = item.chave;
        chk.checked = item.padrao && item.quantidade > 0;
        
        const dot = document.createElement('span');
        dot.style.backgroundColor = item.cor;
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '50%';
        dot.style.display = 'inline-block';
        
        const text = document.createElement('span');
        text.innerHTML = `${item.rotulo.split(' ')[0]} <span style="color:#64748b; font-size:0.7rem;">(${item.quantidade})</span>`;
        
        label.appendChild(chk);
        label.appendChild(dot);
        label.appendChild(text);
        list.appendChild(label);
      });
    } catch (err) {
      list.innerHTML = `<p style="text-align:center; color:#ef4444; padding:10px; grid-column:span 2; font-size:0.8rem;">Erro ao carregar vitrine: ${err.message}</p>`;
    }
  }

  async function processarCidadeVitrine() {
    const checkedChks = document.querySelectorAll('.vitrine-chk:checked');
    if (checkedChks.length === 0) {
      mostrarToast("Selecione pelo menos um serviço para processar.");
      return;
    }
    const categorias = Array.from(checkedChks).map(c => c.value);
    
    try {
      const res = await fetch('/api/v1/processamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osm_tipo: localSelecionado.osm_tipo,
          osm_id: localSelecionado.osm_id,
          nome_exibicao: localSelecionado.nome_exibicao,
          categorias
        })
      });
      const data = await res.json();
      if (res.status === 202) {
        iniciarAcompanhamentoJob(data.id, localSelecionado.nome_exibicao);
      } else if (res.status === 409) {
        mostrarToast("Processamento concorrente detectado!");
        iniciarAcompanhamentoJob(data.job.id, data.job.consulta_osm);
      } else {
        mostrarToast(data.erro || "Falha ao iniciar processamento.");
      }
    } catch (err) {
      mostrarToast("Erro de conexão ao processar cidade.");
    }
  }

  // --- Gestão de Cidades (Fase 12.4) ---
  
  function abrirModalGestao() {
    const tokenStr = localStorage.getItem('gestao_admin_token') || '';
    document.getElementById('gestao-admin-token').value = tokenStr;
    document.getElementById('gestao-token-container').style.display = 'block';
    
    document.getElementById('modal-gestao').style.display = 'flex';
    carregarCidadesGestao();
  }

  function fecharModalGestao() {
    const tokenStr = document.getElementById('gestao-admin-token').value.trim();
    localStorage.setItem('gestao_admin_token', tokenStr);
    document.getElementById('modal-gestao').style.display = 'none';
  }

  async function carregarCidadesGestao() {
    const list = document.getElementById('gestao-cidades-lista');
    list.innerHTML = '<p style="text-align:center; padding:10px;">Carregando cidades...</p>';
    try {
      const cidades = await getCidades();
      list.innerHTML = '';
      if (cidades.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding:10px;">Nenhuma cidade processada.</p>';
        return;
      }
      cidades.forEach(c => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '8px';
        div.style.border = '1px solid var(--border-color)';
        div.style.borderRadius = '4px';
        div.style.backgroundColor = '#f8fafc';

        const info = document.createElement('div');
        info.style.flex = '1';
        info.innerHTML = `<strong>${c.nome}</strong> <span style="font-size:0.7rem; color:#64748b;">(${c.pais})</span>`;

        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '6px';

        const btnReprocessar = document.createElement('button');
        btnReprocessar.className = 'btn-secundario';
        btnReprocessar.style.padding = '4px 8px';
        btnReprocessar.style.fontSize = '0.75rem';
        btnReprocessar.style.cursor = 'pointer';
        btnReprocessar.innerText = 'Reprocessar';
        btnReprocessar.addEventListener('click', () => reprocessarCidadeClick(c));

        const btnExcluir = document.createElement('button');
        btnExcluir.className = 'btn-secundario';
        btnExcluir.style.padding = '4px 8px';
        btnExcluir.style.fontSize = '0.75rem';
        btnExcluir.style.cursor = 'pointer';
        btnExcluir.style.color = '#ef4444';
        btnExcluir.style.borderColor = '#fee2e2';
        btnExcluir.innerText = 'Excluir';
        btnExcluir.addEventListener('click', () => excluirCidadeClick(c));

        btns.appendChild(btnReprocessar);
        btns.appendChild(btnExcluir);
        div.appendChild(info);
        div.appendChild(btns);
        list.appendChild(div);
      });
    } catch (err) {
      list.innerHTML = `<p style="text-align:center; color:#ef4444; padding:10px;">Erro ao carregar cidades.</p>`;
    }
  }

  async function reprocessarCidadeClick(cidade) {
    if (!confirm(`Deseja reprocessar a cidade ${cidade.nome}? Isso atualizará os dados do OSM ignorando o cache.`)) {
      return;
    }
    const token = document.getElementById('gestao-admin-token').value.trim();
    try {
      const data = await reprocessarCidade(cidade.id, token);
      fecharModalGestao();
      document.getElementById('modal-processamento').style.display = 'flex';
      iniciarAcompanhamentoJob(data.id, cidade.nome);
    } catch (err) {
      mostrarToast(`Erro ao reprocessar cidade: ${err.message}`);
    }
  }

  async function excluirCidadeClick(cidade) {
    if (!confirm(`ATENÇÃO: Deseja realmente excluir permanentemente a cidade ${cidade.nome}? Todos os dados de serviços e nós serão deletados.`)) {
      return;
    }
    const token = document.getElementById('gestao-admin-token').value.trim();
    try {
      await deleteCidade(cidade.id, token);
      mostrarToast(`Cidade ${cidade.nome} excluída com sucesso.`);
      
      if (cidadeAtualDetalhada && cidadeAtualDetalhada.id === cidade.id) {
        cidadeAtualDetalhada = null;
        limparElementosMapa();
        limparIsocronas();
        limparPainelLateral();
        selectCidade.value = '0';
      }
      
      await carregarCidades();
      await carregarCidadesGestao();
    } catch (err) {
      mostrarToast(`Erro ao excluir cidade: ${err.message}`);
    }
  }

  function iniciarAcompanhamentoJob(jobId, consulta) {
    activeJobId = jobId;
    
    // Altera o modal para modo progresso
    document.getElementById('modal-search-section').style.display = 'none';
    document.getElementById('modal-vitrine-section').style.display = 'none';
    document.getElementById('modal-progress-section').style.display = 'block';
    document.getElementById('modal-result-section').style.display = 'none';
    
    document.getElementById('progress-step-msg').innerText = "Iniciando download...";
    document.getElementById('modal-progress-bar').style.width = "5%";
    document.getElementById('progress-pct-text').innerText = "5%";
    
    document.getElementById('badge-text-msg').innerText = `Processando: ${consulta.split(',')[0]} (5%)`;

    if (pollingIntervalId) clearInterval(pollingIntervalId);

    pollingIntervalId = setInterval(() => pollJobStatus(jobId, consulta), 2000);
  }

  async function pollJobStatus(jobId, consulta) {
    try {
      const res = await fetch('/api/v1/processamentos/atual');
      const data = await res.json();
      const job = data.job;

      // Se não há job ativo ou o ID mudou
      if (!job || job.id !== jobId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
        fecharModal();
        return;
      }

      // Atualiza progresso na interface
      const pct = job.pct;
      document.getElementById('modal-progress-bar').style.width = `${pct}%`;
      document.getElementById('modal-progress-bar').setAttribute('aria-valuenow', pct);
      document.getElementById('progress-pct-text').innerText = `${pct}%`;
      document.getElementById('progress-step-msg').innerText = job.msg;
      
      const nomeCurto = consulta.split(',')[0];
      document.getElementById('badge-text-msg').innerText = `Processando: ${nomeCurto} (${pct}%)`;

      if (job.status === 'concluido') {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
        
        // Sucesso
        document.getElementById('modal-progress-section').style.display = 'none';
        document.getElementById('modal-result-section').style.display = 'block';
        
        const resMsg = document.getElementById('modal-result-message');
        resMsg.className = "result-msg sucesso";
        resMsg.innerText = "Cidade processada e gravada com sucesso!";
        
        // Recarrega seletor e escolhe a cidade
        await carregarCidades();
        selectCidade.value = job.cidadeId.toString();
        
        setTimeout(() => {
          fecharModal();
          selectCidade.dispatchEvent(new Event('change'));
        }, 1500);
      } else if (job.status === 'erro') {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
        
        // Erro
        document.getElementById('modal-progress-section').style.display = 'none';
        document.getElementById('modal-result-section').style.display = 'block';
        
        const resMsg = document.getElementById('modal-result-message');
        resMsg.className = "result-msg erro";
        resMsg.innerText = job.msg || "Ocorreu um erro ao processar a cidade.";
        
        // Esconde o badge flutuante
        document.getElementById('badge-processamento-bg').style.display = 'none';
      }

    } catch (err) {
      console.warn("Erro no polling de progresso:", err);
    }
  }

  async function verificarJobAtivoAoCarregar() {
    try {
      const res = await fetch('/api/v1/processamentos/atual');
      const data = await res.json();
      const job = data.job;

      if (job && job.status === 'rodando') {
        iniciarAcompanhamentoJob(job.id, job.consulta_osm);
        reabrirModalBackground();
      }
    } catch (e) {
      // Ignora erro de rede no boot
    }
  }

  async function verificarEAplicarModoPessoal(forcarAtualizacao = false) {
    const cidadeId = parseInt(selectCidade.value, 10);
    if (isNaN(cidadeId) || cidadeId === 0) return;

    const modo = document.getElementById('analise-modo-select').value;
    const infoRota = document.getElementById('caminho-trabalho-info');

    if (modo === 'livre') {
      infoRota.style.display = 'none';
      desenharRotaCasaTrabalho(null);
      await exibirDiagnosticoMoreno();
      return;
    }

    const casaStr = localStorage.getItem(`cidade_${cidadeId}_casa`);
    const trabalhoStr = localStorage.getItem(`cidade_${cidadeId}_trabalho`);

    if (!casaStr || !trabalhoStr) {
      document.getElementById('analise-modo-select').value = 'livre';
      infoRota.style.display = 'none';
      desenharRotaCasaTrabalho(null);
      if (!forcarAtualizacao) {
        mostrarToast("Defina sua casa 🏠 e seu trabalho 💼 antes de usar o modo pessoal.");
      }
      return;
    }

    const casa = JSON.parse(casaStr);
    const trabalho = JSON.parse(trabalhoStr);

    try {
      const dataCasa = await getAlcancabilidade(cidadeId, casa.lat, casa.lon);
      const dataTrabalho = await getAlcancabilidade(cidadeId, trabalho.lat, trabalho.lon);
      
      noCasaSalvo = dataCasa.no;
      noTrabalhoSalvo = dataTrabalho.no;

      if (!noCasaSalvo || !noTrabalhoSalvo) {
        throw new Error("Não foi possível mapear casa ou trabalho aos nós da rede viária.");
      }

      try {
        const rota = await getRota(cidadeId, noCasaSalvo.osm_id, noTrabalhoSalvo.osm_id, velocidadeAtual);
        desenharRotaCasaTrabalho(rota.geojson);
        infoRota.style.display = 'block';
        document.getElementById('caminho-trabalho-tempo').innerText = rota.tempo_min.toFixed(1);
      } catch (err) {
        console.warn("Sem rota entre casa e trabalho:", err);
        infoRota.style.display = 'block';
        document.getElementById('caminho-trabalho-tempo').innerText = "Inalcançável";
        desenharRotaCasaTrabalho(null);
      }

      await exibirDiagnosticoMoreno(noTrabalhoSalvo.osm_id);

    } catch (err) {
      mostrarToast(err.message || "Erro ao processar análise do modo pessoal.");
      document.getElementById('analise-modo-select').value = 'livre';
      infoRota.style.display = 'none';
      desenharRotaCasaTrabalho(null);
    }
  }

});

// Legenda do Heatmap
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

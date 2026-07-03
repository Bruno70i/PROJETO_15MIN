import { getCidades, getComparar } from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
  const selectorGroup = document.getElementById('cities-selector-group');
  const resultDiv = document.getElementById('comparison-result');
  
  let cidadesLista = [];
  
  try {
    cidadesLista = await getCidades();
    selectorGroup.innerHTML = '';
    
    if (cidadesLista.length === 0) {
      selectorGroup.innerHTML = '<p style="color:#ef4444; font-weight:600; padding:10px;">Nenhuma cidade processada no banco.</p>';
      return;
    }
    
    cidadesLista.forEach(c => {
      const label = document.createElement('label');
      label.className = 'city-check';
      label.innerHTML = `
        <input type="checkbox" class="city-compare-chk" value="${c.id}">
        ${c.nome} (${c.pais})
      `;
      selectorGroup.appendChild(label);
    });
    
    const checkboxes = document.querySelectorAll('.city-compare-chk');
    checkboxes.forEach(chk => {
      chk.addEventListener('change', () => {
        const selecionadas = Array.from(checkboxes).filter(c => c.checked);
        if (selecionadas.length > 5) {
          chk.checked = false;
          mostrarToastLocal("Nao e possivel comparar mais de 5 cidades simultaneamente.");
          return;
        }
        
        atualizarComparacao(selecionadas.map(c => parseInt(c.value, 10)));
      });
    });
    
  } catch (error) {
    selectorGroup.innerHTML = '<p style="color:#ef4444;">Erro ao carregar cidades.</p>';
  }
  
  async function atualizarComparacao(ids) {
    if (ids.length < 2) {
      resultDiv.innerHTML = `
        <div class="warning-box">
          Selecione pelo menos duas cidades para exibir a tabela de comparacao.
        </div>
      `;
      return;
    }
    
    resultDiv.innerHTML = `
      <div style="display:flex; justify-content:center; padding: 40px 0;">
        <div class="spinner"></div>
      </div>
    `;
    
    try {
      const dados = await getComparar(ids);
      renderizarTabela(dados);
    } catch (error) {
      resultDiv.innerHTML = `
        <div class="warning-box" style="color:#ef4444; border-color:#fee2e2; background-color:#fef2f2;">
          Erro ao processar a comparacao: ${error.message}
        </div>
      `;
    }
  }
  
  function renderizarTabela(dados) {
    // Mapeia todas as categorias presentes
    const categorias = [];
    const chavesVistas = new Set();
    
    dados.forEach(d => {
      d.indices.forEach(idx => {
        if (idx.chave === 'geral') return;
        if (!chavesVistas.has(idx.chave)) {
          chavesVistas.add(idx.chave);
          categorias.push({
            chave: idx.chave,
            rotulo: idx.rotulo,
            cor_hex: idx.cor_hex
          });
        }
      });
    });
    
    let html = `
      <div class="comparison-table-wrapper">
        <table class="comparison-table">
          <thead>
            <tr>
              <th>Categoria</th>
    `;
    
    dados.forEach(d => {
      html += `<th>${d.cidade.nome}</th>`;
    });
    
    html += `
            </tr>
          </thead>
          <tbody>
    `;
    
    categorias.forEach(cat => {
      html += `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="width:10px; height:10px; border-radius:50%; background-color:${cat.cor_hex}; display:inline-block;"></span>
              ${cat.rotulo}
            </div>
          </td>
      `;
      
      dados.forEach(d => {
        const indCat = d.indices.find(i => i.chave === cat.chave);
        if (indCat) {
          const tempo = indCat.tempo_medio_min !== null ? `${indCat.tempo_medio_min.toFixed(1)} min` : 'N/A';
          html += `<td>${tempo} (${indCat.pct_dentro_limiar.toFixed(1)}%)</td>`;
        } else {
          html += `<td>Sem dados</td>`;
        }
      });
      
      html += `</tr>`;
    });
    
    // Linhas do Diagnóstico Moreno (Fase 09)
    html += `
      <tr style="background-color: #f8fafc; font-weight: 600;">
        <td>Minutos da Cidade (Moreno)</td>
    `;
    dados.forEach(d => {
      const min = d.moreno ? (d.moreno.minutos_cidade !== null ? `${d.moreno.minutos_cidade} min` : 'Sem cob. plena') : 'Reprocesse';
      html += `<td>${min}</td>`;
    });
    html += `</tr>`;

    html += `
      <tr style="background-color: #f8fafc; font-weight: 600;">
        <td>Cobertura Plena (Todos os servicos <= 15 min)</td>
    `;
    dados.forEach(d => {
      const cob = d.moreno ? `${d.moreno.pct_cobertura_plena.toFixed(1)}%` : 'Reprocesse';
      html += `<td>${cob}</td>`;
    });
    html += `</tr>`;

    html += `
      <tr style="background-color: #f8fafc; font-weight: 600;">
        <td>Classificacao de Moreno</td>
    `;
    dados.forEach(d => {
      if (d.moreno) {
        let classeCor = 'vermelho';
        if (d.moreno.classificacao === 'Cidade de 15 Minutos') classeCor = 'excelente';
        else if (d.moreno.classificacao === 'Muito proxima do conceito') classeCor = 'amarelo';
        else if (d.moreno.classificacao === 'Parcialmente aderente') classeCor = 'laranja';
        html += `<td><span class="moreno-badge ${classeCor}" style="margin: 0; font-size: 0.75rem; padding: 3px 6px;">${d.moreno.classificacao}</span></td>`;
      } else {
        html += `<td>Reprocesse</td>`;
      }
    });
    html += `</tr>`;

    html += `
      <tr class="highlighted-row">
        <td>Indice de Alcancabilidade Geral (0–100)</td>
    `;
    
    dados.forEach(d => {
      const geral = d.indices.find(i => i.chave === 'geral');
      const indVal = geral ? geral.indice.toFixed(1) : '0.0';
      html += `<td>${indVal}</td>`;
    });
    
    html += `
      </tr>
      </tbody>
      </table>
      </div>
    `;
    
    // Gráfico de barras horizontais
    html += `
      <div class="bars-section">
        <h3>Indices Gerais</h3>
    `;
    
    dados.forEach(d => {
      const geral = d.indices.find(i => i.chave === 'geral');
      const indVal = geral ? geral.indice : 0.0;
      
      let corBar = '#ef4444';
      if (indVal >= 80) corBar = '#1a9850';
      else if (indVal >= 50) corBar = '#d97706';
      
      html += `
        <div class="bar-item">
          <div class="bar-header">
            <span>${d.cidade.nome} (${d.cidade.pais})</span>
            <span>${indVal.toFixed(1)} / 100</span>
          </div>
          <div class="bar-outer">
            <div class="bar-inner" style="width: ${indVal}%; background-color: ${corBar};"></div>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
    resultDiv.innerHTML = html;
  }
  
  function mostrarToastLocal(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
});

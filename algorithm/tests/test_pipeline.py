import pytest
import networkx as nx
import osmnx as ox
from algorithm.graph import slug, baixar_ou_carregar_grafo
from algorithm.config import Configuracao
from algorithm.metrics import indice_no, agregados_cidade, diagnostico_moreno
from algorithm.services import localizar_servicos
from algorithm.reachability import calcular_categoria
from algorithm.isochrones import gerar_isocronas
from algorithm.db import conectar_db, carregar_categorias, gravar_cidade

def test_slug():
    assert slug("Praia Grande, São Paulo, Brazil") == "praia_grande_sao_paulo_brazil"
    assert slug("Águas de São Pedro") == "aguas_de_sao_pedro"
    assert slug("A-B_C") == "a_b_c"

def test_indice_no():
    # Caso 1: Todas dentro do limiar (15 min)
    tempos = {1: 10.0, 2: 5.0, 3: 12.0}
    assert indice_no(tempos, 15) == 100.0
    
    # Caso 2: Metade dentro (50%)
    tempos = {1: 10.0, 2: 20.0}
    assert indice_no(tempos, 15) == 50.0
    
    # Caso 3: Nenhuma dentro (0%)
    tempos = {1: 20.0, 2: 30.0}
    assert indice_no(tempos, 15) == 0.0
    
    # Caso 4: Se não houver tempos, retorna 0
    assert indice_no({}, 15) == 0.0

def test_diagnostico_moreno_unitario():
    alcancabilidade = {
        101: {1: (10.0, 1), 2: (5.0, 2)},
        102: {1: (8.0, 1), 2: (12.0, 2)},
        103: {1: (22.0, 1), 2: (18.0, 2)},
        104: {1: (14.0, 1), 2: (None, None)}
    }
    categorias_presentes = [1, 2]
    limiar = 15.0
    agregados = [
        {"categoria_id": 1, "pct_dentro_limiar": 75.0},
        {"categoria_id": 2, "pct_dentro_limiar": 50.0}
    ]
    res = diagnostico_moreno(alcancabilidade, categorias_presentes, limiar, agregados)
    assert res["pct_cobertura_plena"] == 50.0
    assert res["minutos_cidade"] == 12
    assert res["tempo_pior_mediana"] == 12.0
    assert res["tempo_pior_medio"] == 14.67
    assert res["pct_nos_sem_cobertura"] == 25.0
    assert res["categoria_gargalo_id"] == 2
    assert res["pct_gargalo"] == 50.0
    assert res["atende_conceito"] is True
    assert res["classificacao"] == "Cidade de 15 Minutos"

def test_grafo_e_pesos():
    cfg = Configuracao(consulta_osm="Águas de São Pedro, São Paulo, Brazil", usar_cache_grafo=True)
    G = baixar_ou_carregar_grafo(cfg)
    assert len(G.nodes) > 100
    for u, v, data in G.edges(data=True):
        assert "travel_time" in data
        assert data["travel_time"] > 0

@pytest.mark.integration
def test_pipeline_completo():
    place = "Águas de São Pedro, São Paulo, Brazil"
    cfg = Configuracao(consulta_osm=place, usar_cache_grafo=True)
    
    conn = conectar_db()
    try:
        # Carregar categorias
        categorias = carregar_categorias(conn)
        assert len(categorias) > 0
        
        # 1. Carrega grafo
        G = baixar_ou_carregar_grafo(cfg)
        
        # 2. Localiza serviços
        servicos_por_categoria = localizar_servicos(G, cfg, categorias)
        
        # 3. Calcula alcançabilidade
        alcancabilidade_por_no = {no_id: {} for no_id in G.nodes}
        nos_coords = {}
        for no_id, data in G.nodes(data=True):
            nos_coords[no_id] = (float(data.get("y", 0.0)), float(data.get("x", 0.0)))
            
        for cat_id in servicos_por_categoria.keys():
            servicos = servicos_por_categoria[cat_id]
            nos_servicos = {s.osm_no_id for s in servicos}
            tempos, dono = calcular_categoria(G, nos_servicos)
            
            for no_id in G.nodes:
                tempo = tempos.get(no_id, None)
                dono_id = dono.get(no_id, None)
                alcancabilidade_por_no[no_id][cat_id] = (tempo, dono_id)
                
        # 4. Isócronas
        alc_simples = {no_id: {cat_id: val[0] for cat_id, val in cat_tempos.items()}
                       for no_id, cat_tempos in alcancabilidade_por_no.items()}
        isocronas = gerar_isocronas(cfg, alc_simples, nos_coords)
        
        # 5. Agregados
        agregados = agregados_cidade(None, list(G.nodes), alc_simples, cfg.limiar_minutos)
        
        # 5.5 Diagnóstico Moreno
        categorias_presentes = [cat['id'] for cat in categorias if len(servicos_por_categoria.get(cat['id'], [])) > 0]
        categorias_ausentes = [cat['id'] for cat in categorias if len(servicos_por_categoria.get(cat['id'], [])) == 0]
        moreno_res = diagnostico_moreno(alcancabilidade_por_no, categorias_presentes, cfg.limiar_minutos, agregados)
        moreno_res['categorias_ausentes'] = categorias_ausentes
        
        # 6. Grava no banco
        resultados = {
            'tempo_execucao_s': 1.5,
            'servicos_por_categoria': servicos_por_categoria,
            'alcancabilidade_por_no': alcancabilidade_por_no,
            'isocronas': isocronas,
            'agregados': agregados,
            'moreno': moreno_res,
            'categorias_processadas': [cat['id'] for cat in categorias]
        }

        cidade_id = gravar_cidade(conn, cfg, G, resultados)
        assert cidade_id is not None
        
        # Asserts no Banco de Dados
        with conn.cursor() as cur:
            # rows em no == nos do grafo
            cur.execute("SELECT count(*) FROM no WHERE cidade_id = %s", (cidade_id,))
            assert cur.fetchone()[0] == len(G.nodes)
            
            # para cada categoria com serviços, linhas em alcancabilidade_no == nos do grafo
            for cat_id, servs in servicos_por_categoria.items():
                if servs:
                    cur.execute("SELECT count(*), count(tempo_min) FROM alcancabilidade_no WHERE cidade_id = %s AND categoria_id = %s", (cidade_id, cat_id))
                    count, count_tempos = cur.fetchone()
                    assert count == len(G.nodes)
                    cur.execute("SELECT count(*) FROM alcancabilidade_no WHERE cidade_id = %s AND categoria_id = %s AND tempo_min < 0", (cidade_id, cat_id))
                    assert cur.fetchone()[0] == 0
                    
            # indice_cidade tem linha da categoria 0 com indice entre 0 e 100
            cur.execute("SELECT indice FROM indice_cidade WHERE cidade_id = %s AND categoria_id = 0", (cidade_id,))
            row = cur.fetchone()
            assert row is not None
            assert 0 <= float(row[0]) <= 100
            
            # indice_moreno tem 1 linha e pct_cobertura_plena está entre 0 e 100
            cur.execute("SELECT pct_cobertura_plena FROM indice_moreno WHERE cidade_id = %s", (cidade_id,))
            row = cur.fetchone()
            assert row is not None
            assert 0 <= float(row[0]) <= 100

            # cidade_categoria registra TODAS as categorias processadas (fase 13)
            cur.execute("SELECT count(*) FROM cidade_categoria WHERE cidade_id = %s", (cidade_id,))
            assert cur.fetchone()[0] == len(resultados['categorias_processadas'])
            
        # Reprocessar a mesma cidade nao duplica linhas (upsert ok)
        cidade_id_2 = gravar_cidade(conn, cfg, G, resultados)
        assert cidade_id_2 is not None
        
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM cidade WHERE consulta_osm = %s", (place,))
            assert cur.fetchone()[0] == 1
            
    finally:
        conn.close()

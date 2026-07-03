import os
import json
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from .config import RAIZ

def conectar_db():
    """Lê o arquivo .env e estabelece conexão com o PostgreSQL."""
    load_dotenv(RAIZ / ".env")
    conn = psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
        database=os.getenv("PGDATABASE", "alcancabilidade"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", "123")
    )
    return conn

def carregar_categorias(conn) -> list[dict]:
    """Carrega as categorias do banco (exceto id 0 geral)."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, chave, rotulo, tag_osm, cor_hex FROM categoria_servico WHERE id != 0 ORDER BY id")
        rows = cur.fetchall()
        for row in rows:
            if isinstance(row["tag_osm"], str):
                row["tag_osm"] = json.loads(row["tag_osm"])
        return rows

def gravar_cidade(conn, cfg, G, resultados):
    """
    Grava todo o resultado do processamento da cidade em uma única transação SQL.
    Deleta dados antigos caso a cidade já tenha sido processada (cascade delete).
    """
    with conn:
        with conn.cursor() as cur:
            # 1. Limpeza e criação da cidade
            cur.execute("DELETE FROM cidade WHERE consulta_osm = %s", (cfg.consulta_osm,))
            
            partes = [p.strip() for p in cfg.consulta_osm.split(",")]
            nome = partes[0] if partes else cfg.consulta_osm
            pais = partes[-1] if len(partes) > 1 else ""
            
            cur.execute("""
                INSERT INTO cidade (nome, pais, consulta_osm, qtd_nos, qtd_arestas, tempo_execucao_s, velocidade_kmh, limiar_minutos)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (nome, pais, cfg.consulta_osm, len(G.nodes), len(G.edges), resultados['tempo_execucao_s'], cfg.velocidade_kmh, cfg.limiar_minutos))
            cidade_id = cur.fetchone()[0]
            
            # 2. Inserção de nós em lote
            no_records = []
            for node_id, data in G.nodes(data=True):
                lat = float(data.get("y", 0.0))
                lon = float(data.get("x", 0.0))
                no_records.append((cidade_id, node_id, lat, lon))
            
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO no (cidade_id, osm_id, lat, lon) VALUES %s",
                no_records,
                page_size=10000
            )
            
            # 3. Inserção de serviços em lote
            servico_records = []
            for cat_id, servicos in resultados['servicos_por_categoria'].items():
                for s in servicos:
                    servico_records.append((cidade_id, cat_id, s.nome, s.lat, s.lon, s.osm_no_id))
            
            if servico_records:
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO servico (cidade_id, categoria_id, nome, lat, lon, osm_no_id) VALUES %s",
                    servico_records,
                    page_size=10000
                )
            
            # Recupera o mapeamento de IDs dos serviços persistidos para associar aos nós
            mapa_servicos = {}
            cur.execute("SELECT id, categoria_id, osm_no_id FROM servico WHERE cidade_id = %s ORDER BY id ASC", (cidade_id,))
            for s_id, cat_id, osm_no_id in cur.fetchall():
                chave = (cat_id, osm_no_id)
                if chave not in mapa_servicos:
                    mapa_servicos[chave] = s_id
                    
            # 3.5 Inserção de arestas (traçado real das vias, usado pela API de rotas)
            # O grafo é um MultiDiGraph: entre duas interseções pode haver mais de
            # uma via paralela — mantém-se apenas a mais rápida por par (u, v).
            aresta_melhor = {}
            for u, v, data in G.edges(data=True):
                tempo_s = float(data.get("travel_time", 0.0))
                chave = (u, v)
                if chave in aresta_melhor and tempo_s >= aresta_melhor[chave][0]:
                    continue
                geom = data.get("geometry")
                if geom is not None:
                    coords = [[float(x), float(y)] for x, y in geom.coords]
                else:
                    coords = [
                        [float(G.nodes[u]["x"]), float(G.nodes[u]["y"])],
                        [float(G.nodes[v]["x"]), float(G.nodes[v]["y"])],
                    ]
                aresta_melhor[chave] = (tempo_s, coords)

            aresta_records = [
                (cidade_id, u, v, tempo_s, json.dumps(coords))
                for (u, v), (tempo_s, coords) in aresta_melhor.items()
            ]
            if aresta_records:
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO aresta (cidade_id, no_origem, no_destino, tempo_s, geom) VALUES %s",
                    aresta_records,
                    page_size=10000
                )

            # 4. Inserção de alcançabilidade dos nós
            alc_records = []
            for no_id, cat_tempos in resultados['alcancabilidade_por_no'].items():
                for cat_id, (tempo_min, dono_no_id) in cat_tempos.items():
                    dentro_limiar = (tempo_min is not None and tempo_min <= cfg.limiar_minutos)
                    servico_id = None
                    if dono_no_id is not None:
                        servico_id = mapa_servicos.get((cat_id, dono_no_id))
                    
                    alc_records.append((
                        cidade_id,
                        no_id,
                        cat_id,
                        tempo_min,
                        dentro_limiar,
                        servico_id
                    ))
            
            if alc_records:
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO alcancabilidade_no (cidade_id, osm_no_id, categoria_id, tempo_min, dentro_limiar, servico_id) VALUES %s",
                    alc_records,
                    page_size=10000
                )
                
            # 5. Inserção do índice agregado da cidade
            indice_records = []
            for ind in resultados['agregados']:
                indice_records.append((
                    cidade_id,
                    ind['categoria_id'],
                    ind['tempo_medio_min'],
                    ind['pct_dentro_limiar'],
                    ind['indice']
                ))
            
            if indice_records:
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO indice_cidade (cidade_id, categoria_id, tempo_medio_min, pct_dentro_limiar, indice) VALUES %s",
                    indice_records
                )
                
            # 6. Inserção de isócronas em GeoJSON
            isocrona_records = []
            for (cat_id, minutos), geojson in resultados['isocronas'].items():
                isocrona_records.append((
                    cidade_id,
                    cat_id,
                    minutos,
                    json.dumps(geojson)
                ))
                
            if isocrona_records:
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO isocrona (cidade_id, categoria_id, minutos, geojson) VALUES %s",
                    isocrona_records
                )
                
            # 6.5 Inserção do índice de Moreno (Fase 09)
            if 'moreno' in resultados and resultados['moreno'] is not None:
                m = resultados['moreno']
                cur.execute("""
                    INSERT INTO indice_moreno (
                        cidade_id, limiar_minutos, pct_cobertura_plena, minutos_cidade,
                        tempo_pior_medio, tempo_pior_mediana, pct_nos_sem_cobertura,
                        atende_conceito, classificacao, categoria_gargalo_id, pct_gargalo,
                        categorias_ausentes, distribuicao
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    cidade_id,
                    m["limiar_minutos"],
                    m["pct_cobertura_plena"],
                    m["minutos_cidade"],
                    m["tempo_pior_medio"],
                    m["tempo_pior_mediana"],
                    m["pct_nos_sem_cobertura"],
                    m["atende_conceito"],
                    m["classificacao"],
                    m["categoria_gargalo_id"],
                    m["pct_gargalo"],
                    json.dumps(m.get("categorias_ausentes", [])),
                    json.dumps(m["distribuicao"])
                ))
                
            # 7. Atualização final das estatísticas na cidade
            cur.execute("""
                UPDATE cidade 
                SET qtd_nos = %s, qtd_arestas = %s, tempo_execucao_s = %s
                WHERE id = %s
            """, (len(G.nodes), len(G.edges), resultados['tempo_execucao_s'], cidade_id))
            
    return cidade_id

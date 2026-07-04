import re
import unicodedata
import osmnx as ox
import networkx as nx
from .config import PASTA_CACHE

# Configura o cache global do OSMnx
ox.settings.use_cache = True
ox.settings.cache_folder = str(PASTA_CACHE)

def slug(texto: str) -> str:
    """Gera um slug amigável a partir do texto, removendo acentos e pontuação."""
    texto = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode('utf-8')
    texto = texto.lower()
    texto = re.sub(r'[^a-z0-9]+', '_', texto)
    texto = re.sub(r'_+', '_', texto).strip('_')
    return texto

def baixar_ou_carregar_grafo(cfg) -> nx.MultiDiGraph:
    """Carrega o grafo do cache em formato GraphML ou baixa do OpenStreetMap."""
    PASTA_CACHE.mkdir(exist_ok=True, parents=True)
    
    # Define o slug e o caminho do arquivo GraphML
    if cfg.osm_tipo and cfg.osm_id:
        nome_slug = f"{cfg.osm_tipo}_{cfg.osm_id}"
    else:
        nome_slug = slug(cfg.consulta_osm)
    
    caminho = PASTA_CACHE / f"{nome_slug}.graphml"
    
    # Configura cache do OSMnx
    ox.settings.use_cache = not cfg.atualizar
    
    usar_cache = cfg.usar_cache_grafo and not cfg.atualizar
    
    if caminho.exists() and usar_cache:
        G = ox.load_graphml(caminho)
    else:
        if cfg.osm_tipo and cfg.osm_id:
            codigo = ("R" if cfg.osm_tipo == "relation" else "W") + str(cfg.osm_id)
            gdf = ox.geocode_to_gdf(codigo, by_osmid=True)
            poligono = gdf.geometry.iloc[0]
            G = ox.graph_from_polygon(poligono, network_type="walk")
        else:
            G = ox.graph_from_place(cfg.consulta_osm, network_type="walk")
            
        # Pedestre velocidade uniforme: km/h para m/s
        velocidade_ms = cfg.velocidade_kmh * 1000.0 / 3600.0
        for u, v, data in G.edges(data=True):
            length = data.get("length", 0.0)
            data["travel_time"] = float(length) / velocidade_ms
        ox.save_graphml(G, caminho)
        
    return G

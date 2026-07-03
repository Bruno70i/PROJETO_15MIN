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
    caminho = PASTA_CACHE / f"{slug(cfg.consulta_osm)}.graphml"
    
    if caminho.exists() and cfg.usar_cache_grafo:
        G = ox.load_graphml(caminho)
    else:
        G = ox.graph_from_place(cfg.consulta_osm, network_type="walk")
        # Pedestre velocidade uniforme: km/h para m/s
        velocidade_ms = cfg.velocidade_kmh * 1000.0 / 3600.0
        for u, v, data in G.edges(data=True):
            length = data.get("length", 0.0)
            data["travel_time"] = float(length) / velocidade_ms
        ox.save_graphml(G, caminho)
        
    return G

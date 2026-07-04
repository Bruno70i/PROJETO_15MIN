from dataclasses import dataclass
import pandas as pd
import osmnx as ox
import networkx as nx

@dataclass
class Servico:
    categoria_id: int
    nome: str | None
    lat: float
    lon: float
    osm_no_id: int

def localizar_servicos(G: nx.MultiDiGraph, cfg, categorias: list) -> dict[int, list[Servico]]:
    """Busca feições no OSM para cada categoria e localiza o nó mais próximo no grafo em lote."""
    resultados = {}
    for cat in categorias:
        cat_id = cat["id"]
        tag = cat["tag_osm"]
        
        # Ignorar categoria sentinela 'geral'
        if cat_id == 0:
            continue
            
        resultados[cat_id] = []
        try:
            if cfg.osm_tipo and cfg.osm_id:
                codigo = ("R" if cfg.osm_tipo == "relation" else "W") + str(cfg.osm_id)
                gdf = ox.geocode_to_gdf(codigo, by_osmid=True)
                poligono = gdf.geometry.iloc[0]
                places = ox.features_from_polygon(poligono, tag)
            else:
                places = ox.features_from_place(cfg.consulta_osm, tag)
                
            if places.empty:
                print(f"[AVISO] Nenhuma feicao encontrada para '{cat['rotulo']}'")
                continue
                
            lats = []
            lons = []
            nomes = []
            
            for idx, row in places.iterrows():
                geom = row.geometry
                if geom is None:
                    continue
                if geom.geom_type != "Point":
                    geom = geom.centroid
                
                lat = geom.y
                lon = geom.x
                nome = row.get("name")
                if pd.isna(nome) or nome is None:
                    nome = None
                else:
                    nome = str(nome)
                    
                lats.append(lat)
                lons.append(lon)
                nomes.append(nome)
                
            if lats:
                nos_proximos = ox.distance.nearest_nodes(G, X=lons, Y=lats)
                for i in range(len(lats)):
                    resultados[cat_id].append(
                        Servico(
                            categoria_id=cat_id,
                            nome=nomes[i],
                            lat=lats[i],
                            lon=lons[i],
                            osm_no_id=int(nos_proximos[i])
                        )
                    )
                print(f"  Encontrados {len(lats)} locais para '{cat['rotulo']}'")
            else:
                print(f"[AVISO] Nao foram encontradas geometrias validas para '{cat['rotulo']}'")
                
        except Exception as e:
            # osmnx pode levantar exceção se não houver elementos com a tag especificada
            print(f"[AVISO] Sem resultados para '{cat['rotulo']}': {e}")
            
    return resultados

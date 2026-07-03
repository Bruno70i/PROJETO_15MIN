import shapely
from shapely.geometry import MultiPoint, mapping

def gerar_isocronas(cfg, alcancabilidade: dict[int, dict[int, float | None]], nos_coords: dict[int, tuple[float, float]]) -> dict[tuple[int, int], dict]:
    """
    Gera polígonos de isócrona (MultiPolygon/Polygon) para 5, 10 e 15 minutos por categoria
    utilizando concave_hull (com fallback para convex_hull).
    
    Retorna:
        Dicionário mapeando {(categoria_id, minutos): GeoJSON_dict}
    """
    isocronas = {}
    
    # Identifica categorias ativas
    categorias = set()
    for cat_tempos in alcancabilidade.values():
        for cat_id in cat_tempos.keys():
            categorias.add(cat_id)
            
    for cat_id in categorias:
        for minutos in cfg.minutos_isocronas:
            pontos_coords = []
            for no_id, cat_tempos in alcancabilidade.items():
                tempo = cat_tempos.get(cat_id)
                if tempo is not None and tempo <= minutos:
                    lat, lon = nos_coords[no_id]
                    # GeoJSON requer a ordem [longitude, latitude]
                    pontos_coords.append((lon, lat))
                    
            # Precisamos de pelo menos 3 pontos para criar uma área (polígono)
            if len(pontos_coords) < 3:
                continue
                
            try:
                multipoint = MultiPoint(pontos_coords)
                
                # shapely.concave_hull exige shapely >= 2.0
                if len(pontos_coords) >= 4:
                    poly = shapely.concave_hull(multipoint, ratio=0.4)
                else:
                    poly = shapely.convex_hull(multipoint)
                
                # Se o resultado não for um polígono válido (ex. retornou uma linha ou ponto), tenta convex_hull
                if poly.geom_type not in ("Polygon", "MultiPolygon") or not poly.is_valid:
                    poly = shapely.convex_hull(multipoint)
                    
                if poly.geom_type in ("Polygon", "MultiPolygon") and poly.is_valid:
                    isocronas[(cat_id, minutos)] = mapping(poly)
            except Exception as e:
                # Tenta fallback direto para convex_hull em caso de qualquer exceção
                try:
                    multipoint = MultiPoint(pontos_coords)
                    poly = shapely.convex_hull(multipoint)
                    if poly.geom_type in ("Polygon", "MultiPolygon") and poly.is_valid:
                        isocronas[(cat_id, minutos)] = mapping(poly)
                except Exception as ex:
                    print(f"[AVISO] Falha ao gerar isocrona para cat {cat_id} ({minutos} min): {ex}")
                    
    return isocronas

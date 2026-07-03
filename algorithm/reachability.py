import networkx as nx

def calcular_categoria(G: nx.MultiDiGraph, nos_servicos: set):
    """
    Calcula o tempo mínimo de caminhada (em minutos) de cada nó do grafo ao serviço
    mais próximo da categoria correspondente (multi-source Dijkstra), bem como
    identifica qual é esse serviço mais próximo (células de Voronoi).
    
    Observação metodológica: O grafo do OSMnx é direcionado (MultiDiGraph). Os algoritmos
    multi_source_dijkstra_path_length e voronoi_cells calculam as distâncias no sentido
    de saída DOS serviços PARA os nós (serviço -> nó). Como a malha viária é configurada
    para pedestres (network_type='walk'), as vias são bidirecionais e transitáveis nos
    dois sentidos. Portanto, assume-se que o tempo de serviço -> nó é equivalente ao
    tempo de nó -> serviço.
    
    Retorna:
        tempos (dict): mapeamento {id_no: tempo_minutos}
        dono (dict): mapeamento {id_no: id_no_servico_mais_proximo}
    """
    if not nos_servicos:
        return {}, {}
        
    # Dijkstra multi-source a partir de todos os serviços da categoria
    tempos_s = nx.multi_source_dijkstra_path_length(
        G, sources=list(nos_servicos), weight="travel_time"
    )
    # Converte de segundos para minutos
    tempos = {no: float(t) / 60.0 for no, t in tempos_s.items()}
    
    # Voronoi para determinar a atribuição de qual é o serviço mais próximo
    try:
        celulas = nx.voronoi_cells(G, center_nodes=set(nos_servicos), weight="travel_time")
    except TypeError:
        # Fallback para assinaturas antigas de networkx
        celulas = nx.voronoi_cells(G, set(nos_servicos), weight="travel_time")
        
    dono = {}
    for no_servico, atendidos in celulas.items():
        if no_servico == "unreachable":
            continue
        for no in atendidos:
            dono[no] = no_servico
            
    return tempos, dono

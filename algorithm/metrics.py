def indice_no(tempos_por_categoria: dict[int, float | None], limiar: float) -> float:
    """
    Calcula o índice de alcançabilidade individual de um nó (em uma escala de 0 a 100).
    
    Fórmula:
        Indice_No = (Numero de categorias com tempo <= Limiar) / (Numero total de categorias com serviços na cidade) * 100
        
    Parâmetros:
        tempos_por_categoria: Dicionário mapeando {categoria_id: tempo_minutos_ou_None}
        limiar: Limiar de tempo em minutos (geralmente 15)
    """
    if not tempos_por_categoria:
        return 0.0
    dentro = 0
    total_categorias_com_servicos = len(tempos_por_categoria)
    for tempo in tempos_por_categoria.values():
        if tempo is not None and tempo <= limiar:
            dentro += 1
    return (float(dentro) / total_categorias_com_servicos) * 100.0

def agregados_cidade(cidade_id: int, nos_ids: list[int], alcancabilidade: dict[int, dict[int, float | None]], limiar: float) -> list[dict]:
    """
    Calcula as métricas agregadas da cidade por categoria e o índice geral.
    
    Fórmulas aplicadas:
        - Para cada categoria (1 a 8):
            * tempo_medio_min: Média aritmética simples dos tempos de acesso de todos os nós alcançáveis.
            * pct_dentro_limiar: Percentual de nós da cidade cujo tempo de acesso é menor ou igual ao limiar.
            * indice: Igual ao pct_dentro_limiar (0 a 100).
            
        - Para o índice geral (categoria 0):
            * tempo_medio_min: Média das médias de tempo das categorias individuais ativas.
            * pct_dentro_limiar: Média dos percentuais dentro do limiar das categorias individuais ativas.
            * indice: Média aritmética simples dos índices de alcançabilidade individual (Indice_No) de todos os nós.
            
    Retorna:
        Uma lista de dicionários contendo os dados prontos para inserção na tabela `indice_cidade`.
    """
    # Identifica quais categorias de fato têm dados de alcançabilidade
    categorias_ativas = set()
    for cat_tempos in alcancabilidade.values():
        for cat_id in cat_tempos.keys():
            categorias_ativas.add(cat_id)
            
    resultados = []
    medias_tempo = {}
    pcts_dentro = {}
    
    # Métricas por categoria individual
    for cat_id in categorias_ativas:
        tempos_validos = []
        dentro_limiar_count = 0
        total_nos = len(nos_ids)
        
        for no_id in nos_ids:
            tempo = alcancabilidade.get(no_id, {}).get(cat_id)
            if tempo is not None:
                tempos_validos.append(tempo)
                if tempo <= limiar:
                    dentro_limiar_count += 1
                    
        tempo_medio = sum(tempos_validos) / len(tempos_validos) if tempos_validos else None
        pct_dentro = (float(dentro_limiar_count) / total_nos) * 100.0 if total_nos > 0 else 0.0
        
        medias_tempo[cat_id] = tempo_medio
        pcts_dentro[cat_id] = pct_dentro
        
        resultados.append({
            "cidade_id": cidade_id,
            "categoria_id": cat_id,
            "tempo_medio_min": tempo_medio,
            "pct_dentro_limiar": pct_dentro,
            "indice": pct_dentro
        })
        
    # Métricas gerais (categoria_id = 0)
    tempos_categorias = [t for t in medias_tempo.values() if t is not None]
    geral_tempo_medio = sum(tempos_categorias) / len(tempos_categorias) if tempos_categorias else None
    
    pcts = list(pcts_dentro.values())
    geral_pct_dentro = sum(pcts) / len(pcts) if pcts else 0.0
    
    indices_nos = []
    for no_id in nos_ids:
        cat_tempos = alcancabilidade.get(no_id, {})
        ind_no = indice_no(cat_tempos, limiar)
        indices_nos.append(ind_no)
        
    geral_indice = sum(indices_nos) / len(indices_nos) if indices_nos else 0.0
    
    resultados.append({
        "cidade_id": cidade_id,
        "categoria_id": 0,
        "tempo_medio_min": geral_tempo_medio,
        "pct_dentro_limiar": geral_pct_dentro,
        "indice": geral_indice
    })
    
    return resultados

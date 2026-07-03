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


import math

def diagnostico_moreno(alcancabilidade_por_no: dict, categorias_presentes: list, limiar: float, agregados: list) -> dict:
    """Implementa EXATAMENTE as definicoes da fase 09 (secao 9.1).
    alcancabilidade_por_no: {no: {categoria_id: (tempo_min|None, dono)}}
    categorias_presentes: ids de categorias com >= 1 servico na cidade
    Retorna dict com todas as chaves da tabela indice_moreno."""
    
    tempos_pior = {}
    for no_id, cat_dados in alcancabilidade_por_no.items():
        tempos_no = []
        for cat_id in categorias_presentes:
            val = cat_dados.get(cat_id)
            if val is not None:
                t = val[0] if isinstance(val, tuple) else val
                tempos_no.append(t)
            else:
                tempos_no.append(None)
        
        if any(t is None for t in tempos_no) or not tempos_no:
            tempos_pior[no_id] = None
        else:
            tempos_pior[no_id] = max(tempos_no)

    total_nos = len(alcancabilidade_por_no)
    valores_nao_nulos = sorted([t for t in tempos_pior.values() if t is not None])
    
    nos_plenos = sum(1 for t in tempos_pior.values() if t is not None and t <= limiar)
    pct_cobertura_plena = (float(nos_plenos) / total_nos * 100.0) if total_nos > 0 else 0.0
    
    if not valores_nao_nulos:
        minutos_cidade = None
    else:
        index_p90 = int(0.9 * (len(valores_nao_nulos) - 1))
        minutos_cidade = math.ceil(valores_nao_nulos[index_p90])
        
    tempo_pior_medio = (sum(valores_nao_nulos) / len(valores_nao_nulos)) if valores_nao_nulos else None
    
    if not valores_nao_nulos:
        tempo_pior_mediana = None
    else:
        index_mediana = int(0.5 * (len(valores_nao_nulos) - 1))
        tempo_pior_mediana = valores_nao_nulos[index_mediana]
        
    nos_sem_cobertura = sum(1 for t in tempos_pior.values() if t is None)
    pct_nos_sem_cobertura = (float(nos_sem_cobertura) / total_nos * 100.0) if total_nos > 0 else 0.0
    
    gargalo_id = None
    pct_gargalo = None
    if categorias_presentes and agregados:
        melhor_pct = 101.0
        for a in agregados:
            cat_id = a['categoria_id']
            if cat_id != 0 and cat_id in categorias_presentes:
                pct = float(a['pct_dentro_limiar'])
                if pct < melhor_pct:
                    melhor_pct = pct
                    gargalo_id = cat_id
                    pct_gargalo = pct
                    
    if minutos_cidade is None:
        atende_conceito = False
        classificacao = "Distante do conceito"
    else:
        atende_conceito = (minutos_cidade <= limiar)
        if minutos_cidade <= 15:
            classificacao = "Cidade de 15 Minutos"
        elif minutos_cidade <= 20:
            classificacao = "Muito proxima do conceito"
        elif minutos_cidade <= 30:
            classificacao = "Parcialmente aderente"
        else:
            classificacao = "Distante do conceito"
            
    hist = {
        "0-5": 0,
        "5-10": 0,
        "10-15": 0,
        "15-20": 0,
        "20-30": 0,
        "30+": 0,
        "sem_cobertura": 0
    }
    for t in tempos_pior.values():
        if t is None:
            hist["sem_cobertura"] += 1
        elif t <= 5:
            hist["0-5"] += 1
        elif t <= 10:
            hist["5-10"] += 1
        elif t <= 15:
            hist["10-15"] += 1
        elif t <= 20:
            hist["15-20"] += 1
        elif t <= 30:
            hist["20-30"] += 1
        else:
            hist["30+"] += 1
            
    distribuicao = [
        {"faixa": "0-5", "qtd": hist["0-5"]},
        {"faixa": "5-10", "qtd": hist["5-10"]},
        {"faixa": "10-15", "qtd": hist["10-15"]},
        {"faixa": "15-20", "qtd": hist["15-20"]},
        {"faixa": "20-30", "qtd": hist["20-30"]},
        {"faixa": "30+", "qtd": hist["30+"]},
        {"faixa": "sem_cobertura", "qtd": hist["sem_cobertura"]}
    ]
    
    return {
        "limiar_minutos": int(limiar),
        "pct_cobertura_plena": round(pct_cobertura_plena, 2),
        "minutos_cidade": minutos_cidade,
        "tempo_pior_medio": round(tempo_pior_medio, 2) if tempo_pior_medio is not None else None,
        "tempo_pior_mediana": round(tempo_pior_mediana, 2) if tempo_pior_mediana is not None else None,
        "pct_nos_sem_cobertura": round(pct_nos_sem_cobertura, 2),
        "atende_conceito": atende_conceito,
        "classificacao": classificacao,
        "categoria_gargalo_id": gargalo_id,
        "pct_gargalo": round(pct_gargalo, 2) if pct_gargalo is not None else None,
        "distribuicao": distribuicao
    }

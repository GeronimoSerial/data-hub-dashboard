def patch_nearest_nodes(monkeypatch, retorno):
    import osmnx as ox

    def fake_nearest_nodes(grafo, X, Y, return_dist=False):
        assert return_dist is True
        return retorno

    monkeypatch.setattr(ox.distance, "nearest_nodes", fake_nearest_nodes)

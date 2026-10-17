import importlib.util
import os
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('radar', os.path.join(os.path.dirname(__file__), 'configurar-radar-operacion.py'))
radar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(radar)


class OperacionRadarTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'RADAR_SOURCE_DATABASE_URL': 'postgres://lector/hub_prod'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.calls = []

    def api(self, path, method='GET', data=None):
        self.calls.append((path, method, data))
        nombre = 'staging' if radar.APPS['staging'] in path else 'dev'
        if path.endswith('/envs'):
            return [{'key': 'DATABASE_URL', 'value': 'postgres://host/hub_' + nombre}]
        if path.endswith('/scheduled-tasks') and method == 'GET':
            return [{'uuid': 'producer', 'command': 'node scripts/jobs.mjs sync-radar-ensemble'},
                    {'uuid': 'replica', 'name': 'replicar-radar-meteo'},
                    {'uuid': 'otro', 'command': 'node scripts/jobs.mjs sync-imerg'}]
        if path == '/deploy':
            return {'deployments': [{'deployment_uuid': 'deployment'}]}
        if path.startswith('/deployments/'):
            return {'status': 'finished'}
        return {}

    def test_configuracion_repetida_no_duplica_tareas_ni_modifica_prod(self):
        with patch.object(radar, 'api', side_effect=self.api):
            radar.operar('configurar')
            radar.operar('configurar')
        self.assertFalse(any(method == 'POST' and path.endswith('/scheduled-tasks') for path, method, _ in self.calls))
        self.assertFalse(any('pts681lz0kazhs1dph8wjaxt' in path for path, _, _ in self.calls))
        self.assertFalse(any('/otro' in path for path, _, _ in self.calls))
        for uuid in radar.APPS.values():
            patches = [data for path, method, data in self.calls if uuid in path and path.endswith('/replica')]
            self.assertEqual([p['enabled'] for p in patches], [False, True, False, True])

    def test_crea_replica_ausente_sin_duplicar_productores(self):
        creadas = set()
        def crear(path, method='GET', data=None):
            if path.endswith('/scheduled-tasks'):
                if method == 'POST':
                    creadas.add(path)
                    self.calls.append((path, method, data))
                    return {}
                if method == 'GET' and path not in creadas:
                    return []
            return self.api(path, method, data)
        with patch.object(radar, 'api', side_effect=crear):
            radar.operar('configurar')
        self.assertEqual(len(creadas), 2)

    def test_despliegue_fallido_no_habilita_replica(self):
        def falla(path, method='GET', data=None):
            if path.startswith('/deployments/'):
                return {'status': 'failed'}
            return self.api(path, method, data)
        with patch.object(radar, 'api', side_effect=falla):
            with self.assertRaises(RuntimeError):
                radar.operar('configurar')
        self.assertFalse(any(data == {'enabled': True} for _, _, data in self.calls))

    def test_valida_ambos_destinos_antes_de_escribir(self):
        def destino_incorrecto(path, method='GET', data=None):
            if radar.APPS['dev'] in path and path.endswith('/envs'):
                return [{'key': 'DATABASE_URL', 'value': 'postgres://host/hub_prod'}]
            return self.api(path, method, data)
        with patch.object(radar, 'api', side_effect=destino_incorrecto):
            with self.assertRaises(ValueError):
                radar.operar('configurar')
        self.assertTrue(all(method == 'GET' for _, method, _ in self.calls))


if __name__ == '__main__':
    unittest.main()

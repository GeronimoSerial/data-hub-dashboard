import importlib.util
import os
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('riesgo_om', os.path.join(os.path.dirname(__file__), 'configurar-riesgo-om-operacion.py'))
riesgo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(riesgo)


class OperacionRiesgoOmTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'RIESGO_SOURCE_DATABASE_URL': 'postgres://lector/hub_prod'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.calls = []

    def api(self, path, method='GET', data=None):
        self.calls.append((path, method, data))
        nombre = 'staging' if riesgo.APPS['staging'] in path else 'dev'
        if path.endswith('/envs'):
            return [{'key': 'DATABASE_URL', 'value': 'postgres://host/hub_' + nombre}]
        if path.endswith('/scheduled-tasks') and method == 'GET':
            return [{'uuid': 'producer', 'command': 'node scripts/jobs.mjs sync-ensemble'},
                    {'uuid': 'radar', 'command': 'node scripts/jobs.mjs sync-radar-ensemble'},
                    {'uuid': 'clima', 'command': 'node scripts/jobs.mjs climatologia-precipitacion'},
                    {'uuid': 'replica', 'name': 'replicar-riesgo-om'},
                    {'uuid': 'otro', 'command': 'node scripts/jobs.mjs sync-imerg'}]
        if path == '/deploy':
            return {'deployments': [{'deployment_uuid': 'deployment'}]}
        if path.startswith('/deployments/'):
            return {'status': 'finished'}
        return {}

    def test_configuracion_repetida_no_duplica_tareas_ni_modifica_prod(self):
        with patch.object(riesgo, 'api', side_effect=self.api):
            riesgo.operar('configurar')
            riesgo.operar('configurar')
        self.assertFalse(any(method == 'POST' and path.endswith('/scheduled-tasks') for path, method, _ in self.calls))
        self.assertFalse(any('pts681lz0kazhs1dph8wjaxt' in path for path, _, _ in self.calls))
        self.assertFalse(any('/otro' in path for path, _, _ in self.calls))
        for uuid in riesgo.APPS.values():
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
        with patch.object(riesgo, 'api', side_effect=crear):
            riesgo.operar('configurar')
        self.assertEqual(len(creadas), 2)

    def test_despliegue_fallido_no_habilita_replica(self):
        def falla(path, method='GET', data=None):
            if path.startswith('/deployments/'):
                return {'status': 'failed'}
            return self.api(path, method, data)
        with patch.object(riesgo, 'api', side_effect=falla):
            with self.assertRaises(RuntimeError):
                riesgo.operar('configurar')
        self.assertFalse(any(data == {'enabled': True} for _, _, data in self.calls))

    def test_valida_ambos_destinos_antes_de_escribir(self):
        def destino_incorrecto(path, method='GET', data=None):
            if riesgo.APPS['dev'] in path and path.endswith('/envs'):
                return [{'key': 'DATABASE_URL', 'value': 'postgres://host/hub_prod'}]
            return self.api(path, method, data)
        with patch.object(riesgo, 'api', side_effect=destino_incorrecto):
            with self.assertRaises(ValueError):
                riesgo.operar('configurar')
        self.assertTrue(all(method == 'GET' for _, method, _ in self.calls))

    def test_deshabilita_solo_productores_open_meteo_y_fija_rol_consumidor(self):
        with patch.object(riesgo, 'api', side_effect=self.api):
            riesgo.operar('configurar')
        apagadas = {path.rsplit('/', 1)[-1] for path, method, data in self.calls if data == {'enabled': False}}
        self.assertEqual(apagadas, {'producer', 'clima'})
        envs = [data for path, method, data in self.calls if path.endswith('/envs/bulk')]
        self.assertEqual(len(envs), 2)
        for data in envs:
            valores = {e['key']: e['value'] for e in data['data']}
            self.assertEqual(valores['RIESGO_DATOS_ROL'], 'consumidor')
            self.assertEqual(valores['RIESGO_SOURCE_DATABASE_URL'], 'postgres://lector/hub_prod')

    def test_rechaza_origen_que_no_es_produccion(self):
        with patch.dict(os.environ, {'RIESGO_SOURCE_DATABASE_URL': 'postgres://lector/hub_staging'}):
            with patch.object(riesgo, 'api', side_effect=self.api):
                with self.assertRaises(ValueError):
                    riesgo.operar('configurar')
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()

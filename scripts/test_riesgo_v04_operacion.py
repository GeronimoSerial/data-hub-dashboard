import copy
import importlib.util
import os
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('riesgo_v04', os.path.join(os.path.dirname(__file__), 'configurar-riesgo-v04-operacion.py'))
riesgo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(riesgo)

APP = 'app-prod'
INICIALES = [
    {'uuid': 'radar', 'command': 'node scripts/jobs.mjs sync-radar-meteo', 'frequency': '0 */6 * * *', 'enabled': True},
    {'uuid': 'radar-ens', 'command': 'node scripts/jobs.mjs sync-radar-ensemble', 'frequency': '0 */6 * * *', 'enabled': True},
    {'uuid': 'clima-q', 'command': 'node scripts/jobs.mjs climatologia-caudal', 'frequency': '0 5 * * *', 'enabled': True},
    {'uuid': 'clima-p', 'command': 'node scripts/jobs.mjs climatologia-precipitacion', 'frequency': '0 5 * * *', 'enabled': True},
    {'uuid': 'riesgo', 'command': 'node scripts/jobs.mjs calcular-riesgo', 'frequency': '15 2,8,14,20 * * *', 'enabled': True},
]


class CoolifyFake:
    """Simula el API de Coolify con estado: POST crea, PATCH modifica."""

    def __init__(self, base='hub_prod'):
        self.tareas = copy.deepcopy(INICIALES)
        self.base = base
        self.escrituras = []

    def __call__(self, path, method='GET', data=None):
        if path.endswith('/envs'):
            return [{'key': 'DATABASE_URL', 'value': 'postgres://host/' + self.base}]
        if path.endswith('/scheduled-tasks') and method == 'GET':
            return copy.deepcopy(self.tareas)
        if method == 'GET' and path.endswith('/executions'):
            return []
        self.escrituras.append((path, method, data))
        if method == 'POST':
            self.tareas.append({'uuid': 'nueva-' + data['name'], **data})
        elif method == 'PATCH':
            uuid = path.rsplit('/', 1)[-1]
            next(t for t in self.tareas if t['uuid'] == uuid).update(data)
        return {}


class OperacionRiesgoV04Test(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'COOLIFY_PROD_APP_UUID': APP})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_inspeccionar_no_escribe(self):
        fake = CoolifyFake()
        with patch.object(riesgo, 'api', side_effect=fake):
            riesgo.operar('inspeccionar')
        self.assertEqual(fake.escrituras, [])

    def test_configurar_aplica_el_diff_y_es_idempotente(self):
        fake = CoolifyFake()
        with patch.object(riesgo, 'api', side_effect=fake):
            riesgo.operar('configurar')
            primeras = list(fake.escrituras)
            riesgo.operar('configurar')
        self.assertEqual(fake.escrituras, primeras)
        por_job = {riesgo.job_de(t): t for t in fake.tareas}
        self.assertEqual(por_job['sync-ina-serie-diaria']['frequency'], '10 6 * * *')
        self.assertTrue(por_job['sync-ina-serie-diaria']['enabled'])
        self.assertEqual(por_job['sync-ina-pronostico']['frequency'], '50 1,7,13,19 * * *')
        self.assertEqual(por_job['sync-radar-meteo']['frequency'], '27 3,9,15,21 * * *')
        self.assertFalse(por_job['climatologia-caudal']['enabled'])
        self.assertFalse(por_job['climatologia-precipitacion']['enabled'])
        # Lo no listado no se toca.
        self.assertEqual(por_job['sync-radar-ensemble'], INICIALES[1])
        self.assertEqual(por_job['calcular-riesgo'], INICIALES[4])
        self.assertFalse(any('radar-ens' in p or p.endswith('/riesgo') for p, _, _ in fake.escrituras))
        self.assertEqual(sum(1 for _, m, _ in fake.escrituras if m == 'POST'), 2)

    def test_rechaza_un_destino_que_no_es_produccion(self):
        fake = CoolifyFake(base='hub_staging')
        with patch.object(riesgo, 'api', side_effect=fake):
            with self.assertRaises(ValueError):
                riesgo.operar('configurar')
        self.assertEqual(fake.escrituras, [])

    def test_operacion_desconocida_o_sin_app(self):
        with self.assertRaises(ValueError):
            riesgo.operar('ejecutar')
        with patch.dict(os.environ, {'COOLIFY_PROD_APP_UUID': ''}):
            with self.assertRaises(ValueError):
                riesgo.operar('inspeccionar')


if __name__ == '__main__':
    unittest.main()

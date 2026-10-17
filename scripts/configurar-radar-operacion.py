#!/usr/bin/env python3
"""Configura consumidores de radar en Coolify; sólo se ejecuta manualmente."""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

APPS = {'staging': 'j3zm0co4bi9iy0c70nv3vinf', 'dev': 'grg5ycm7js8dk9lkzkktt7l7'}
PRODUCTORES = ['sync-radar-meteo', 'verificar-radar-meteo', 'sync-radar-ensemble']
BASE = 'https://coolify.sistemas.mec.gob.ar/api/v1'


def api(path, method='GET', data=None):
    req = urllib.request.Request(BASE + path, method=method,
        headers={'Authorization': 'Bearer ' + os.environ['COOLIFY_TOKEN'], 'Content-Type': 'application/json'},
        data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def tasks(uuid):
    response = api('/applications/' + uuid + '/scheduled-tasks')
    return response if isinstance(response, list) else response.get('data', [])


def operar(op):
    source = os.environ.get('RADAR_SOURCE_DATABASE_URL', '')
    if op in ['configurar', 'validar']:
        url = urllib.parse.urlparse(source)
        if url.scheme not in ['postgres', 'postgresql'] or url.path != '/hub_prod':
            raise ValueError('RADAR_SOURCE_DATABASE_URL debe apuntar a hub_prod')
    # Validar los dos destinos antes de modificar cualquiera.
    for nombre, uuid in APPS.items():
        envs = api('/applications/' + uuid + '/envs')
        db = next(e for e in envs if e.get('key') == 'DATABASE_URL' and not e.get('is_preview'))
        if urllib.parse.urlparse(db.get('value', '')).path != '/hub_' + nombre:
            raise ValueError('Destino incorrecto: ' + nombre)
    if op == 'validar':
        return
    for nombre, uuid in APPS.items():
        prefix = '/applications/' + uuid
        existentes = tasks(uuid)
        if op == 'inspeccionar':
            print(nombre, json.dumps([{k: t.get(k) for k in ['uuid', 'name', 'command', 'frequency', 'enabled']}
                for t in existentes if 'radar' in t.get('command', '')]))
        elif op == 'configurar':
            for task in existentes:
                if any(job in task.get('command', '') for job in PRODUCTORES):
                    api(prefix + '/scheduled-tasks/' + task['uuid'], 'PATCH', {'enabled': False})
            api(prefix + '/envs/bulk', 'PATCH', {'data': [
                {'key': key, 'value': value, 'is_runtime': True, 'is_buildtime': False,
                 'is_preview': False, 'is_literal': True}
                for key, value in [('RADAR_SYNC_ENABLED', 'false'), ('RADAR_SOURCE_DATABASE_URL', source)]]})
            datos = {'name': 'replicar-radar-meteo', 'command': 'node scripts/replicar-radar-meteo.mjs',
                     'frequency': '*/15 * * * *', 'timeout': 300, 'enabled': False}
            replica = next((t for t in existentes if t.get('name') == datos['name']), None)
            if replica:
                api(prefix + '/scheduled-tasks/' + replica['uuid'], 'PATCH', datos)
            else:
                api(prefix + '/scheduled-tasks', 'POST', datos)
            # El despliegue carga las nuevas variables en el contenedor; no alcanza con guardarlas.
            response = api('/deploy', 'POST', {'uuid': uuid, 'force': True})
            deployment = response['deployments'][0]['deployment_uuid']
            for _ in range(90):
                status = api('/deployments/' + deployment).get('status')
                if status == 'finished':
                    break
                if status in ['failed', 'cancelled-by-user']:
                    raise RuntimeError('No se completó el despliegue de ' + nombre)
                time.sleep(10)
            else:
                raise RuntimeError('Timeout del despliegue de ' + nombre)
            replica = next(t for t in tasks(uuid) if t.get('name') == 'replicar-radar-meteo')
            api(prefix + '/scheduled-tasks/' + replica['uuid'], 'PATCH', {'enabled': True})
            print(nombre, 'configurado y desplegado; réplica cada 15 minutos')
        elif op in ['ejecutar', 'estado']:
            replica = next(t for t in existentes if t.get('name') == 'replicar-radar-meteo')
            path = prefix + '/scheduled-tasks/' + replica['uuid']
            if op == 'ejecutar':
                api(path + '/execute', 'POST')
                print(nombre, 'réplica solicitada')
            else:
                response = api(path + '/executions')
                rows = response if isinstance(response, list) else response.get('data', [])
                print(nombre, json.dumps([{k: r.get(k) for k in ['uuid', 'status', 'started_at', 'finished_at']} for r in rows[:5]]))
        else:
            raise ValueError('Operación desconocida')


if __name__ == '__main__':
    try:
        operar(sys.argv[1])
    except Exception:
        sys.exit('Falló la operación radar; revisar destinos, permisos y configuración (credenciales omitidas)')

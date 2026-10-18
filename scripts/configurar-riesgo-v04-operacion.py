#!/usr/bin/env python3
"""Ajusta las Scheduled Tasks de PRODUCCIÓN para Motor v0.4 operativo (T11).

Sólo se ejecuta manualmente (workflow riesgo-v04-operacion.yml). Operaciones:
  inspeccionar  (por defecto) sólo lectura: imprime el diff a aplicar.
  configurar    aplica el diff; repetirlo no cambia nada (idempotente).
  estado        imprime las tareas involucradas y las últimas ejecuciones INA.
Ver docs/motor-v0.4/promocion.md y docs/ejecucion-enos/OPS1/runbook-scheduler.md.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

BASE = 'https://coolify.sistemas.mec.gob.ar/api/v1'
CAMPOS = ['uuid', 'name', 'command', 'frequency', 'timeout', 'enabled']

# Estado deseado por job de scripts/jobs.mjs. `crear` = datos completos si la
# tarea no existe; el resto de las claves se comparan y se corrigen con PATCH.
# Todo job no listado acá queda como está.
def comando(job):
    # Mismo formato que el resto de las tareas de producción en Coolify.
    return 'sh -c "cd /app && node scripts/jobs.mjs ' + job + '"'


DESEADO = {
    'sync-ina-serie-diaria': {'frequency': '10 6 * * *', 'enabled': True, 'command': comando('sync-ina-serie-diaria'),
                              'crear': {'timeout': 1800}},
    # Antes de calcular-riesgo (`15 2,8,14,20 * * *`).
    'sync-ina-pronostico': {'frequency': '50 1,7,13,19 * * *', 'enabled': True, 'command': comando('sync-ina-pronostico'),
                            'crear': {'timeout': 600}},
    'sync-radar-meteo': {'frequency': '27 3,9,15,21 * * *'},
    'climatologia-caudal': {'enabled': False},
    'climatologia-precipitacion': {'enabled': False},
}


def api(path, method='GET', data=None):
    req = urllib.request.Request(BASE + path, method=method,
        headers={'Authorization': 'Bearer ' + os.environ['COOLIFY_TOKEN'], 'Content-Type': 'application/json'},
        data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def app_uuid():
    uuid = os.environ.get('COOLIFY_PROD_APP_UUID', '').strip()
    if not uuid:
        raise ValueError('COOLIFY_PROD_APP_UUID vacío')
    return uuid


def tasks(uuid):
    response = api('/applications/' + uuid + '/scheduled-tasks')
    return response if isinstance(response, list) else response.get('data', [])


def job_de(task):
    # Coincidencia exacta del job: 'sync-radar-meteo' no debe tocar otro job.
    # Acepta variantes del comando de Coolify ('node scripts/jobs.mjs x',
    # 'node /app/scripts/jobs.mjs x', 'sh -c "... jobs.mjs x"'): toma el token
    # siguiente a jobs.mjs, sin comillas.
    partes = (task.get('command') or '').replace('"', ' ').replace("'", ' ').split()
    for i, parte in enumerate(partes[:-1]):
        if parte.endswith('jobs.mjs'):
            return partes[i + 1]
    return None


def validar_destino(uuid):
    envs = api('/applications/' + uuid + '/envs')
    db = next((e for e in envs if e.get('key') == 'DATABASE_URL' and not e.get('is_preview')), None)
    if db is None or urllib.parse.urlparse(db.get('value', '')).path != '/hub_prod':
        raise ValueError('El destino no es producción (hub_prod)')


def planificar(existentes):
    """Lista de cambios: ('crear', None, datos) o ('modificar', uuid, {campo: valor})."""
    plan = []
    for job, deseado in DESEADO.items():
        actuales = [t for t in existentes if job_de(t) == job]
        campos = {k: v for k, v in deseado.items() if k != 'crear'}
        if not actuales:
            if 'crear' in deseado:
                datos = {'name': job, 'command': comando(job), **campos, **deseado['crear']}
                plan.append(('crear', None, datos))
            continue
        for task in actuales:
            diff = {k: v for k, v in campos.items() if task.get(k) != v}
            if diff:
                plan.append(('modificar', task['uuid'], diff))
    return plan


def imprimir_plan(plan, existentes):
    por_uuid = {t.get('uuid'): t for t in existentes}
    if not plan:
        print('sin cambios: producción ya coincide con el estado deseado')
    for accion, uuid, datos in plan:
        if accion == 'crear':
            print('CREAR', json.dumps(datos, ensure_ascii=False))
        else:
            antes = {k: por_uuid[uuid].get(k) for k in datos}
            print('MODIFICAR', uuid, job_de(por_uuid[uuid]), json.dumps(antes), '->', json.dumps(datos))


def operar(op):
    if op not in ['inspeccionar', 'configurar', 'estado', 'listar', 'ejecutar-riesgo', 'estado-riesgo']:
        raise ValueError('Operación desconocida')
    uuid = app_uuid()
    validar_destino(uuid)
    prefix = '/applications/' + uuid
    existentes = tasks(uuid)
    if op in ['ejecutar-riesgo', 'estado-riesgo']:
        # Dispara (o consulta) la tarea programada calcular-riesgo dentro del
        # contenedor de producción; su lease por bloque de 6 h evita duplicar.
        task = next(t for t in existentes if job_de(t) == 'calcular-riesgo')
        if op == 'ejecutar-riesgo':
            api(prefix + '/scheduled-tasks/' + task['uuid'] + '/execute', 'POST')
            print('calcular-riesgo solicitado')
        response = api(prefix + '/scheduled-tasks/' + task['uuid'] + '/executions')
        rows = response if isinstance(response, list) else response.get('data', [])
        print('calcular-riesgo', json.dumps([{k: r.get(k) for k in ['uuid', 'status', 'started_at', 'finished_at']} for r in rows[:3]]))
        return
    if op == 'listar':
        # Sólo lectura: todas las tareas programadas de producción.
        for t in existentes:
            print(json.dumps({k: t.get(k) for k in CAMPOS}, ensure_ascii=False))
        return
    if op == 'estado':
        print(json.dumps([{k: t.get(k) for k in CAMPOS} for t in existentes if job_de(t) in DESEADO], ensure_ascii=False))
        for task in existentes:
            if job_de(task) in ['sync-ina-serie-diaria', 'sync-ina-pronostico']:
                response = api(prefix + '/scheduled-tasks/' + task['uuid'] + '/executions')
                rows = response if isinstance(response, list) else response.get('data', [])
                print(job_de(task), json.dumps([{k: r.get(k) for k in ['uuid', 'status', 'started_at', 'finished_at']} for r in rows[:5]]))
        return
    plan = planificar(existentes)
    imprimir_plan(plan, existentes)
    if op == 'inspeccionar':
        return
    for accion, task_uuid, datos in plan:
        if accion == 'crear':
            api(prefix + '/scheduled-tasks', 'POST', datos)
        else:
            api(prefix + '/scheduled-tasks/' + task_uuid, 'PATCH', datos)
    pendiente = planificar(tasks(uuid))
    if pendiente:
        raise RuntimeError('Quedaron cambios sin aplicar')
    print('configurado: Scheduled Tasks de producción alineadas con Motor v0.4')


if __name__ == '__main__':
    try:
        operar(sys.argv[1] if len(sys.argv) > 1 else 'inspeccionar')
    except Exception:
        sys.exit('Falló la operación riesgo v0.4; revisar destino, permisos y configuración (credenciales omitidas)')

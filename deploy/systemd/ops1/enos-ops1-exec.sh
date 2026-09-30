#!/bin/sh
# Ejecuta un job OPS1 dentro del único contenedor activo con el prefijo de Coolify.
set -eu

job=${1-}
case "$job" in
  ''|*[!a-z0-9-]*)
    echo "Nombre de job inválido: ${job}" >&2
    exit 1
    ;;
esac

: "${CONTENEDOR_PREFIJO:?Falta CONTENEDOR_PREFIJO en el entorno}"

contenedores=$(docker ps \
  --filter "name=^${CONTENEDOR_PREFIJO}" \
  --filter status=running \
  --format '{{.Names}}')

# La salida no vacía contiene exactamente un nombre por línea.
if [ -z "$contenedores" ]; then
  echo "No hay contenedor activo con prefijo: ${CONTENEDOR_PREFIJO}" >&2
  exit 1
fi

# Rechaza tanto múltiples nombres como nombres inesperadamente multilínea.
contenedor=$(printf '%s\n' "$contenedores" | awk 'NF { count++; name=$0 } END { if (count == 1) print name; else exit 1 }') || {
  echo "Se esperaba exactamente un contenedor activo con prefijo: ${CONTENEDOR_PREFIJO}" >&2
  exit 1
}

exec docker exec -e ENOS_JOBS_ENABLED "$contenedor" node scripts/jobs.mjs "$job"

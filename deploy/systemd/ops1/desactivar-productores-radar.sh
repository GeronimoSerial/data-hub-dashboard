#!/bin/sh
# Ejecutar en el host del consumidor. No elimina la plantilla ni otros timers OPS1.
set -eu
uuid=${1:?Falta UUID del consumidor}
case "$uuid" in
  j3zm0co4bi9iy0c70nv3vinf|grg5ycm7js8dk9lkzkktt7l7) ;;
  *) echo 'Sólo staging/dev' >&2; exit 1 ;;
esac
instalados=false
for job in sync-radar-meteo verificar-radar-meteo sync-radar-ensemble; do
  if systemctl cat "enos-ops1-$job.timer" >/dev/null 2>&1; then instalados=true; fi
done
[ "$instalados" = true ] || exit 0
if [ -f /etc/enos-ops1/enos-ops1.env ]; then
  prefijo=$(sed -n 's/^CONTENEDOR_PREFIJO=//p' /etc/enos-ops1/enos-ops1.env | tr -d '\042\047')
  [ "$prefijo" = "$uuid" ] || { echo 'Los timers OPS1 pertenecen a otro entorno' >&2; exit 1; }
else
  # Sin el archivo de entorno no se puede atribuir un timer instalado a este consumidor.
  for job in sync-radar-meteo verificar-radar-meteo sync-radar-ensemble; do
    if systemctl cat "enos-ops1-$job.timer" >/dev/null 2>&1; then
      echo 'Timer presente sin entorno verificable; revisar manualmente' >&2; exit 1
    fi
  done
  exit 0
fi
for job in sync-radar-meteo verificar-radar-meteo sync-radar-ensemble; do
  timer="enos-ops1-$job.timer"
  if systemctl cat "$timer" >/dev/null 2>&1; then
    systemctl disable --now "$timer"
    systemctl stop "enos-ops1@$job.service"
    rm -f "/etc/systemd/system/$timer"
  fi
done
systemctl daemon-reload

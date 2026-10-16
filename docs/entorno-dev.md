# Entorno dev

Dev usa `https://dev.analisis.sistemas.mec.gob.ar`, la aplicación Coolify
`data-hub-dashboard-dev` y PostgreSQL `hub_dev`. La rama `dev` publica la imagen
`:dev` y despliega exclusivamente esa aplicación. Staging y producción conservan
sus ramas y destinos separados.

Se creó como copia de staging: usuarios y cuentas con sus contraseñas cifradas,
reportes, padrón, referencias del mapa y versiones históricas. Las sesiones,
verificaciones temporales y tokens OAuth no se transfieren. Las funciones
administrativas internas de Huawei RDS se excluyen del restore; las funciones
y triggers de la aplicación se conservan.

El rol `hub_dev` es dueño únicamente de su base y no tiene permisos de lectura
de usuarios ni de escritura de reportes en staging o producción. Los secretos de
sesión y SSO son propios. Se conserva la clave de cifrado nominal de staging
para poder leer las identidades copiadas. Los adjuntos se copian a un bucket de
dev, sin usar el de producción como almacenamiento de pruebas.

`ENOS_JOBS_ENABLED=false`: dev es un snapshot reproducible y no duplica consultas
a proveedores ni consume las entregas de staging. Las pruebas y modificaciones
realizadas en dev no se replican hacia otros entornos. Para actualizar sólo las
referencias y sus versiones, configurar `SOURCE_DATABASE_URL` de staging y
`TARGET_DATABASE_URL` de dev fuera del repositorio y ejecutar
`pnpm datasets:replicar`. No sobrescribir reportes o usuarios de dev para actualizar
capas del mapa.

El `.env` local apunta a esta base mediante `DATABASE_URL` y
`DATABASE_SSL=require`; permanece ignorado por Git. La conexión de despliegue
se administra mediante `DEV_DATABASE_URL` en GitHub y `DATABASE_URL` en Coolify.
La acción manual `Operar entorno dev` permite inspeccionar, configurar y
desplegar la aplicación sin modificar los destinos de staging o producción.

El respaldo inicial de staging se conserva privado en
`~/.local/state/data-hub-dashboard/dev/`. Para reconstruir dev posteriormente,
respaldar antes sus cambios y detener la app; la creación inicial no es una
autorización para borrar datos nuevos en futuras reconstrucciones.

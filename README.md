# Trivia del Día de la Reforma

Aplicación web de trivia en español para partidas presenciales con participantes conectados desde celulares o computadores. El servidor Flask entrega las páginas y valida cada operación; Flask-SocketIO transmite cambios de partida en tiempo real; SQLite conserva partidas, preguntas, participantes y respuestas.

## Requisitos

- Python 3.10 o posterior.
- Navegador moderno y conexión de red entre participantes y servidor.
- Para producción: Gunicorn detrás de HTTPS. La aplicación usa el modo `threading` de Socket.IO y `simple-websocket`.

## Instalación local

```bash
cd trivia
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Edita `.env`: define un `SECRET_KEY` aleatorio largo, un usuario y una contraseña de administrador segura. En una terminal Bash, carga los valores antes de iniciar:

```bash
set -a
source .env
set +a
export SESSION_COOKIE_SECURE=0
python run.py
```

La base SQLite y las tablas se crean automáticamente al iniciar por primera vez en `instance/trivia.sqlite3`. El primer juego aparece como **Trivia Día de la Reforma**. No hay claves predeterminadas habilitadas: el acceso administrativo queda desactivado hasta configurar `ADMIN_PASSWORD`.

Abre:

- Participantes: `http://127.0.0.1:5000/`
- Administración: `http://127.0.0.1:5000/admin`
- Proyección (después de iniciar sesión en administración): `http://127.0.0.1:5000/admin/proyeccion`

## Primera partida

1. Inicia sesión en `/admin` con las credenciales de `.env`.
2. Define si la ronda tendrá 10, 15 o 20 preguntas. No hace falta elegirlas: al comenzar se sortean del banco completo.
3. Pulsa **Comenzar partida**. Esto sortea y prepara la ronda, pero aún no muestra la pregunta.
4. Comparte la URL pública. Los participantes ingresan con su apodo; la página los lleva directamente a la única partida activa.
5. Pulsa **Iniciar pregunta** cuando quieras mostrarla. Cada participante selecciona una alternativa y confirma una vez.
6. Pulsa **Cerrar pregunta** para bloquear respuestas. Si hay personas pendientes, el panel pide confirmar. Tras el cierre se revela la alternativa correcta y la explicación.
7. Si los puntajes más altos empatan al finalizar la ronda, se agrega automáticamente una pregunta de desempate. Iníciala desde el panel; se seguirán agregando preguntas mientras persista el empate.
8. Si quieres, activa **Mostrar clasificación en la proyección después de cada pregunta**. Pulsa **Finalizar partida** para mostrar los tres puntajes más altos y el podio animado a todos los participantes.

La puntuación es un punto por respuesta correcta confirmada y cero por respuesta incorrecta o ausente. El cierre y la confirmación de respuesta se serializan con una transacción SQLite (`BEGIN IMMEDIATE`), que determina qué operación se acepta primero.

## Administrar el banco

El banco inicial trae 53 preguntas organizadas por categoría y dificultad, con explicación y referencia. Desde `/admin` puedes crear, editar o eliminar preguntas aún no utilizadas. Para ajustar el contenido local, prioriza las fuentes incluidas y revisa las formulaciones teológicas según la tradición de la congregación. Las preguntas incluidas sobre historia chilena enlazan a registros de la Biblioteca del Congreso Nacional, Biblioteca Metodista Chile y estudios académicos; el detalle histórico puede variar según denominación, por lo que el administrador puede editar el banco antes de usarlo.

El sorteo copia preguntas a la partida. Una vez utilizada una pregunta, el sistema conserva su copia y bloquea la edición de la pregunta original para mantener intactos los resultados históricos. Crear otra partida cierra cualquier partida que siga abierta; así solo queda una partida activa.

## Pruebas

```bash
source .venv/bin/activate
python -m unittest discover -s tests -v
```

Las pruebas cubren registro y nombres duplicados, aislamiento de rutas administrativas, token CSRF, visibilidad y cierre de preguntas, respuestas únicas, puntajes, reconexión, persistencia, sorteo y tamaño de ronda, desempates, podio público, Socket.IO y al menos 50 preguntas semilla.

## Despliegue con Gunicorn

Configura las variables de entorno en el gestor de procesos; no guardes `.env` en el repositorio. `SESSION_COOKIE_SECURE` está activado por defecto y debe mantenerse así en producción, por lo que el sitio debe servirse sobre HTTPS. En local se desactiva solo para permitir cookies sobre HTTP.

Comando de referencia para un servidor de un solo nodo:

```bash
gunicorn --worker-class gthread --workers 1 --threads 100 --bind 127.0.0.1:8000 run:app
```

Mantén un worker para este despliegue SQLite de un solo proceso. El proceso `run:app` exporta la aplicación Flask y `run.py` inicializa Flask-SocketIO con transporte compatible con WebSocket. Configura un proxy para preservar `Upgrade` y `Connection` en WebSocket y usar HTTPS. Ejemplo en [`deploy/nginx.conf`](deploy/nginx.conf).

La base de datos se guarda en disco local y debe incluirse en respaldos. No uses una carpeta temporal o efímera para `DATABASE_PATH`. Para escalar a varios workers o servidores, hará falta incorporar un backend compartido de Socket.IO y evaluar una base de datos cliente-servidor; esta primera versión está deliberadamente diseñada para una instancia.

## Seguridad y operación

- Las contraseñas de administración y el secreto Flask vienen de variables de entorno.
- Los tokens de participante son aleatorios; SQLite guarda su hash, no el token.
- Las escrituras validan CSRF, identidad, pertenencia a partida y estado actual en el servidor.
- Los nombres se comparan tras normalización Unicode y sin distinguir mayúsculas.
- Para conexiones remotas, configura firewall, HTTPS, límites de solicitudes en el proxy y una contraseña administrativa robusta.
- La base se inicializa automáticamente. Haz una copia antes de actualizaciones o cambios manuales.

## Fuentes temáticas consultadas

- [HISTORY: Martin Luther and the 95 Theses](https://www.history.com/articles/martin-luther-and-the-95-theses): fecha tradicional y matiz histórico sobre el relato de la puerta de Wittenberg.
- [Ley de 27 de julio de 1865, Biblioteca del Congreso Nacional](https://www.bcn.cl/leychile/Navegar?idNorma=131712&idVersion=1865-07-27): texto legal sobre culto no católico en recintos particulares.
- [Biblioteca Metodista Chile: historia de la Iglesia Metodista de Valparaíso](https://bibliotecametodista.cl/iglesias/norte-verde/valparaiso/).
- [Estudio sobre revistas pentecostales en Chile, SciELO](https://www.scielo.cl/scielo.php?pid=S0718-47272024000100213&script=sci_arttext).
- Las referencias bíblicas se citan por libro y versículo; el panel permite adaptarlas a la versión bíblica que use la congregación.

## Estructura

```text
app/
  db.py                 esquema SQLite e inicialización
  routes.py             páginas y API HTTP
  sockets.py            conexión, presencia y salas en tiempo real
  seed.py               banco inicial temático
  templates/            participante, administración y proyección
  static/               JavaScript y estilos responsivos
tests/                   pruebas automatizadas
deploy/nginx.conf        ejemplo de proxy WebSocket
config.py                configuración por variables de entorno
run.py                   punto de entrada Flask y Socket.IO
```

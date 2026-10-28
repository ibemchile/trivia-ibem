# Trivia del Día de la Reforma

Aplicación web de trivia interactiva para partidas presenciales o comunitarias con participantes conectados desde sus teléfonos móviles o computadores. Desarrollada para ejecutarse de forma nativa y sin servidores en **Cloudflare Pages** y **Cloudflare D1** (SQLite serverless).

---

## 🚀 Arquitectura

- **Frontend:** HTML5, CSS moderno y JavaScript nativo servido como assets estáticos por Cloudflare Pages (en `public/`).
- **Backend:** Cloudflare Pages Functions (en `functions/api/`) para toda la lógica de negocio, autenticación, control de estados y respuestas.
- **Base de datos:** Cloudflare D1 (SQLite nativo distribuido en el edge) para persistencia de partidas, banco de preguntas, participantes y puntuaciones.

---

## 🛠️ Ejecución y Desarrollo Local

### Requisitos previos

- **Node.js** (v18 o superior) y `npm`.

### 1. Variables de entorno local

Crea o revisa el archivo `.dev.vars` en la raíz del proyecto (este archivo está ignorado en Git):

```ini
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
SESSION_SECRET=una-clave-secreta-larga-para-desarrollo
```

### 2. Inicializar la base de datos local (D1)

Ejecuta el script SQL con el esquema y el banco inicial de preguntas:

```bash
npx wrangler d1 execute trivia-db --local --file=schema.sql
npx wrangler d1 migrations apply trivia-db --local
```

### 3. Iniciar el servidor de desarrollo

Para escuchar en localhost y en tu red local (útil para probar con teléfonos en la misma WiFi):

```bash
npx wrangler pages dev public --d1=DB=trivia-db --ip 0.0.0.0 --port 8788
```

Rutas locales:
- **Participantes:** `http://localhost:8788/` (o con tu IP local: `http://TU_IP:8788/`)
- **Administración:** `http://localhost:8788/admin/`
- **Proyección:** `http://localhost:8788/admin/proyeccion/`

*(Credenciales de prueba local: Usuario `admin`, Contraseña `admin123`)*.

### Pruebas de desempates

Ejecuta las pruebas de reglas con Node.js 18 o superior:

```bash
node tests/tiebreak.test.mjs
```

---

## ☁️ Despliegue en Cloudflare Pages

### Paso 1: Crear la Base de Datos D1
1. En el panel de Cloudflare, ve a **Storage & databases** > **D1 SQL Database** > **Create database**.
2. Nómbrala `trivia-db`.
3. Inicializa la base con [`schema.sql`](schema.sql), luego aplica las migraciones.
   *(Terminal: `npx wrangler d1 execute trivia-db --remote --file=schema.sql` seguido de `npx wrangler d1 migrations apply trivia-db --remote`)*.

### Paso 2: Crear el Proyecto en Pages
1. Ve a **Workers & Pages** > **Create application** > pestaña **Pages** > **Connect to Git**.
2. Selecciona tu repositorio de GitHub.
3. Configuración de Build:
   - **Framework preset:** `None`
   - **Build command:** *(dejar vacío)*
   - **Build output directory:** `public`
4. Pulsa **Save and Deploy**.

### Migración de una base D1 existente

Aplica la migración antes de desplegar el código actualizado:

```bash
npx wrangler d1 migrations apply trivia-db --remote
```

Para el entorno local usa `--local`. En una base nueva ejecuta primero `schema.sql` y luego aplica la migración como se indica arriba.

### Paso 3: Configurar Bindings y Variables
En el panel del proyecto en Cloudflare Pages:
1. **Settings** > **Bindings**:
   - Pulsa **Add binding** > **D1 database binding**.
   - **Variable name:** `DB` *(exactamente en mayúsculas)*.
   - **D1 database:** Selecciona `trivia-db`.
2. **Settings** > **Environment variables**:
   - `ADMIN_USERNAME`: tu usuario administrador (ej. `admin`).
   - `ADMIN_PASSWORD`: contraseña del administrador (marca la opción *Encrypt* / Secreto).
   - `SESSION_SECRET`: cadena aleatoria larga para firmar las sesiones.
3. En la pestaña **Deployments**, haz clic en **Retry deployment** del último despliegue para aplicar los bindings.

---

## 🎮 Flujo de Partida

1. **Acceso:** El administrador ingresa a `/admin/` con sus credenciales.
2. **Configuración:** Define si la ronda tendrá 10, 15 o 20 preguntas (se sortean aleatoriamente del banco al comenzar).
3. **Inicio:** Pulsa **Comenzar partida**. Los participantes se unen ingresando un apodo en la página principal (`/`).
4. **Preguntas:**
   - Pulsa **Iniciar pregunta** para abrirla a los jugadores.
   - Los participantes eligen una alternativa y confirman.
   - Pulsa **Cerrar pregunta** para bloquear respuestas y revelar la correcta con su explicación bíblica/histórica.
5. **Desempate automático:** Las preguntas se asignan al grupo que disputa una posición del podio. Aciertos y fallos separan ese grupo en subgrupos para puestos superiores e inferiores; una ronda unánime mantiene el empate. Las ausencias no eliminan participantes y las respuestas de desempate no suman puntos normales.
6. **Finalización y Podio:** Al pulsar **Finalizar partida**, la pantalla de participantes y la proyección muestran el podio animado con los ganadores.

---

## 📚 Banco de Preguntas

Incluye más de 50 preguntas temáticas sobre:
- Historia de la Reforma (Lutero, Calvino, Zuinglio, 95 tesis, Dieta de Worms).
- Principios teológicos (Las 5 Solas).
- Conocimiento bíblico general.
- Historia del cristianismo y su desarrollo histórico en Chile.

Desde `/admin/` se pueden crear nuevas preguntas o editar las existentes que aún no hayan sido utilizadas.

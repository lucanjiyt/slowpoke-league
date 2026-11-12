# Slowpoke League

App web para la liga: draft de Pokémon, rondas todos contra todos y cartas entre combates.
Hecha con HTML, CSS y JavaScript. El servidor es un único archivo de Node.js sin librerías externas.

## Qué hay en la carpeta

```
server.js              Servidor: guarda la partida y avisa a todos en tiempo real
public/index.html      Página
public/styles.css      Estilos
public/app.js          Interfaz (participantes, organización y vista stream)
public/logic.js        Reglas del juego y catálogo de cartas
public/fonts/          Fuentes pixeladas (Press Start 2P y VT323, licencia OFL)
data/banco_pokemon.json  Banco de Pokémon de ejemplo (78 sets)
data/pokedex.json      Tabla de nombres → número de Pokédex y tipos (sacada de la PokéAPI)
```

## Ponerlo en marcha

1. Instala Node.js 18 o superior (https://nodejs.org).
2. En esta carpeta ejecuta:

   ```
   node server.js
   ```

3. La consola muestra la dirección (`http://localhost:3000`), la **contraseña de la organización** y los **códigos de cada pareja**.

Para fijar tu propia contraseña o puerto:

```
ADMIN_PASSWORD=mi-clave PORT=8080 node server.js
```

Si no pones contraseña se genera una y se guarda en `data/admin-password.txt`.

## Que entren los participantes desde fuera

La app se actualiza en tiempo real. Si el túnel o el hosting no dejan pasar ese tipo de conexión, cambia sola a consultar al servidor cada segundo y medio, así que funciona en cualquiera de estas opciones.

**Opción A · Túnel desde tu ordenador** (gratis, sin cuenta):

1. Instala cloudflared. En Windows, en PowerShell: `winget install --id Cloudflare.cloudflared`
2. Con `node server.js` funcionando en una terminal, abre otra y ejecuta:
   `cloudflared tunnel --url http://localhost:3000`
3. Te da una dirección tipo `https://algo-algo.trycloudflare.com`. Pásasela a los participantes.

El ordenador tiene que estar encendido, sin suspenderse y con las dos terminales abiertas todo el evento. La dirección cambia cada vez que lanzas el túnel. Cloudflare no da garantía de disponibilidad para estos túneles rápidos.

**Opción B · alwaysdata** (tiene plan gratuito y guarda los archivos):

1. Sube esta carpeta a GitHub. El `.gitignore` ya evita subir la partida y la contraseña.
2. En alwaysdata, entra por SSH (*Accesos remotos → SSH*) y descarga el código: `git clone https://github.com/TU_USUARIO/slowpoke-league.git`
3. *Web → Sitios → Añadir un sitio*: tipo **Node.js**, comando `node server.js`, directorio de trabajo `slowpoke-league`, variable de entorno `ADMIN_PASSWORD=tu-clave`.
4. En las opciones avanzadas del sitio, pon el tiempo de inactividad (*idle timeout*) a 0 para que no se pare.
5. La web queda en `https://TU_CUENTA.alwaysdata.net`.

Para actualizar después: `git pull` dentro de la carpeta por SSH y reinicia el sitio.

**Opción C · Otro servidor en internet** (Render, Railway, un VPS…):

- Sube esta carpeta a un repositorio de GitHub y conéctalo al servicio como *Web Service* de Node.
- Comando de arranque: `node server.js`. El puerto se coge solo de la variable `PORT`.
- Variables de entorno: `ADMIN_PASSWORD` (tu contraseña) y `DATA_DIR` apuntando a un **disco persistente** (por ejemplo `/var/data`). Ahí se guarda la partida. Sin disco persistente, la partida se pierde si el servicio se reinicia.
- Evita los planes que "duermen" el servidor cuando nadie lo usa.

## Cómo se usa el día del evento

**Organización** (entra con la contraseña en el campo de código):

1. *Control → Parejas y códigos*: pon los nombres de las parejas y, si quieres, cambia los códigos. Pasa a cada pareja el suyo.
2. *Banco*: carga los Pokémon (ver formato abajo).
3. *Empezar draft*: se sortea el calendario y cada pareja recibe sus dos primeras opciones. En el panel ves en todo momento qué le sale a cada una.
4. *Empezar ronda*: marca el ganador de cada combate y pulsa *Cerrar ronda y repartir cartas*.
5. Cuando todas las parejas eligen carta, se aplican solas, de la última de la clasificación a la primera. Si alguien tarda, *Resolver ya*.
6. **Revelación**: todas las parejas ven qué carta ha elegido cada una y qué ha pasado. En ese momento les aparece por primera vez su paste nuevo, junto a su próximo rival. Cada pareja pulsa *¡Estamos listos!*.
7. Cuando están todas listas se activa *Empezar ronda*. Si alguien se ha quedado colgado, tienes *Dar paso igualmente*.
8. Repite hasta la última ronda.

Para probarlo tú solo, en cada fase aparece un recuadro **Modo prueba** con botones que juegan por las parejas que aún no lo han hecho. No lo uses el día del evento.

En *Equipos* puedes editar a mano cualquier Pokémon (pegando el set en formato Showdown) para aplicar efectos que no estén en la app. Todo queda en el *Registro*.

**Parejas**: entran con su código y su nombre. Los dos miembros pueden estar conectados a la vez desde dispositivos distintos y ven lo mismo. Eligen en el draft y las cartas, ven el equipo de su próximo rival y, antes de cada combate, tienen su **paste para Showdown** con todos los efectos aplicados (sin los Pokémon que estén en el banquillo esa ronda).

**Lo que no ven las parejas**: durante el draft no ven qué eligen ni qué les sale a las demás (solo cuántos llevan). Durante las cartas no ven las cartas ni las elecciones de las demás. Todo se revela cuando termina esa fase.

**Stream**: en *Control* tienes el **enlace para OBS**, con una clave secreta. Ponlo como fuente de navegador a 1920×1080. Con ese enlace se ve todo en directo, también lo que elige cada pareja, así que no se lo pases a los participantes. La consola también lo muestra al arrancar. Si alguien abre `/#stream` sin la clave, solo ve lo que ya es público.

Ojo: si emitís el draft en directo con todo visible, una pareja que esté viendo el stream podría enterarse de lo que eligen las demás. Si os preocupa, poned un retraso en el stream o no mostréis el stream mientras dura el draft.

En Showdown jugad en un formato **Custom Game** de la generación que uséis, porque las cartas pueden dar movimientos u objetos que el validador normal rechazaría.

## Formato del banco de Pokémon

Puedes cargar un archivo JSON o pegar directamente el texto exportado de Showdown (varios Pokémon separados por una línea en blanco).

JSON, una lista de sets o `{"sets": [...]}`:

```json
{
  "sets": [
    {
      "species": "Garchomp",
      "item": "Rocky Helmet",
      "ability": "Rough Skin",
      "nature": "Jolly",
      "level": 100,
      "teraType": "Steel",
      "types": ["Dragon", "Ground"],
      "evs": {"hp": 252, "atk": 4, "def": 0, "spa": 0, "spd": 0, "spe": 252},
      "ivs": {"hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31},
      "moves": ["Earthquake", "Dragon Tail", "Stealth Rock", "Spikes"]
    }
  ]
}
```

- `types` es opcional y solo sirve para pintar los tipos en pantalla (en inglés).
- Los IVs que no pongas valen 31; los EVs que no pongas valen 0.
- Nombres de movimientos, objetos y naturalezas en inglés, como en Showdown.
- Con 8 parejas conviene tener al menos 64 sets (48 elegidos + las opciones que se están mostrando).

El banco de `data/banco_pokemon.json` se carga solo la primera vez que arranca el servidor. Después se gestiona desde la pestaña *Banco*: añadir (uno o muchos), buscar, editar y borrar. No se puede borrar un Pokémon que está en un equipo o que se le está ofreciendo a alguien. Editar un Pokémon del banco no cambia los equipos que ya lo tienen: para eso está *Equipos → Editar a mano*.

## Imágenes

Las imágenes salen de la PokéAPI (sprites oficiales de su repositorio en GitHub). La app busca el número de Pokédex a partir del nombre con la tabla `data/pokedex.json`, que incluye formas regionales y alternativas (Slowbro-Galar, Landorus-Therian, Indeedee-F…). Si un nombre no está en la tabla, el servidor pregunta a la PokéAPI en directo. Si aun así no lo encuentra, sale una silueta y la consola avisa: revisa que el nombre esté escrito como en Showdown. Los tipos se rellenan solos de la misma manera.

## Cartas

Las cartas actuales son provisionales. El catálogo está al principio de `public/logic.js` (constante `CARDS`) y el efecto de cada una en la función `applyCard`. Para añadir una carta nueva, añádela en los dos sitios. Las probabilidades por rareza están en `WEIGHTS`: quien pierde el combate tiene más opciones de sacar cartas raras.

## Copias de seguridad

Toda la partida está en `data/state.json`. Copia ese archivo para guardar una copia; si el servidor se reinicia, la partida continúa donde estaba y la gente sigue conectada.

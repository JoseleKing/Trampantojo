# Trampantojo

Un juego diario de pistas crípticas en español: tres retos al día, de menos a más difícil. Como un trampantojo, cada pista engaña a la vista: por encima parece una frase normal; por debajo, esconde cómo se construye la respuesta.

Web estática (HTML, CSS y JavaScript sin dependencias ni compilación), pensada para el móvil.

## Estructura

```
index.html                 Pantallas y marcado
css/estilos.css            Identidad visual, modo claro y oscuro
js/app.js                  Flujo del juego, progreso, compartir (FECHA_INICIO está arriba del todo)
js/desmontaje.js           Análisis de cada pista y animación del desmontaje
js/texto.js                Comparación sin tildes (con ñ) y búsqueda en la pista
trampantojo-pistas.json    Todo el contenido: tutorial y pistas diarias (tres por día)
reiniciar/index.html       Página para borrar el progreso guardado
```

## Probarlo en local

El juego carga `trampantojo-pistas.json` con `fetch`, así que **no funciona abriendo `index.html` con doble clic**: hace falta un servidor. Desde la carpeta del proyecto:

```sh
python3 -m http.server 8000
```

y abre <http://localhost:8000>. Para probarlo en el móvil, conectado a la misma wifi, abre `http://<IP-de-tu-ordenador>:8000`.

Parámetros útiles para probar:

| URL | Qué hace |
| --- | --- |
| `?dia=7` | Juega los retos del día n.º 7 en modo prueba (no guarda nada) |
| `?reiniciar` | Borra el progreso guardado y vuelve a la primera visita |

### Reiniciar el juego

Visita `/reiniciar/` (por ejemplo `http://localhost:8000/reiniciar/`) y pulsa «Borrar mi progreso». Borra partidas, racha y el progreso de hoy de ese navegador (la clave `trampantojo:v1` del `localStorage`; el modo claro u oscuro se conserva) y te devuelve al juego, que empieza de nuevo con la portada y el tutorial.

## Configuración

- `FECHA_INICIO` en `js/app.js`: el día que corresponde al día n.º 1 del JSON (`AAAA-MM-DD`, hora local). Cuando se acaban los días del JSON, el ciclo vuelve a empezar; el número que se comparte sigue creciendo. Hay 41 días: el último es el 10 de noviembre de 2026 y el 11 vuelve el día 1 (con el #42).
- Para añadir pistas, edita el JSON: cada día de `dias` lleva sus tres retos en `pistas`, ordenados de menos a más difícil. El desmontaje se genera a partir de `tipo`, `pista`, `definicion`, `indicador` y `desmontaje`; si algún dato no encaja, la respuesta aparece letra a letra en lugar de la animación específica.

## Publicarlo en GitHub Pages

1. Sube el proyecto a GitHub (`git add . && git commit -m "Trampantojo" && git push`).
2. En el repositorio: **Settings → Pages**.
3. En *Build and deployment*, elige **Source: Deploy from a branch**, rama `main` y carpeta `/ (root)`. Guarda.
4. Al cabo de un minuto o dos estará en `https://<tu-usuario>.github.io/<repositorio>/`.

Todas las rutas son relativas, así que funciona igual en un subdirectorio de GitHub Pages que en un dominio propio.

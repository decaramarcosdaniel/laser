# LASER TRAINING V8

Incluye:
- calibración manual de 4 esquinas del blanco en la cámara;
- transformación proyectiva (homografía) para corregir perspectiva;
- proyección del impacto a coordenadas normalizadas del blanco;
- imagen del blanco suministrado con marcadores numerados;
- puntuación 0–5 inicial;
- historial de impactos.

## Publicación
Subir/reemplazar `index.html`, `styles.css`, `app.js`, `manifest.json` y la carpeta `assets` en `/laser/`.

## Calibración
1. Activar cámara.
2. Iniciar calibración.
3. Tocar las cuatro esquinas físicas del blanco en orden:
   arriba izquierda, arriba derecha, abajo derecha, abajo izquierda.
4. Iniciar sesión.
5. Cada detección se proyectará sobre la imagen del blanco.

La puntuación de las regiones 0–5 es todavía una digitalización inicial de la plantilla. La homografía sí corrige la perspectiva; para puntuación milimétrica conviene digitalizar los contornos exactos de cada zona.

# LASER TRAINING V4

Versión de prueba para iPhone/Safari/GitHub Pages.

## Qué cambia
- El `<video>` muestra exclusivamente la cámara.
- Un canvas oculto procesa la imagen de cámara.
- Otro canvas independiente dibuja los marcadores.
- Se solicita la cámara trasera mediante `facingMode: environment`.
- El detector busca rojo muy dominante, saturado y brillante.
- Rechaza detecciones que ocupan una superficie excesivamente grande.
- Tiene sensibilidad, área mínima y anti-repetición configurables.
- Incluye un modo de prueba antes de implementar la puntuación.

## Publicar en GitHub Pages
Reemplazar los archivos del repositorio `/laser/` por:
- index.html
- app.js
- styles.css
- manifest.json

La URL debe seguir siendo HTTPS.

## Prueba
1. Abrir Safari en https://decaramarcosdaniel.github.io/laser/
2. Pulsar Activar cámara.
3. Aceptar permiso.
4. Pulsar Calibrar.
5. Pulsar Iniciar sesión.
6. Apuntar el láser rojo a una zona blanca.
7. El indicador superior debe cambiar a "LÁSER DETECTADO".

## Nota
La detección depende de la potencia/longitud de onda del láser, exposición automática, distancia e iluminación. Esta versión todavía no asigna puntuación al blanco; primero valida el detector físico.

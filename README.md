# Laser Training V15

Corrección principal: la detección deja de contar simplemente un punto rojo presente.
Ahora busca un PULSO NUEVO y repentino:
- rojo muy saturado;
- área pequeña;
- aumento de intensidad respecto del fotograma anterior;
- confirmación en varios fotogramas;
- el sistema debe volver a quedar sin pulso antes de armar el siguiente disparo;
- intervalo mínimo entre disparos.

Esto evita que una zona roja fija, reflejo o iluminación roja se convierta automáticamente en disparos.

El sonido solo se reproduce después de un disparo validado.

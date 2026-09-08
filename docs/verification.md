# Comprobaciones de CasioVideo

Registro del 9 de septiembre de 2026. Se distingue la ejecución física de las pruebas de navegador y de los tests de código.

## Reproductor físico

- CasioVideo 0.1.1 y COLORES.cvid se copiaron a una fx-CG50 y se verificaron después de desmontar y volver a montar el volumen.
- El usuario confirmó reproducción, carátulas de tres columnas, salida/reapertura y los iconos de menú después de probarlos en su calculadora.
- No se afirma haber probado otros modelos de Casio. Cambios de resolución o de área útil pueden cortar la interfaz, además de existir otras incompatibilidades.
- No se formatea la flash ni se realizan escrituras de sectores desde la web. El add-in lee los vídeos; la gestión se hace a través del sistema de archivos del ordenador.

## Conversión y archivos

`npm --prefix web test`: **12 tests pasan**, incluidos los límites y datos malformados del formato, round-trips de RLE/deltas, metadatos, inventario, verificación de escrituras, falta de espacio, rechazo de archivos ajenos y de sustituciones concurrentes, y no ofrecer un downgrade.

Un MP4 sintético de 8 segundos se convirtió usando el navegador: recorte de 1 a 6 segundos, 264 × 148 y 8 fps. El archivo descargado ocupó **0,274 MB**. El mismo decodificador C que usa el add-in verificó sus **40 fotogramas**, compilado localmente con AddressSanitizer. Esto comprueba la compatibilidad del archivo convertido; no mide los fps físicos de la calculadora.

## Flujo del navegador

En una pestaña local de desarrollo, un doble de `FileSystemDirectoryHandle` en memoria permitió comprobar:

1. Conectar, listar dos CVID reales y calcular el espacio con reserva.
2. Instalar desde la release pública de GitHub, verificar el SHA-256 y mostrar `Reproductor v0.1.1`.
3. Editar un título, guardar y verlo actualizado en la biblioteca.
4. Abrir el CVID, reproducir, pausar y saltar cinco segundos hacia ambos lados.
5. Abrir la confirmación de borrado, cancelar sin cambios, confirmar después y ver que desaparece solo el vídeo seleccionado.
6. Convertir otro MP4 y cargarlo en el volumen simulado; aparece con título, duración, miniatura y tamaño correctos.
7. Escoger una miniatura desde un instante del vídeo y modificar recorte/resolución con los controles de la interfaz.

Este doble existe únicamente en la sesión de pruebas: **no está incorporado a la aplicación publicada**. La escritura desde el navegador en la calculadora física sigue requiriendo una prueba del usuario con su selector de archivos y su sistema operativo. La descarga, conversión y decodificación del vídeo de prueba no están simuladas.

No se observaron errores ni advertencias de consola al terminar las operaciones del navegador. La compilación de producción se completó.

## Diseño: referencia frente a implementación

Las imágenes de concepto de `images/concept-*.png` fueron generadas con ImageGen. Son referencias de diseño, no capturas de una aplicación ni pruebas de funcionamiento. El brief fue una herramienta de vídeo oscura y sobria, con tipografía clara, acento azul, biblioteca de miniaturas y conversión a dos columnas. El usuario pidió después sustituir los selectores por deslizadores.

| Punto comprobado | Resultado e intención |
|---|---|
| Cabecera | Marca a la izquierda, Biblioteca/Convertir centrados, enlace GitHub a la derecha; sección activa subrayada en azul. |
| Paleta y jerarquía | Fondo casi negro, titulares blancos, secundarios grises, botones azules; sin degradados ornamentales ni tarjetas genéricas alrededor de todo. |
| Conversor | Ajustes a la izquierda y miniatura/título a la derecha en escritorio. Los seis ajustes usan sliders y Auto independiente, siguiendo la corrección del usuario. |
| Miniaturas | Imagen 16:9, duración abajo a la derecha y editor de miniatura mediante botón/hover. Las imágenes de colores son vídeos sintéticos reales, no la costa ficticia del concepto. |
| Presupuesto | Tamaño en MB, barra de ocupación y espacio restante junto a la acción principal; se identifica siempre como estimación. |
| Biblioteca | Tres columnas en escritorio, menú contextual por vídeo, título, duración, resolución y tamaño. |
| Móvil | Revisado a 390 × 844: sin desbordamiento horizontal; miniatura antes de ajustes, navegación en segunda línea y botón de carga ancho. No implica soporte USB móvil. |

Capturas de escritorio con viewport de 1536 × 1024 y capturas de página completa móvil están en `images/`. Se incluyen detalles funcionales que no estaban en el concepto (especificaciones resueltas de Auto y previsualización del original), por lo que la altura total no pretende ser idéntica a la imagen inicial.

## Límites que permanecen

- El navegador no ofrece la capacidad libre real del volumen elegido. Se estima para la fx-CG50 restando los archivos y una reserva; puede diferir en otros modelos o configuraciones.
- La verificación por SHA-256 detecta diferencias en la lectura inmediata; no garantiza la salud física de la flash ni la persistencia después de desconectar. Expulsa siempre la unidad y mantén copias de seguridad.
- La conversión depende de los códecs que el navegador pueda decodificar. El bitrate es un objetivo y Auto puede reducir calidad para ajustar el tamaño.
- Los FPS seleccionados son los del archivo. No se garantiza reproducción fluida a 24 fps en hardware tan limitado.

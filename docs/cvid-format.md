# Formato CVID v1

Formato propio, sin audio. Todos los enteros son **little-endian**. La calculadora solo busca archivos `.cvid` en la raíz, con nombres de hasta 31 caracteres. El título visible está dentro del archivo; no depende del nombre corto de FAT. Se admiten hasta 96 vídeos en el inventario nativo.

## Cabecera de 256 posiciones

Los offsets y tamaños de esta especificación están en bytes porque describen un protocolo binario; la interfaz muestra siempre el almacenamiento en MB decimales.

| Offset | Tipo / tamaño | Significado |
| ---: | --- | --- |
| 0 | 8 caracteres | Magic `CASVID01` |
| 8 | u16 | Versión: 1 |
| 10 | u16 | Tamaño de cabecera: 256 |
| 12 / 14 | u16 / u16 | Ancho / alto del fotograma |
| 16 / 18 | u16 / u16 | FPS / intervalo de fotogramas independientes |
| 20 / 24 | u32 / u32 | Número de fotogramas / duración en milisegundos |
| 28 / 32 | u32 / u32 | Posición / longitud de la miniatura |
| 36 / 40 / 44 | u32 | Posición del índice / datos / tamaño total |
| 48 | u32 | CRC32 del contenido posterior a la cabecera |
| 52 / 54 | u16 / u16 | Miniatura: 160 × 90 |
| 56 | u32 | Fecha UNIX |
| 64 | 120 | Título UTF-8, terminado en cero, máximo 119 |
| 184 | 16 | Herramienta creadora: `CasioVideo` |
| 200 | 16 | Identificador |
| 216 / 218 | u16 / u16 | Colores / nivel de compresión |
| 252 | u32 | CRC32 de las primeras 252 posiciones de la cabecera |

La miniatura, si existe, son 160 × 90 píxeles **RGB565** little-endian. El índice tiene 12 posiciones por fotograma: offset absoluto u32, longitud u32, tipo u8 y tres posiciones reservadas. El tipo es `0` para RGB332 directo, `1` para RLE y `2` para XOR respecto al fotograma anterior seguido de RLE.

## RLE y reconstrucción

Cada control RLE representa entre 1 y 128 píxeles: `(control & 127) + 1`. Si su bit alto está activado, el siguiente valor se repite esa cantidad de veces. Si está desactivado, siguen esa cantidad de valores literales. La salida debe tener exactamente `ancho × alto` píxeles; no se aceptan bloques truncados ni datos sobrantes.

Los tipos 0 y 1 reconstruyen un fotograma independiente. El tipo 2 exige un fotograma anterior y aplica XOR sobre él. El conversor inserta un fotograma independiente cada segundo y puede elegir entre representación directa, RLE y delta según cuál ocupe menos. Con compresión aproximada, decide primero qué píxeles conservar del fotograma anterior; la decodificación en la calculadora sigue siendo exacta respecto a esa decisión.

Para saltar, se busca el último fotograma independiente anterior al destino y se reconstruye desde ahí. No se carga todo el vídeo. La reproducción ajusta el tiempo con el reloj RTC y puede saltarse intervalos cuando el hardware no alcanza los FPS solicitados.

## Límites de v1

- Ancho máximo: 396. Alto máximo: 224. Máximo de píxeles: 88 704.
- 1–24 FPS; el conversor ofrece desde 2 FPS.
- Hasta 200 000 fotogramas y cuatro horas; el almacenamiento suele ser el límite real mucho antes.
- Archivo máximo: 16,80 MB, sujeto al espacio disponible y a la reserva.
- Los límites de resolución no significan que el dispositivo alcance 24 FPS a pantalla completa.

El navegador verifica el CRC completo y compara SHA-256 después de copiar. El reproductor valida la cabecera, el tamaño, las posiciones del índice y los límites durante la decodificación, pero no lee el archivo completo al abrirlo solo para calcular el CRC del cuerpo. Esto evita retrasar el arranque y no sustituye la verificación de la copia.

Implementaciones: [`format.js`](../web/src/format.js), [`cvid.c`](../firmware/src/cvid.c), [`storage.c`](../firmware/src/storage.c).

# 360° propio por secuencia de fotos

Se restaura la ficha y navegación originales. Se retiran las referencias al menú, escenario y visor externo de la propuesta anterior. Solo se incorpora el visor dentro del área de imagen de la ficha existente. Cotizador, colores, detalle y ficha técnica conservan su implementación original.

En Admin > Administrar catálogo > Editar, usar «360° por secuencia de fotos». Elegir secuencia general o un color, cargar fotos de una vuelta completa en orden (01, 02, 03…), reordenar con las flechas y activar el modelo. Guardar modelo. Recomendamos 24–36 fotos; máximo 72 por secuencia. Una sola imagen no genera una vista 360°. No se incorporan fotos ficticias al catálogo.

El cliente puede arrastrar, usar flechas o teclado, ampliar y volver a las fotos originales. El botón solo aparece para secuencias activadas con al menos dos imágenes distintas. Si no hay secuencia para el color, se muestra explícitamente la secuencia general cuando existe.

Las imágenes se optimizan localmente a WebP y se almacenan en `spin360` dentro del JSON del catálogo existente. No se necesitan nuevas tablas ni proveedores externos. Límite de configuración 5 MB y solicitud completa 11 MB, por debajo del máximo de la API. Los permisos existentes del catálogo controlan el guardado.

Instalación selectiva desde el checkout de actualización: `python3 server/install-photo-sequence.py`. Valida la versión previa, sintaxis y pruebas; respalda archivos y publica dependencias antes del HTML. Verifica bytes publicados y configuración pública de CAPTCHA; revierte ante errores. No requiere reiniciar el servicio.

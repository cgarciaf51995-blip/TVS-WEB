# Nuestros productos y visor 360° existente

Se conserva el modal original de detalle con su ficha técnica, colores, cotizador y precalificación. La nueva navegación abre un catálogo por categorías y una vista de cada modelo. La cabecera usa SAN CRISTÓBAL TVS.

## Configuración por modelo

1. Admin → Administrar catálogo → Editar modelo.
2. En “Visor 360° existente”, pegar el enlace HTTPS del modelo correspondiente en Sketchfab.
3. Usar “Vista previa del visor” para comprobar la versión del modelo.
4. Activar “Activar vista 360° para este modelo” y guardar.

Los dos campos son `viewer360Enabled` y `viewer360Url`, dentro del catálogo que ya persiste el backend. No se crea una tabla adicional. No se asignan visores automáticamente a modelos con nombres parecidos.

Se admiten enlaces de modelo Sketchfab y enlaces /models/ID/embed. No se admite pegar código iframe, claves privadas, otros proveedores ni enlaces HTTP. El visor se carga solamente cuando el visitante lo abre y se retira al cerrar. Conserva la atribución del proveedor y ofrece abrirlo en otra pestaña si la incrustación no carga.

Ejemplo de un visor existente para **TVS Apache RTR 200 4V**: https://sketchfab.com/3d-models/tvs-apache-rtr-200-4v-98b4185db6154cffb54e41aa0888b708
Es una referencia de un tercero: comprobar que corresponde a la moto antes de habilitarlo. Se abrió este visor en una pestaña externa y se comprobó el giro interactivo. La incrustación permaneció en blanco en el navegador de prueba; no se considera verificada dentro de la ventana de la aplicación.

## Publicación en el VPS existente

Ejecutar cada línea por separado:

```sh
cd /opt/tvs-release-20261111
git fetch origin
git checkout --detach origin/main
python3 server/install-products-360.py
```

El instalador comprueba la versión instalada, ejecuta los tests Node, respalda los tres archivos y publica únicamente el HTML y los dos recursos nuevos de dist. Verifica las respuestas HTTP y restaura los archivos previos si falla la comprobación. No reinicia ni modifica el servicio, las claves, la base de datos o la configuración de reCAPTCHA.

Mensaje de éxito: `PRODUCTS_360_DEPLOY_VERIFIED`.
Si la web instalada tiene otros cambios, se detiene antes de sobrescribirla.

## Validación

Pasaron los 14 tests reproducibles de `tests/products-360.test.mjs` en Node. También se comprobó en navegador la navegación por categorías, la categoría vacía, el escenario y sus controles, el modal original con cotizador y ficha técnica, y el guardado y reapertura de los ajustes 360 en una vista previa local sin escrituras en producción. La revisión móvil se hizo con un iframe de 390 px.

Se ajustó la presentación al boceto aprobado: cabecera azul, botón Nuestros productos con acento amarillo, tarjetas por categoría, lista lateral, túnel blanco, plataforma, panel de colores y modelos relacionados. Se conservaron los seis modelos y fotografías del catálogo actual. Varias fotos del catálogo son imágenes genéricas o enlaces que no cargan; los recursos que fallan muestran “Fotografía por actualizar” en las nuevas vistas. No se sustituyeron por imágenes de otros modelos.

Pendiente en producción: instalar la actualización y verificar la incrustación 3D con el enlace elegido. Los cambios de la prueba local no se publicaron en Supabase ni en el VPS.


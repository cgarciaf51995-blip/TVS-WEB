> CARGA PARCIAL: los archivos public/portal-gys-v6.html y dist/portal-gys-v6.html están pendientes de publicación. Esta rama no está lista para desplegarse. No reemplaza la instalación actual del VPS.

# San Cristóbal TVS · V60

Incluye la edición exclusiva TVS, catálogo, carrusel automático, portales, CRM y reCAPTCHA v2 administrable.

## Instalar y ejecutar en tu computadora

Requiere Node.js 22.15 o superior; se recomienda Node.js 24 LTS.

1. Extraer el ZIP en una carpeta nueva y abrir la carpeta que contiene package.json.
2. Ejecutar `npm ci`.
3. Copiar `.env.example` como `.env` (en PowerShell: `Copy-Item .env.example .env`).
4. Editar `.env` y definir `SECURITY_ADMIN_PASSWORD` con una contraseña propia de al menos 16 caracteres. No compartir ni publicar este archivo.
5. Ejecutar `npm run dev`. Este comando inicia tanto la web como el servidor de verificación. Abrir la dirección que muestra Vite, normalmente http://localhost:5173.

## Registrar y activar reCAPTCHA

1. Entrar a https://www.google.com/recaptcha/admin/create con la cuenta Google del negocio.
2. Elegir **reCAPTCHA v2 → Casilla No soy un robot**. Esta integración utiliza la API clásica `siteverify`, no claves de API de Enterprise.
3. Registrar los dominios de la web sin https ni rutas. Para pruebas locales agregar `localhost`. Si se usa la IP 127.0.0.1 para pruebas, se deben registrar y autorizar los hosts compatibles correspondientes; se recomienda abrir localhost.
4. Entrar al portal Administrador y abrir **Seguridad de formularios**.
5. Ingresar la contraseña del servidor definida en SECURITY_ADMIN_PASSWORD. Esta contraseña es independiente del login local de demostración del portal.
6. Pegar Site Key, Secret Key y los dominios autorizados (uno por línea). La clave secreta queda en el servidor y nunca se escribe en localStorage ni se devuelve al navegador.
7. Activar la protección, seleccionar formularios y guardar. Si Secret Key se deja vacía al actualizar, se conserva la clave guardada.
8. Probar desde una ventana privada que aparezca la casilla y que no se permita continuar sin resolverla.

Los formularios cubiertos son: inicio de sesión de todos los portales, precalificación, solicitud Freelance, consultas al asistente, referido, crédito Freelance y finalización Freelance. Los formularios de configuración interna del administrador no solicitan CAPTCHA. Los controles internos del CRM conservan su funcionamiento.

También se puede abrir `/security-admin.html` directamente para recuperar la configuración si una clave incorrecta impide completar el captcha del login del portal. Este panel siempre exige la contraseña real del servidor.

El sistema se entrega **desactivado hasta registrar y configurar las claves propias del negocio**. No usa claves ficticias ni de prueba de Google en producción.

## Servidor de producción

Ejecutar `npm ci`, `npm run build` y `npm start` en un servidor con Node.js. El servicio sirve la web compilada de dist y la API de verificación desde el mismo origen. Establecer `PUBLIC_ORIGIN=https://tu-dominio.com` y configurar HTTPS en el alojamiento o proxy inverso. `PORT` usa 3000 por defecto, o el valor del proveedor.

La carpeta configurada mediante SECURITY_DATA_DIR debe ser privada, persistente y estar fuera de public/dist. Por defecto es `private/`. El servidor guarda ahí las claves y las opciones con permisos restringidos. No subir esta carpeta a un repositorio. Si el alojamiento borra archivos al reiniciar o desplegar, usar un disco persistente para conservar los ajustes hechos desde el panel. Alternativamente se pueden definir las claves y dominios mediante las variables RECAPTCHA_* de `.env.example`; las variables tienen prioridad al reiniciar.

No basta con subir únicamente dist a un alojamiento estático para tener verificación reCAPTCHA. Se necesita ejecutar el servidor incluido. Si no se puede consultar la configuración del servidor, los formularios cubiertos bloquean el envío en lugar de omitir la comprobación.

## Alcance de la seguridad

El backend valida tokens con Google, hostname permitido, antigüedad máxima de dos minutos, rechazo de reutilización, límite de intentos, origen de las peticiones y sesión administrativa de duración limitada. El panel no devuelve la clave secreta.

La versión del catálogo y CRM anterior guardaba los datos y los accesos del portal en el navegador. Esta entrega añade el backend de reCAPTCHA y la administración de sus claves; **no convierte todavía el CRM a una base central ni reemplaza su autenticación local de demostración**. La prueba de CAPTCHA precede a los manejadores locales existentes. Una persona puede modificar JavaScript de su propio navegador; esto no constituye autorización para acceder a información privada.

Al implementar los futuros endpoints que guardan solicitudes, mensajes o documentos, deberán validar CAPTCHA en el mismo endpoint antes de ejecutar la operación. La función `verifyCaptcha(token, action)` exportada por `server/security.mjs` es reutilizable para ese fin. No usar una respuesta de /api/security/verify como autorización de otra operación ni validar dos veces el mismo token. La verificación de Google debe hacerse una vez dentro del flujo real de guardado, con acción fijada en el servidor. No se debe exponer un endpoint de guardado que omita esa comprobación.

No recolectar documentos o información sensible real hasta completar autenticación, permisos, base central y almacenamiento privado de archivos.

## Comprobaciones

`npm run test:security` ejecuta pruebas con respuestas de Google simuladas para no requerir claves reales: acceso administrativo, origen, secretos ocultos, tokens vacíos, inválidos, vencidos, de otro dominio y reutilizados, y selección de formularios. No valida la cuenta ni las claves reales del negocio; esa comprobación debe hacerse después de configurarlas.

Se conservan el nombre San Cristóbal TVS, el diseño del carrusel y su avance automático cada cinco segundos.


## Preparación para repositorio público

Se retiraron del HTML las claves de Supabase del proyecto anterior y las cuatro contraseñas fijas de demostración. Los accesos predeterminados quedan desactivados; no se acepta una contraseña vacía. El diseño y el catálogo se conservan. Los usuarios locales previamente creados mantienen el funcionamiento de demostración descrito arriba. Esta entrega aún requiere implementar la autenticación central y permisos de producción antes de habilitar operaciones con datos reales.

El proyecto nuevo TVS-WEB de Supabase ya está creado; su conexión, tablas y políticas siguen pendientes. No se ha migrado la base PostgreSQL existente en el VPS.

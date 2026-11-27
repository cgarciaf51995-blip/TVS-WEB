# WhatsApp en MotoCRM

Un número compartido de TVS vinculado mediante Baileys. La pantalla original del CRM y su historial interno permanecen disponibles. En Inbox, la pestaña WhatsApp muestra mensajes reales; Historial interno conserva el flujo anterior.

## Uso

1. Ingresar al portal Admin y abrir **WhatsApp CRM**. También se puede abrir `/whatsapp-admin.html` con la sesión vigente de Admin o Gerencia.
2. Pulsar **Conectar / mostrar QR**. En el teléfono usar WhatsApp → Dispositivos vinculados → Vincular un dispositivo y escanear el QR directamente. No publicar ni compartir el QR.
3. Los mensajes individuales nuevos aparecen en Administración. Seleccionar una conversación, elegir vendedor y pulsar **Asignar responsable**. Se enlaza un lead existente por teléfono normalizado o se crea uno. La reasignación transfiere también el responsable del lead asociado.
4. Admin, Gerencia y vendedores comparten las conversaciones. Cada mensaje entrante crea o enlaza inmediatamente un lead por teléfono, incluso sin asignación. El vendedor usa «Tomar conversación» para hacerse responsable; la toma es atómica para impedir que dos personas la reclamen. Gerencia puede reasignar. El historial muestra quién envió cada respuesta. Los leads de WhatsApp son visibles y gestionables por el equipo; los leads manuales conservan sus permisos anteriores. Freelance y usuarios anónimos no tienen acceso.

La conexión conserva las credenciales cifradas en la base de datos y puede reconectarse al reiniciar. Desconectar pausa la conexión; Restablecer vinculación elimina la sesión guardada y requiere un QR nuevo. Los mensajes del CRM se conservan.

## Alcance de esta entrega

Recepción de mensajes individuales nuevos, lectura de los últimos 100 mensajes por conversación, hasta 200 conversaciones recientes, envío de texto (máximo 4000 caracteres), asignación, lead sin duplicación por teléfono, reconexión y estado. Las fotos/documentos recibidos se representan como mensajes no textuales con indicación de consultar el teléfono. No se importa el historial anterior a la vinculación, grupos, estados ni conversaciones propias. Los mensajes identificados solo por LID se procesan cuando WhatsApp proporciona el número alternativo o su mapeo. No hay envío masivo ni respuestas automáticas de IA en esta entrega.

El estado Enviado significa que Baileys aceptó el envío; no es confirmación de lectura. Ante tiempo de espera o error, el mensaje queda Sin confirmar y no se reenvía automáticamente. El mismo identificador de solicitud nunca se envía dos veces. Revisar el teléfono antes de repetir un mensaje incierto.

## Implementación

- Dependencias exactas en `whatsapp-runtime/package.json` y lockfile separado para conservar las dependencias del servidor anterior. Baileys `7.0.0-rc14`, qrcode `1.5.4`, pino `9.14.0`.
- API `/api/zip/whatsapp/*`, cookie HttpOnly del CRM y validación del origen existente. QR y controles solo para Admin/Gerencia; el Inbox y los leads de WhatsApp se comparten entre los usuarios internos. Freelance y usuarios anónimos no tienen acceso.
- Cuatro tablas privadas `crm.wa_auth`, `wa_runtime`, `wa_threads`, `wa_messages`, con RLS y acceso exclusivo `tvs_backend`. Migración `crm_whatsapp_baileys_private_storage` aplicada en wvhzqukukzzwoevbgare. Datos de sesión, contacto y contenido cifrados AES-GCM con la clave privada ya usada por el servidor; respaldar esa clave con la base de datos, fuera de Git.
- Cola de escritura de credenciales y claves Signal persistidas; no se usa el helper de archivos de demostración. Lease en Postgres para evitar conexiones simultáneas de varias instancias.
- Límite de 20 envíos/minuto por usuario, sin publicidad masiva. IDs entrantes deduplicados. No se escriben QR, credenciales ni mensajes en logs.
- Baileys es una biblioteca comunitaria no oficial de WhatsApp; requiere mantenimiento frente a cambios de protocolo. La compatibilidad real del número solo se confirma después del escaneo y una prueba de recepción/envío autorizada por el usuario.

## Instalación existente

Desde `/opt/tvs-release-20261111` ejecutar `python3 server/install-whatsapp.py`. El instalador valida hashes previos, instala dependencias aisladas, ejecuta 27 pruebas, verifica acceso a tablas como usuario del servicio y respalda archivos privados. Publica los archivos acotados y adapta el inicio/cierre de WhatsApp en el entrypoint existente sin sustituir su seguridad. Reinicia `tvs`, valida HTTP, archivos y CAPTCHA, y revierte ante fallo. No requiere recarga de OpenAI: esta conexión no utiliza IA.

## Actualización a bandeja compartida

Ejecutar `python3 server/install-whatsapp-shared.py` desde el checkout de actualización. Ejecuta 30 pruebas, respalda archivos y leads cifrados, enlaza las conversaciones existentes de forma transaccional, conserva credenciales y reinicia el servicio para reconectar el mismo número. No necesita un QR nuevo salvo que WhatsApp haya revocado la sesión.

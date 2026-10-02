# Veinte Minutos

Herramienta para aplicar Working Backwards antes de construir cualquier cosa.

El autor contesta cinco preguntas con un facilitador que no acepta respuestas vagas. De ahí sale un PR/FAQ. El equipo lo lee en silencio con un reloj corriendo y deja notas ancladas al texto. Nadie ve las notas de nadie hasta que el autor cierra la ronda, y entonces aparecen todas juntas y sin nombres.

## Cómo está armado

Sin compilación y sin terminal. HTML y JS estáticos más funciones de servidor en Vercel. Los datos viven en Supabase.

```
index.html      entrada: código de lectura o acceso de autor
owner.html      lista de iniciativas y alta con tres campos de contexto
session.html    las 5 preguntas fijas, como chat
memoria.html    lo que el facilitador sabe de la iniciativa, y chat libre
document.html   edición del PR/FAQ con los huecos protegidos
sesiones.html   sesión de lectura: código, avance y revelado
read.html       vista del lector: reloj, subrayado y notas
assets/         estilos y utilidades compartidas
api/            funciones de servidor (aquí viven las llaves secretas)
supabase/       el esquema y la migración
```

## Instalación

**1. Supabase**

Crea un proyecto. Ve a SQL Editor, pega el contenido de `supabase/schema.sql` y corre. Si ya habías corrido una versión anterior del esquema, corre además `supabase/migracion-memoria.sql`, que agrega la tabla de memoria sin tocar lo existente. En Authentication > Providers deja activado Email. Para las primeras pruebas conviene apagar "Confirm email" y así entras de inmediato.

**2. GitHub**

Sube esta carpeta a un repositorio nuevo. Puedes hacerlo desde el navegador con "uploading an existing file".

**3. Vercel**

Importa el repositorio. Framework preset: Other. No hay comando de build.

Antes de desplegar, carga estas variables en Settings > Environment Variables:

| Variable | Dónde sale | Va al navegador |
|---|---|---|
| `SUPABASE_URL` | Supabase > Project Settings > API | sí |
| `SUPABASE_ANON_KEY` | la misma pantalla, llave publishable | sí |
| `SUPABASE_SERVICE_ROLE_KEY` | la misma pantalla, llave secret | **no, nunca** |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API Keys | **no, nunca** |
| `APP_MODEL` | opcional, por defecto `claude-sonnet-5` | no |
| `EMPRESA_CONTEXTO` | opcional, una frase sobre tu empresa | no |

Despliega. Listo.

## Sobre las llaves

El navegador nunca ve la llave de servicio ni la de Anthropic. Las lee `api/_db.js` y `api/claude.js` del lado del servidor. Los valores públicos se sirven en `/api/config` en lugar de escribirse dentro del código, para que el repositorio quede limpio aunque sea público.

## Por qué el ciego está en el servidor

Las tablas `participants` y `annotations` no tienen políticas de RLS a propósito. Eso significa que no se pueden leer con la llave pública. Toda anotación entra y sale por `api/reader.js` y `api/owner.js`, que son las que verifican si la ronda ya cerró.

Consecuencia: mientras la ronda está abierta, el autor solo puede ver cuánta gente entró y cuánta terminó. El contenido no es visible ni para él. Eso es el mecanismo, no una restricción técnica, y por eso no se resuelve del lado del cliente.

## Lo que el autor no puede borrar

El facilitador marca dos tipos de hueco en el documento: supuestos sin validar y preguntas abiertas. Esos bloques se pueden reescribir pero no borrar. Solo se quitan resolviéndolos con evidencia, que queda escrita en el documento.

Es la pieza que evita que el PR/FAQ se convierta en material de venta.

## Costo de operación

La lectura, las notas y el revelado no llaman a ningún modelo. Corren en el plan gratuito de Vercel sin problema. Las únicas llamadas a la API de Anthropic son la facilitación y la generación del borrador: del orden de 15 a 25 turnos de texto corto por iniciativa.

## Antes de la primera sesión con gente

Prueba la selección de texto en un iPhone y en un Android. El menú nativo de copiar y pegar del navegador compite con la barra de anotación y es la parte más delicada de la interfaz.

## Cómo se usa

1. El autor crea la iniciativa con tres campos: nombre, una frase, etapa.
2. Contesta las cinco preguntas. Si se atora, "Avanzar así" guarda la respuesta y marca el hueco.
3. Genera el borrador y lo edita.
4. Abre la sesión de lectura y reparte el código de seis caracteres.
5. Los lectores entran solo con el código. Reciben un alias al azar.
6. Al cerrar la ronda todo se revela al mismo tiempo.
7. El autor reescribe, guarda una versión nueva y abre la siguiente sesión.

Entre dos y cuatro sesiones suele bastar. La regla de paro: dejas de abrirlas cuando las preguntas que surgen ya están contestadas dentro del propio documento.

## La memoria de la iniciativa

El facilitador guarda lo que el autor le dice en tres cajones: contexto, decisiones ya tomadas y pendientes. Cada vez que se abre la iniciativa arranca sabiendo eso, así que no vuelve a preguntar lo mismo. El autor puede agregar y borrar notas a mano en `memoria.html`, y ahí mismo platicar con el facilitador fuera de las 5 preguntas.

Solo guarda lo que el autor dijo. Lo que propuso el facilitador no se guarda como si fuera del autor.

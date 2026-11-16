# WINN (Work In No Network)

WINN es una aplicación de escritorio para que el docente realice cuestionarios grupales con ranking en el aula **sin necesidad de Internet**. El docente ejecuta WINN en su computadora, que funciona como servidor local, y los estudiantes participan desde el navegador de su propio teléfono, conectados a la misma red local (un router o un punto de acceso sin salida a Internet). Los estudiantes no instalan nada, no crean cuentas y no consumen datos móviles.

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24267865.svg)](https://doi.org/10.5281/zenodo.24267865)
Licencia MIT. Versión actual: **1.2.0**.

## Cómo funciona

1. El docente abre WINN, elige un cuestionario y abre la proyección, que muestra un código QR.
2. Los estudiantes, conectados a la misma red local, escanean el código (o escriben la dirección que aparece) y se registran con su nombre y su boleta.
3. El docente inicia el juego. Cada pregunta tiene cuatro opciones y un tiempo límite; el puntaje depende de la rapidez de las respuestas correctas.
4. Al terminar el tiempo de cada pregunta, cada estudiante ve en su teléfono si acertó, la respuesta correcta y sus puntos; después se muestra el ranking en la proyección.
5. Al finalizar, el lanzamiento se guarda en la base de datos local del equipo del docente y se puede consultar en el panel.

## Descarga e instalación

Los instaladores están en la sección **Releases** de este repositorio:
https://github.com/natanfx/winn-app/releases

| Sistema | Archivo |
|---|---|
| Windows 10/11 (64 bits) | `WINN-1.2.0-Windows-x64.exe` |
| macOS (Apple Silicon) | `WINN-1.2.0-macOS-arm64.dmg` |

> Los instaladores **no están firmados digitalmente**, por lo que el sistema operativo mostrará un aviso la primera vez. Más abajo se explica cómo continuar y cómo verificar que el archivo es el publicado.

### Verificar la integridad del archivo (recomendado)

Cada release incluye el archivo `SHA256SUMS.txt`. Calcula el hash del archivo descargado y compáralo con el publicado.

- **Windows (PowerShell):** `Get-FileHash .\WINN-1.2.0-Windows-x64.exe -Algorithm SHA256`
- **macOS (Terminal):** `shasum -a 256 WINN-1.2.0-macOS-arm64.dmg`

Si los valores no coinciden, no instales el archivo.

### Windows

1. Ejecuta el instalador.
2. Si aparece "Windows protegió su PC" (SmartScreen), haz clic en **Más información** y luego en **Ejecutar de todos modos**.
3. La primera vez que WINN inicie, Windows puede preguntar si permite el acceso a la red al programa. Acepta para **redes privadas**; sin ese permiso los teléfonos no podrán conectarse.

### macOS

1. Abre el `.dmg` y arrastra WINN a Aplicaciones.
2. Si macOS indica que no puede verificar la aplicación, haz clic derecho sobre WINN y elige **Abrir**; confirma en **Abrir**. En versiones recientes, si no aparece esa opción, ve a **Ajustes del Sistema > Privacidad y seguridad** y pulsa **Abrir de todos modos**.
3. El instalador publicado es para Apple Silicon (M1 o superior). Para equipos Intel, ejecuta WINN desde el código fuente (ver abajo).

## Preparar la red del aula

- El equipo del docente y los teléfonos deben estar **en la misma red local**. Sirve un router sin conexión a Internet o la función de punto de acceso (hotspot) del equipo del docente.
- WINN usa el puerto **3000**. Verifica que el cortafuegos del equipo lo permita en redes privadas.
- Algunos routers y puntos de acceso tienen activado el "aislamiento de clientes" (AP isolation), que impide que los dispositivos se vean entre sí. Debe estar desactivado.
- La dirección que muestra el código QR es la primera interfaz de red IPv4 que detecta el equipo. Si el equipo tiene VPN o adaptadores virtuales activos, desactívalos para que el QR apunte a la red correcta.
- Cuando el equipo del docente está conectado a la red del aula, no es necesario que esa red tenga Internet.

## Uso rápido

1. Abre WINN y crea un cuestionario (título y tiempo por pregunta). Agrega preguntas con cuatro respuestas y marca la correcta.
2. Selecciona el cuestionario y habilita las conexiones.
3. Abre la proyección. Si hay un segundo monitor o proyector, se abre ahí.
4. Pide a los estudiantes que escaneen el QR y se registren.
5. Inicia el juego y avanza pregunta por pregunta.
6. Al final, revisa el ranking y el detalle en la lista de lanzamientos.

## Ejecutar desde el código fuente

Útil si tu equipo no es compatible con los instaladores, o si prefieres no ejecutar un instalador sin firma.

Requisitos: Node.js 18 o superior y npm.

```
git clone https://github.com/natanfx/winn-app.git
cd winn-app
npm install
npm start
```

Para generar los instaladores desde el código fuente:

```
npm run make
```

Los instaladores se crean en la carpeta `out/`, que no se sube al repositorio.

## Tecnologías

Electron, Node.js, Express, Socket.IO, SQLite3, QRCode, HTML/CSS/JavaScript. La interfaz del docente incluye SweetAlert2 de forma local (`public/js/vendor/`), por lo que no depende de Internet.

## Estructura del proyecto

```
winn-app/
  src/main/        Proceso principal de Electron
  src/backend/     Servidor local (Express y Socket.IO)
  src/db/          Acceso a la base de datos SQLite
  data/            Esquema de la base de datos
  public/          Interfaces: docente, estudiante y proyección
  materiales/      Instrumentos de evaluación y guía de observación
  assets/          Íconos
```

## Datos y privacidad

WINN guarda el nombre y la boleta de los participantes, sus respuestas y puntajes **únicamente en la base de datos local** del equipo del docente. No envía información a ningún servidor externo.

## Limitaciones conocidas

- Los instaladores no están firmados digitalmente.
- Los datos del juego en curso se guardan al finalizar el lanzamiento; si la aplicación se cierra a mitad de una actividad, esa sesión no se conserva.
- La dirección del código QR depende de la interfaz de red detectada (ver "Preparar la red del aula").
- La comunicación en la red local usa HTTP sin cifrar.

## Cómo citar

Si utilizas WINN en un trabajo académico, cítalo con el DOI de Zenodo de la versión que usaste (ver el botón "Cite this repository" de GitHub o el archivo `CITATION.cff`).

Belmontes Zacarías, J. (2026). *WINN (Work In No Network)* (Versión 1.2.0) [Software]. Zenodo. https://doi.org/10.5281/zenodo.24267865

## Licencia

Distribuido bajo licencia MIT. Consulta el archivo `LICENSE`. SweetAlert2 se incluye bajo su propia licencia MIT (`public/js/vendor/sweetalert2.LICENSE.txt`).

## Contribuciones

Las ideas, reportes de errores y sugerencias son bienvenidas mediante un issue o un pull request.

## Autor

Jonatan Belmontes Zacarías. Educación, tecnología e innovación en contextos con baja conectividad.
WINN – Work In Not Net

WINN (Work In Not Net) es una aplicación educativa interactiva diseñada para funcionar sin conexión a internet, orientada a entornos escolares donde la conectividad es limitada o inexistente.

El proyecto busca apoyar dinámicas de trabajo en aula mediante actividades digitales locales, priorizando accesibilidad, simplicidad y autonomía tecnológica.

IDEA CENTRAL

Muchos espacios educativos no cuentan con internet estable, lo que limita el uso de herramientas digitales.
WINN propone una alternativa offline-first, permitiendo trabajar con dinámicas digitales sin depender de servicios en la nube.

TECNOLOGÍAS UTILIZADAS

Electron
Node.js
npm
HTML / CSS / JavaScript

REQUISITOS PREVIOS

Antes de ejecutar el proyecto, es necesario contar con:

Node.js (recomendado versión 18 o superior)
npm

Para verificar la instalación:

node -v
npm -v

INSTALACIÓN Y EJECUCIÓN EN MODO DESARROLLO

Clonar el repositorio:

git clone https://github.com/natanfx/winn-app.git

Entrar a la carpeta del proyecto:

cd winn-app

Instalar dependencias:

npm install

Ejecutar la aplicación en modo desarrollo:

npm start

GENERAR LA APLICACIÓN (BUILD)

Para crear el instalador de la aplicación:

npm run make

El instalador se generará en la carpeta out/.

Nota importante:
La carpeta out/ no se sube al repositorio.
Los instaladores finales deben publicarse en la sección Releases de GitHub.

ESTRUCTURA GENERAL DEL PROYECTO

winn-app/
src/
public/
main.js
package.json
README.md
.gitignore

La estructura puede modificarse conforme el proyecto evolucione.

LICENCIA

Este proyecto se distribuye con fines educativos y de investigación.
La licencia será definida en futuras versiones del proyecto.

CONTRIBUCIONES

Las contribuciones, ideas y sugerencias son bienvenidas.
Si deseas colaborar, puedes abrir un issue o enviar un pull request.

AUTOR

Proyecto desarrollado por Jonatan Belmontes.
Enfocado en educación, tecnología e innovación en contextos con baja conectividad.

ESTADO DEL PROYECTO

WINN se encuentra en desarrollo activo.
Nuevas funciones y mejoras se integrarán progresivamente.
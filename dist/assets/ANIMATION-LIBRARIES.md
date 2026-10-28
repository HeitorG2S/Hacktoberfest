# Front-end visual libraries

The browser bundles are self-hosted in this folder so the prototype does not depend on a third-party CDN at runtime.

- GSAP 3.15.0: https://gsap.com/docs/v3/Installation/; standard license: https://gsap.com/standard-license/
- Anime.js 4.5.0: https://animejs.com/documentation/getting-started/installation/; MIT license: see `animejs-LICENSE.md`.
- Chart.js 4.6.1: https://www.chartjs.org/docs/latest/; MIT license: see `Chart.js-LICENSE.md`.

GSAP handles the page and section entrances. Anime.js handles short interaction feedback. Chart.js draws the responsive canvas previews and financial charts. Motion is disabled when the operating system requests reduced motion.
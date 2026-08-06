---
id: okf_lienzo_plataforma
type: Concept
title: "El Lienzo de la Plataforma (The Platform Canvas)"
version: "0.2"
status: Verified
verified: true
created_at: "2026-08-05"
sources:
  - resource: "urn:isbn:no_especificado_en_la_fuente"
    title: "LA ESCALADA DE LA PLATAFORMA: Un marco convincente para construir plataformas, redes y mercados"
    authors:
      - "Sangeet Paul Choudary"
    source_type: "Book"
    extraction_method: "Conceptual Abstraction & Paraphrase"
tags:
  - platform-canvas
  - ingenieria-de-negocios
  - diseño-arquitectonico
especialistas:
  - plataformas
relations:
  prerequisites:
    - okf_interaccion_central
    - okf_pila_plataforma
  related_concepts:
    - okf_motor_pull_facilitate_match
---

# El Lienzo de la Plataforma (The Platform Canvas)

## 1. Resumen Ejecutivo
El Lienzo de la Plataforma (Platform Canvas) es un marco metodológico estructurado que unifica los bloques constructivos esenciales de un modelo de negocio multifacético en torno a su interacción central. Sustituyendo los embudos lineales y las herramientas de planificación tradicionales, este lienzo guía el diseño de sistemas abiertos evaluando de manera simultánea la atracción de usuarios, la facilitación de herramientas de autoservicio y la captura sistemática de valor.

## 2. Definición y Principios Clave
El lienzo de planificación se fundamenta en los siguientes pilares de ingeniería:
* **Diseño Secuencial de Interacciones:** Si una plataforma proyecta habilitar múltiples interacciones complejas, cada una de ellas (interacciones de borde) debe modelarse de manera secuencial en su propio lienzo, partiendo siempre de la interacción central indispensable [281, 294].
* **Superación del Enfoque Unilateral:** La planificación se aleja del clásico embudo lineal enfocado exclusivamente en las pisadas o conversiones de compra del cliente [79, 281]. En su lugar, equilibra de forma simultánea el valor, las motivaciones y el retorno de inversión tanto del lado productor como del consumidor [281, 283].
* **Configuración Abierta pero Controlada:** Diseña canales abiertos de acceso y APIs distribuidas, combinándolos con cortafuegos algorítmicos y sociales para mantener la gobernanza cualitativa del sistema [285, 286].

## 3. Componentes y Estructura (Las 15 Preguntas Clave)
El lienzo organiza la arquitectura de negocios a través de cuatro dimensiones clave:

### Fase I: La Interacción Central (Relacional)
1. **La Interacción de Valor:** ¿Cuál es el intercambio relacional principal que la plataforma habilita? [296]
2. **La Unidad de Valor Central:** ¿Cuál es el suministro o inventario mínimo e indispensable generado sobre la infraestructura? [296]
3. **El Productor:** ¿Quién genera el valor y qué incentivos orgánicos lo motivan a producir? [297]
4. **El Consumidor:** ¿Quién consume la unidad y cuáles son sus motivaciones de participación? [297]

### Fase II: El Modelo Plug-and-Play (Acceso y Filtros)
5. **Canales de Producción:** ¿Qué canales y accesos remotos (APIs, SDKs, widgets, aplicaciones) utilizan los productores para subir valor? [285, 297]
6. **Control de Acceso:** ¿Cómo gestiona la plataforma el control de acceso y los derechos de autoría de los productores? [286, 297]
7. **Canales de Consumo:** ¿Mediante qué interfaces físicas o digitales consumen valor los usuarios? [290, 298]
8. **Filtros de Relevancia:** ¿Qué variables de datos estructuran los filtros de consumo para combatir la sobreabundancia? [287, 298]

### Fase III: Herramientas, Servicios e Infraestructura
9. **Infraestructura de Facilitación:** ¿Qué herramientas centralizadas viabilizan y aseguran el intercambio técnico? [298]
10. **Herramientas de Creación:** ¿Qué software o interfaces de autoservicio reducen las barreras de destreza del creador? [289, 298]
11. **Herramientas de Curación y Personalización:** ¿Qué mecanismos sociales, algorítmicos o editoriales evalúan la calidad? [290, 298]
12. **Interfaces de Consumo:** ¿Qué utilidades dinámicas facilitan la visualización del contenido o servicio de forma relevante? [290, 299]
13. **Soporte Organizacional:** ¿Cómo asisten estas herramientas al motor operativo de Atracción (Pull), Facilitación (Facilitate) y Emparejamiento (Match)? [293, 299]

### Fase IV: Captura y Flujos de Valor (Captura)
14. **Moneda de Intercambio:** ¿Qué valor económico (dinero) o social (reputación, atención) entrega el consumidor al productor? [291, 299]
15. **Captura de la Plataforma:** ¿Cómo captura el operador de la plataforma una parte de esta transacción o la procesa para monetizar interacciones secundarias? [291, 299]

## 4. Casos de Aplicación / Implicaciones Prácticas
* **La evolución en LinkedIn:** El lienzo de LinkedIn se diseñó primero para su interacción central: conectar profesionales (perfiles, búsquedas relacionales) [294, 295]. Una vez estabilizada esta interacción, se diseñó un lienzo secundario para una interacción de borde: el mercado de contratación, donde los reclutadores (un nuevo rol de productor de ofertas) consumen currículums de profesionales aprovechando los datos acumulados de la interacción central [295].
* **Monetización cruzada de flujos:** El lienzo ayuda a visualizar que la captura de valor no siempre es económica de forma directa. Capturar datos de comportamiento o atención (monedas no monetarias) a través de una interacción del lienzo puede nutrir el filtro de emparejamiento de otra interacción secundaria, facilitando el cobro de una tarifa transaccional o colocación pagada en una etapa posterior [292].

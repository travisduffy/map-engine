# Research & Reference Materials

Index of supporting architectural and engineering research documents.

---

- [**browser-native-map-engineering.pdf**](./browser-native-map-engineering.pdf)
  - **Title:** Browser-Native Grand Strategy Map Engineering: Architecture, Limitations, and Edge-Cases in RGB Index-Map Rendering
  - **Focus:** Architecture, hardware limitations, and web optimizations for rendering RGB index-maps in browser-native grand strategy games via WebGL and WebAssembly.
  - **Summary:** This document explores the severe engineering constraints of migrating desktop-native grand strategy maps to web browsers. It addresses bottlenecks like PCIe texture uploads and browser memory sandboxing, advocating for delta updates and unmanaged WebAssembly linear memory to bypass garbage collection. It also details spatial lookup architectures, emphasizing GPU read-back and quadtrees for high-performance interaction.

- [**deterministic-web-based-multiplayer-systems.pdf**](./deterministic-web-based-multiplayer-systems.pdf)
  - **Title:** Technical Architecture of Deterministic Web-Based Multiplayer Systems: A Deep Analysis of WebRTC, Temporal Accumulators, and WebAssembly Memory Persistence
  - **Focus:** Building deterministic lockstep multiplayer architectures in browsers using WebRTC, fixed-step temporal accumulators, and WebAssembly linear memory.
  - **Summary:** This paper analyzes the synthesis of network protocols and execution models required for competitive, real-time web games. It highlights the superiority of WebRTC Data Channels over WebSockets to avoid Head-of-Line blocking and explains fixed-step accumulators for decoupled temporal execution. Finally, it details how WebAssembly linear memory serialization allows for instantaneous mid-session state recovery and rollback netcode without standard garbage collection overhead.

- [**gsg-ai-architecture.pdf**](./gsg-ai-architecture.pdf)
  - **Title:** Architectural Paradigms of Artificial Intelligence in Macroscopic Grand Strategy Games
  - **Focus:** AI decision frameworks, data-driven utility scoring pipelines, and strict concurrency models for macroscopic map-based strategy games.
  - **Summary:** This text examines how modern grand strategy engines calculate decisions for thousands of AI agents without stalling deterministic lockstep networks. It details the shift from rigid behavior trees to dynamic Utility AI pipelines, driven by personality archetypes and distributed via modulo-based temporal scheduling. The architecture requires strict read-lock/write-lock concurrency to evaluate complex, non-Euclidean pathfinding and macroeconomic metrics without triggering memory race conditions.

- [**gsg-engine-architectural-blueprint.pdf**](./gsg-engine-architectural-blueprint.pdf)
  - **Title:** Architectural Blueprint of a Map-Based Grand Strategy Engine: An Isotopic Analysis of Zero-Dependency Systems
  - **Focus:** The strict, Pareto-optimized architectural hierarchy and abstraction layers required to engineer a deterministic map-based grand strategy engine.
  - **Summary:** This blueprint defines five zero-dependency atomic pillars, descending from temporal serialization down to event-driven logic engines. It emphasizes abandoning traditional real-time physics manifolds in favor of discrete-time automatons, highly normalized relational entity registries, and non-Euclidean spatial graphs. The document mathematically proves that omitting foundational layers like deterministic fixed-point mathematics guarantees cascading structural failures and multiplayer desynchronization.

- [**high-performance-wasm-ui-binding.pdf**](./high-performance-wasm-ui-binding.pdf)
  - **Title:** High-Performance Architectural Patterns for WebAssembly-Driven Grand Strategy Game User Interfaces
  - **Focus:** Off-Main-Thread architecture and zero-copy memory bridging to bind deterministic WebAssembly game logic to responsive browser user interfaces.
  - **Summary:** This document outlines strategies for connecting WebAssembly simulations to web UIs without triggering catastrophic V8 garbage collection pauses. It recommends utilizing SharedArrayBuffers for a zero-copy memory bridge, while using Svelte 5 in a Web Worker to pass serialized UI mutation primitives off the main thread. It advocates for a hybrid rendering philosophy where virtualized HTML/CSS handles text-heavy menus and WebGL canvases render the unbounded density of the strategic map.

- [**paradox-map-creation-pipeline.pdf**](./paradox-map-creation-pipeline.pdf)
  - **Title:** The complete Paradox map creation pipeline
  - **Focus:** The technical specifications, file manifests, and modding pipelines for building maps in Paradox Interactive's Clausewitz and Jomini engines.
  - **Summary:** This guide details the foundational architecture of grand strategy maps for games like Europa Universalis IV, Hearts of Iron IV, Crusader Kings III, and Victoria 3. It explains the absolute necessity of pixel-perfect RGB province maps mapped to comma-separated definition files to construct the game's spatial database. The text also covers the evolution from the older 32-bit Clausewitz architecture to the modern 64-bit Jomini framework, which introduced 16-bit heightmaps and integrated map editors.

- [**wasm-scripting-api-boundry.pdf**](./wasm-scripting-api-boundry.pdf)
  - **Title:** The Scripting Boundary: Low-Level FFI Blueprints, QuickJS Memory Lifecycles, and Deterministic Intent Payloads for WebAssembly GSG Engines
  - **Focus:** Managing the Foreign Function Interface (FFI) boundary between WebAssembly linear memory, QuickJS interpreters, and Svelte Web Workers.
  - **Summary:** This text details how to orchestrate memory lifecycles and cross-thread communication in browser-native engines to ensure deterministic lockstep safety. It explains how to bypass FFI evaluation bottlenecks by compiling JavaScript modifiers into native C++ Reverse Polish Notation opcodes. Furthermore, it covers securing QuickJS AI callback memory via reference pinning and utilizing bitwise-packed binary intent payloads over SharedArrayBuffers to eliminate garbage collection overhead.

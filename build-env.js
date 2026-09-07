'use strict';

// Lune is now served by the Node application. Runtime secrets stay in the
// server environment and are never written into browser-readable files.
console.log('Lune uses server-side runtime environment variables; no client env bundle is generated.');

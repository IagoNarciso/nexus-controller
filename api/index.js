// api/index.js - Espião de Entrada Serverless
const app = require('../src/server.js');

module.exports = (req, res) => {
  console.log(`🕵️‍♂️ [Espião Vercel] Requisição recebida: ${req.method} ${req.url}`);
  console.log(`🕵️‍♂️ [Espião Vercel] Headers:`, JSON.stringify(req.headers));
  return app(req, res);
};
const rateLimit = require('express-rate-limit');

// Limitador estrito para a rota de login (máximo de 10 tentativas por IP a cada 15 minutos)
const limiterLogin = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de início de sessão a partir deste IP. Tente novamente após 15 minutos.' }
});

// Limitador geral para as rotas da API (evita spam de requisições)
const limiterGeral = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 120, // 120 requisições por minuto por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas requisições. Por favor, aguarde um momento.' }
});

module.exports = {
  limiterLogin,
  limiterGeral
};
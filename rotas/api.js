const express = require('express');
const router = express.Router();

// Importar rotas modulares
const authRoutes = require('./auth');
const livrosRoutes = require('./livros');
const rankingRoutes = require('./ranking');
const reservasRoutes = require('./reservas');
const iaRoutes = require('./ia');

// Registrar rotas
router.use('/auth', authRoutes);
router.use('/livros', livrosRoutes);
router.use('/ranking', rankingRoutes);
router.use('/reservas', reservasRoutes);
router.use('/ia', iaRoutes);

module.exports = router;
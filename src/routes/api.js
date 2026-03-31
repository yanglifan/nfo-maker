const express = require('express');
const { parseDouban, generateNfo } = require('../controllers/nfoController');

const router = express.Router();

router.post('/parse', parseDouban);
router.post('/generate', generateNfo);

module.exports = router;

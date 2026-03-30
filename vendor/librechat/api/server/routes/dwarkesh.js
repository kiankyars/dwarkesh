const express = require('express');

const router = express.Router();

router.get('/public-models', async (_req, res, next) => {
  try {
    const response = await fetchDwarkesh('/api/models');
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/public-chat', async (req, res, next) => {
  try {
    const response = await fetchDwarkesh('/api/public-chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch (error) {
    next(error);
  }
});

function getDwarkeshApiBase() {
  const baseUrl = process.env.DWARKESH_RAG_API_BASE;
  if (!baseUrl) {
    throw new Error('DWARKESH_RAG_API_BASE is not configured');
  }

  return baseUrl.replace(/\/+$/, '');
}

function fetchDwarkesh(pathname, init) {
  return fetch(`${getDwarkeshApiBase()}${pathname}`, init);
}

module.exports = router;

// Optional: run locally with "npm install" then "npm start". Netlify does not use this file.
require('dotenv').config();
const express = require('express');
const api = require('./netlify/functions/api'), stage2 = require('./netlify/functions/stage2');
const app = express();
app.use(express.json({ limit: '1mb' })); app.use(express.static('public'));
const adapt = h => async (req, res) => {
  const r = await h({ path: req.path, httpMethod: req.method, headers: req.headers, queryStringParameters: req.query,
    body: req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : null });
  res.status(r.statusCode).set(r.headers || {}).send(r.body);
};
app.all('/api/stage2/*', adapt(stage2.handler)); app.all('/api/*', adapt(api.handler));
app.listen(process.env.PORT || 8888, () => console.log('ScholarFind on http://localhost:' + (process.env.PORT || 8888)));

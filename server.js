require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state',      require('./api/state'));
app.put('/api/state',      require('./api/state'));
app.post('/api/chat',      require('./api/chat'));
app.post('/api/end-lesson', require('./api/end-lesson'));

app.listen(PORT, () => {
  console.log(`French Tutor running at http://localhost:${PORT}`);
});

const express = require('express');
const cors = require('cors');
const uploadRoutes = require('./uploadRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/upload', uploadRoutes);

app.listen(3001, () => console.log('Backend running on port 3001'));

require('dotenv').config();
const express = require('express');
const path = require('path');
const { createRoom } = require('./livekit-server');
const logger = require('./logger');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/join', (_req, res) => res.sendFile(path.join(__dirname, '../public/join.html')));
app.post('/rooms', createRoom);
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

module.exports = app;

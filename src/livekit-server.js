require('dotenv').config();
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const logger = require('./logger');

const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;

const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

async function makeToken(identity, roomName) {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, ttl: '2h' });
  token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  return await token.toJwt(); // v2 SDK: toJwt() is async — must await
}

async function createRoom(req, res) {
  const { userId = `user-${Date.now()}`, context = null } = req.body || {};
  const roomName = `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    await roomService.createRoom({ name: roomName, emptyTimeout: 600, maxParticipants: 10 });

    const hostJwt  = await makeToken(userId, roomName);
    const guestJwt = await makeToken(`guest-${Date.now()}`, roomName);

    const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const joinUrl  = `${BASE_URL}/join?room=${encodeURIComponent(roomName)}&token=${encodeURIComponent(guestJwt)}&lkUrl=${encodeURIComponent(LIVEKIT_URL)}`;

    logger.info({ roomName, userId, context }, 'room created');

    // Start AI bot in background (M2). Import lazily to avoid circular dep at require time.
    setImmediate(() => {
      require('./livekit-agent').startBot(roomName).catch((err) =>
        logger.error({ err: err.message, roomName }, 'bot failed to start'),
      );
    });

    res.json({ roomName, hostToken: hostJwt, guestToken: guestJwt, joinUrl, livekitUrl: LIVEKIT_URL });
  } catch (err) {
    logger.error({ err: err.message }, 'room creation failed');
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createRoom };

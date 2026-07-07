const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./config/db');

let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ── Auth middleware ────────────────────────────────────────────
  // Runs before every connection is accepted.
  // Attaches decoded user to socket.data.user if token is valid.
  // Public viewers connect without a token — that is allowed.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        // Invalid token — connect as anonymous (public viewer)
        socket.data.user = null;
      }
    } else {
      socket.data.user = null;
    }
    next();
  });

  // ── Connection handler ─────────────────────────────────────────
  io.on('connection', (socket) => {
    // Client sends: socket.emit('join:doc', { docId, linkType })
    socket.on('join:doc', async ({ docId, linkType }) => {
      if (!docId) return;

      // For private links — verify user has access
      if (linkType === 'private') {
        if (!socket.data.user) {
          socket.emit('error', { message: 'Authentication required' });
          return;
        }
        const access = await pool.query(
          `SELECT slr.id FROM share_link_recipients slr
           JOIN share_links sl ON sl.id = slr.share_link_id
           WHERE sl.document_id = $1 AND slr.email = $2`,
          [docId, socket.data.user.email]
        );
        if (access.rows.length === 0) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }
      }

      const room = `doc:${docId}`;
      socket.join(room);

      // Tell everyone in the room how many viewers there are now
      const count = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('viewers:count', { count });

      // Tell this specific socket it successfully joined
      socket.emit('joined:doc', { docId });
    });

    // Client sends: socket.emit('leave:doc', { docId })
    socket.on('leave:doc', ({ docId }) => {
      const room = `doc:${docId}`;
      socket.leave(room);

      const count = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('viewers:count', { count });
    });

    // Clean up on disconnect
    socket.on('disconnect', () => {
      // Socket.IO automatically removes the socket from all rooms.
      // We don't need to manually leave rooms on disconnect.
    });
  });

  return io;
}

// Called by documentController after a successful version upload
function emitDocUpdated(docId, payload) {
  if (!io) return;
  const eventName = payload.type || 'doc:updated';
  io.to(`doc:${docId}`).emit(eventName, payload);
}

// Called by documentController to get current viewer count
function getViewerCount(docId) {
  if (!io) return 0;
  return io.sockets.adapter.rooms.get(`doc:${docId}`)?.size || 0;
}

module.exports = { initSocket, emitDocUpdated, getViewerCount };

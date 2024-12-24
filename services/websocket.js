// services/websocket.js
class WebSocketService {
    constructor(wss, db) {
        this.wss = wss;
        this.db = db;
        this.init();
    }

    init() {
        this.wss.on('connection', (ws) => {
            console.log('New client connected');
            this.sendInitialStatus(ws);

            ws.on('close', () => {
                console.log('Client disconnected');
            });
        });
    }

    sendInitialStatus(ws) {
        this.db.all(`
            SELECT * FROM parking_slots 
            ORDER BY slot_number
        `, (err, slots) => {
            if (err) {
                console.error('Error fetching initial status:', err);
                return;
            }

            ws.send(JSON.stringify({
                type: 'init',
                data: slots
            }));
        });
    }

    broadcastUpdate(type, data) {
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type,
                    data
                }));
            }
        });
    }
}
module.exports = WebSocketService;
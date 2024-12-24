require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const wsPort = process.env.WEBSOCKET_PORT || 8080;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Database connection
const db = new sqlite3.Database('./parking.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initDatabase();
    }
});

// Initialize database tables
function initDatabase() {
    db.serialize(() => {
        // Parking slots table
        db.run(`
            CREATE TABLE IF NOT EXISTS parking_slots (
                id INTEGER PRIMARY KEY,
                slot_number INTEGER NOT NULL,
                is_occupied BOOLEAN DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Parking events table
        db.run(`
            CREATE TABLE IF NOT EXISTS parking_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                slot_number INTEGER,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Double parking events
        db.run(`
            CREATE TABLE IF NOT EXISTS double_parking_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location TEXT NOT NULL,
                resolved BOOLEAN DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Initialize parking slots if not exists
        db.get("SELECT COUNT(*) as count FROM parking_slots", (err, row) => {
            if (row.count === 0) {
                for (let i = 1; i <= 3; i++) {
                    db.run("INSERT INTO parking_slots (slot_number) VALUES (?)", [i]);
                }
                console.log('Initialized parking slots');
            }
        });
    });
}

// WebSocket server setup
const wss = new WebSocket.Server({ port: wsPort });

wss.on('error', (error) => {
    console.error('WebSocket Server Error:', error);
});

wss.on('connection', (ws) => {
    console.log('New client connected');
    sendInitialStatus(ws);

    ws.on('error', (error) => {
        console.error('WebSocket Client Error:', error);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

function sendInitialStatus(ws) {
    console.log('Sending initial status');
    db.all("SELECT * FROM parking_slots ORDER BY slot_number", (err, slots) => {
        if (err) {
            console.error('Error fetching initial status:', err);
            return;
        }
        const message = JSON.stringify({
            type: 'init',
            data: slots
        });
        console.log('Initial status:', message);
        ws.send(message);
    });
}

function broadcastUpdate(data) {
    console.log('Broadcasting update:', data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                type: 'update',
                data: data
            });
            client.send(message);
            console.log('Sent to client:', message);
        }
    });
}

// API Routes

// Update from Arduino with improved handling
app.post('/api/arduino/update', (req, res) => {
    console.log('Received update from Arduino:', req.body);
    const {
        slot1,
        slot2,
        slot3,
        doubleParkingMid1,
        doubleParkingMid2,
        availableSlots,
        sensorData
    } = req.body;

    // Update parking slots
    const updateSlot = (slotNum, isOccupied) => {
        db.run(`
            UPDATE parking_slots 
            SET is_occupied = ?, last_updated = CURRENT_TIMESTAMP 
            WHERE slot_number = ?
        `, [isOccupied ? 1 : 0, slotNum]);

        if (isOccupied) {
            db.run(`
                INSERT INTO parking_events (event_type, slot_number, details) 
                VALUES (?, ?, ?)
            `, ['occupy', slotNum, JSON.stringify(sensorData)]);
        }
    };

    updateSlot(1, slot1);
    updateSlot(2, slot2);
    updateSlot(3, slot3);

    // Handle double parking events
    if (doubleParkingMid1) {
        db.run(`
            INSERT INTO double_parking_events (location) 
            VALUES (?)
        `, ['Between Slot 1 and 2']);
    }
    if (doubleParkingMid2) {
        db.run(`
            INSERT INTO double_parking_events (location) 
            VALUES (?)
        `, ['Between Slot 2 and 3']);
    }

    // Get updated status and broadcast with available slots
    db.all("SELECT * FROM parking_slots ORDER BY slot_number", (err, slots) => {
        if (err) {
            console.error('Error fetching updated status:', err);
        } else {
            const updateData = {
                slots: slots,
                doubleParkingMid1: doubleParkingMid1,
                doubleParkingMid2: doubleParkingMid2,
                availableSlots: availableSlots // Explicitly include available slots
            };
            console.log('Broadcasting update data:', updateData);
            broadcastUpdate(updateData);
        }
    });

    res.json({ success: true });
});

// Booking endpoint
app.post('/api/parking/book', (req, res) => {
    const { slot_number, start_time, end_time } = req.body;
    console.log(`Received booking request: Slot ${slot_number} from ${start_time} to ${end_time}`);

    db.all("SELECT * FROM bookings WHERE slot_number = ? AND ((start_time BETWEEN ? AND ?) OR (end_time BETWEEN ? AND ?))", [slot_number, start_time, end_time, start_time, end_time], (err, bookings) => {
        if (err) {
            console.error('Error fetching bookings:', err);
            res.status(500).json({ success: false, message: 'Database error' });
            return;
        }

        if (bookings.length === 0) {
            db.run(`
                INSERT INTO bookings (slot_number, start_time, end_time) 
                VALUES (?, ?, ?)
            `, [slot_number, start_time, end_time], (err) => {
                if (err) {
                    console.error('Error inserting booking:', err);
                    res.status(500).json({ success: false, message: 'Database error' });
                    return;
                }

                // Update parking events to store end_time
                db.run(`
                    INSERT INTO parking_events (event_type, slot_number, details) 
                    VALUES (?, ?, ?)
                `, ['book', slot_number, `Booked until ${end_time}`], (err) => {
                    if (err) {
                        console.error('Error inserting event:', err);
                        res.status(500).json({ success: false, message: 'Database error' });
                        return;
                    }

                    // Broadcast the booking update to WebSocket clients
                    const updateData = { slot_number, start_time, end_time };
                    console.log('Broadcasting booking:', updateData);
                    broadcastUpdate(updateData);

                    res.json({ success: true, message: `Slot ${slot_number} booked from ${start_time} to ${end_time}` });
                });
            });
        } else {
            res.json({ success: false, message: 'Slot is already booked for the specified time' });
        }
    });
});
// Other routes remain the same...
app.get('/api/parking/status', (req, res) => {
    db.all(`
        SELECT 
            ps.*,
            (SELECT COUNT(*) FROM parking_events 
             WHERE slot_number = ps.slot_number 
             AND DATE(timestamp) = DATE('now')
            ) as today_events
        FROM parking_slots ps
        ORDER BY slot_number
    `, (err, rows) => {
        if (err) {
            console.error('Error fetching status:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        console.log('Sending status:', rows);
        res.json(rows);
    });
});

app.get('/api/parking/events', (req, res) => {
    const limit = req.query.limit || 50;
    db.all(`
        SELECT * FROM parking_events 
        ORDER BY timestamp DESC 
        LIMIT ?
    `, [limit], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/api/parking/alerts', (req, res) => {
    db.all(`
        SELECT * FROM double_parking_events 
        WHERE resolved = 0 
        ORDER BY timestamp DESC
    `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/api/parking/stats', (req, res) => {
    db.all(`
        SELECT 
            (SELECT COUNT(*) FROM parking_events WHERE DATE(timestamp) = DATE('now')) as today_events,
            (SELECT COUNT(*) FROM parking_slots WHERE is_occupied = 1) as occupied_slots,
            (SELECT COUNT(*) FROM double_parking_events WHERE resolved = 0) as active_alerts,
            (SELECT COUNT() FROM parking_slots) - (SELECT COUNT() FROM parking_slots WHERE is_occupied = 1) as available_slots
    `, (err, rows) => {
        if (err) {
            console.error('Error fetching parking stats:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        console.log('Sending stats:', rows[0]);
        res.json(rows[0]);
    });
});
// Endpoint to get slot bookings
app.get('/api/parking/bookings/:slot_number', (req, res) => {
    const slot_number = req.params.slot_number;
    db.all("SELECT * FROM bookings WHERE slot_number = ? ORDER BY start_time", [slot_number], (err, rows) => {
        if (err) {
            console.error('Error fetching bookings:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});
// Booking endpoint


// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: err.message
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`WebSocket server running on port ${wsPort}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server and database...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        }
        process.exit(err ? 1 : 0);
    });
});
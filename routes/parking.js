// routes/parking.js
const express = require('express');
const router = express.Router();

module.exports = (db, wss) => {
// Get current parking status
router.get('/status', (req, res) => {
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
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get parking statistics
router.get('/stats', (req, res) => {
    db.all(`
            SELECT 
                COUNT(*) as total_events,
                SUM(CASE WHEN event_type = 'occupy' THEN 1 ELSE 0 END) as total_parking,
                SUM(CASE WHEN DATE(timestamp) = DATE('now') THEN 1 ELSE 0 END) as today_events
            FROM parking_events
        `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows[0]);
    });
});

// Get recent parking events
router.get('/events', (req, res) => {
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

// Get active double parking alerts
router.get('/alerts', (req, res) => {
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

// Resolve double parking alert
router.post('/alerts/:id/resolve', (req, res) => {
    db.run(`
            UPDATE double_parking_events 
            SET resolved = 1 
            WHERE id = ?
        `, [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

return router;
});
const initDatabase = (db) => {
    db.serialize(() => {
        // Parking slots table
        db.run(`CREATE TABLE IF NOT EXISTS parking_slots (
            id INTEGER PRIMARY KEY,
            slot_number INTEGER NOT NULL,
            is_occupied BOOLEAN DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Parking events table
        db.run(`CREATE TABLE IF NOT EXISTS parking_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            slot_number INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Double parking events
        db.run(`CREATE TABLE IF NOT EXISTS double_parking_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            location TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved BOOLEAN DEFAULT 0
        )`);

        // Initialize parking slots if not exists
        db.get("SELECT COUNT(*) as count FROM parking_slots", (err, row) => {
            if (row.count === 0) {
                db.run("INSERT INTO parking_slots (slot_number) VALUES (1)");
                db.run("INSERT INTO parking_slots (slot_number) VALUES (2)");
                db.run("INSERT INTO parking_slots (slot_number) VALUES (3)");
            }
        });
    });
};

module.exports = { initDatabase };
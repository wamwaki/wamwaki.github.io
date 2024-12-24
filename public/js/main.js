class ParkingSystem {
    constructor() {
        this.connectWebSocket();
        this.initializeEventListeners();
        this.fetchInitialData();
    }

    connectWebSocket() {
        this.ws = new WebSocket('ws://localhost:8080');
        console.log('Connecting to WebSocket...');

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.updateConnectionStatus('connected');
        };

        this.ws.onmessage = (event) => {
            console.log('WebSocket message received:', event.data);
            const data = JSON.parse(event.data);
            this.updateDisplay(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus('error');
        };

        this.ws.onclose = () => {
            console.log('WebSocket closed, reconnecting...');
            this.updateConnectionStatus('disconnected');
            setTimeout(() => this.connectWebSocket(), 2000);
        };
    }

    async fetchInitialData() {
        try {
            const [status, stats, events] = await Promise.all([
                fetch('/api/parking/status').then(r => r.json()),
                fetch('/api/parking/stats').then(r => r.json()),
                fetch('/api/parking/events').then(r => r.json())
            ]);

            console.log('Fetched status:', status);
            console.log('Fetched stats:', stats);
            console.log('Fetched events:', events);

            this.updateParkingDisplay(status);
            this.updateStats(stats);
            this.updateEventsList(events);
        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    }

    updateDisplay(data) {
        console.log('Received data:', data);

        if (data.type === 'update') {
            this.updateParkingDisplay(data.data.slots);
            this.updateDoubleParkingAlerts(data.data);
            this.fetchEventsList();
        } else if (data.type === 'init') {
            this.updateParkingDisplay(data.data);
        } else if (data.type === 'booking') {
            this.notifyBooking(data.data);
        }
    }

    updateParkingDisplay(slots) {
        slots.forEach(slot => {
            const slotElement = document.getElementById(`slot${slot.slot_number}Container`);
            if (slotElement) {
                const statusElement = slotElement.querySelector('.parking-slot');
                statusElement.className = `parking-slot p-6 rounded-lg text-center ${slot.is_occupied ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`;

                const lastUpdate = slotElement.querySelector(`#slot${slot.slot_number}LastUpdate`);
                if (lastUpdate) {
                    lastUpdate.textContent = `Last updated: ${new Date(slot.last_updated).toLocaleTimeString()}`;
                }

                const bookButton = slotElement.querySelector(`#slot${slot.slot_number}BookButton`);
                if (bookButton) {
                    bookButton.style.display = slot.is_occupied ? 'none' : 'block';
                }
            }
        });
    }

    updateStats(stats) {
        console.log('Updating stats:', stats);

        const totalSlotsElement = document.getElementById('totalSlots');
        const totalSlots = 3; // Assuming the total slots is a constant value.

        if (totalSlotsElement) {
            totalSlotsElement.textContent = totalSlots;
            console.log('Total Slots:', totalSlots);
        } else {
            console.warn('Element #totalSlots not found');
        }

        const totalEventsElement = document.getElementById('totalEvents');
        if (totalEventsElement) {
            totalEventsElement.textContent = stats.today_events || 0;
            console.log('Total Events:', stats.today_events);
        } else {
            console.warn('Element #totalEvents not found');
        }
    }

    updateDoubleParkingAlerts(data) {
        const alert1 = document.getElementById('doubleParkingAlert1');
        const alert2 = document.getElementById('doubleParkingAlert2');

        if (alert1) alert1.style.display = data.doubleParkingMid1 ? 'block' : 'none';
        if (alert2) alert2.style.display = data.doubleParkingMid2 ? 'block' : 'none';

        if (data.doubleParkingMid1 || data.doubleParkingMid2) {
            this.playAlertSound();
        }
    }

    async fetchEventsList() {
        try {
            const response = await fetch('/api/parking/events');
            const events = await response.json();
            this.updateEventsList(events);
        } catch (error) {
            console.error('Error fetching events:', error);
        }
    }

    updateEventsList(events) {
            const eventsList = document.getElementById('eventsList');
            if (!eventsList) return;

            eventsList.innerHTML = '';
            events.forEach(event => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                <td class="border px-6 py-4">${new Date(event.timestamp).toLocaleString()}</td>
                <td class="border px-6 py-4">${event.event_type}</td>
                <td class="border px-6 py-4">${event.event_type === 'double_parking' ? event.location : `Slot ${event.slot_number}`}</td>
            `;
            eventsList.appendChild(row);
        });
    }

    updateConnectionStatus(status) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        if (!statusDot || !statusText) return;

        switch (status) {
            case 'connected':
                statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-green-500';
                statusText.textContent = 'Connected';
                break;
            case 'disconnected':
                statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-red-500';
                statusText.textContent = 'Disconnected';
                break;
            case 'error':
                statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-yellow-500';
                statusText.textContent = 'Error';
                break;
        }
    }

    playAlertSound() {
        const audio = new Audio('/alert.mp3');
        audio.play().catch(error => console.log('Error playing alert sound:', error));
    }

    initializeEventListeners() {
        const bookingButtons = document.querySelectorAll('.booking-button');
        bookingButtons.forEach(button => {
            button.addEventListener('click', this.handleBookingButtonClick.bind(this));
        });

        const bookingForms = document.querySelectorAll('.booking-form');
        bookingForms.forEach(form => {
            form.addEventListener('submit', this.handleBookingSubmit.bind(this));
        });

        const dropdownButtons = document.querySelectorAll('.dropdown-button');
        dropdownButtons.forEach(button => {
            button.addEventListener('click', this.toggleDropdownMenu.bind(this));
        });

        // Initialize Flatpickr on datetime inputs with "OK" button
        flatpickr('.booking-start-time', {
            enableTime: true,
            dateFormat: "Y-m-d H:i",
            onClose: function(selectedDates, dateStr, instance) {
                instance.input.setAttribute('data-selected', dateStr);
            },
            onReady: function(selectedDates, dateStr, instance) {
                const okButton = document.createElement('button');
                okButton.className = 'bg-green-500 text-white px-4 py-2 rounded mt-2';
                okButton.textContent = 'OK';
                okButton.addEventListener('click', () => {
                    const dateSelected = instance.input.getAttribute('data-selected');
                    if (dateSelected) {
                        alert(`Selected Start Time: ${dateSelected}`);
                    }
                    instance.close();
                });
                instance.calendarContainer.appendChild(okButton);
            }
        });

                flatpickr('.booking-end-time', {
            enableTime: true,
            dateFormat: "Y-m-d H:i",
            onClose: function(selectedDates, dateStr, instance) {
                instance.input.setAttribute('data-selected', dateStr);
            },
            onReady: function(selectedDates, dateStr, instance) {
                const okButton = document.createElement('button');
                okButton.className = 'bg-green-500 text-white px-4 py-2 rounded mt-2';
                okButton.textContent = 'OK';
                okButton.addEventListener('click', () => {
                    const dateSelected = instance.input.getAttribute('data-selected');
                    if (dateSelected) {
                        alert(`Selected End Time: ${dateSelected}`);
                    }
                    instance.close();
                });
                instance.calendarContainer.appendChild(okButton);
            }
        });
    }

    async handleBookingButtonClick(event) {
        const button = event.target;
        const form = button.nextElementSibling;
        form.classList.toggle('hidden');

        const slotNumber = form.querySelector('.slot-number').value;
        try {
            const bookings = await fetch(`/api/parking/bookings/${slotNumber}`).then(r => r.json());
            const dropdownMenu = form.querySelector('.dropdown-menu tbody');
            dropdownMenu.innerHTML = bookings.map(booking => `
                <tr>
                    <td>${booking.number_plate}</td>
                    <td>${new Date(booking.start_time).toLocaleString()}</td>
                    <td>${new Date(booking.end_time).toLocaleString()}</td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error fetching bookings:', error);
        }
    }

    toggleDropdownMenu(event) {
        const button = event.target;
        const dropdownMenu = button.nextElementSibling;
        dropdownMenu.classList.toggle('hidden');
    }

    handleBookingSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const slotNumber = form.querySelector('.slot-number').value;
        const carNumberPlate = form.querySelector('.car-number-plate').value;
        const startTime = form.querySelector('.booking-start-time').getAttribute('data-selected');
        const endTime = form.querySelector('.booking-end-time').getAttribute('data-selected');

        console.log(`Booking slot ${slotNumber} from ${startTime} to ${endTime} for car ${carNumberPlate}`);

        // Send booking request to the server
        fetch('/api/parking/book', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                slot_number: slotNumber,
                number_plate: carNumberPlate,
                start_time: startTime,
                end_time: endTime
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Booking response:', data);
            if (data.success) {
                alert('Booking successful!');
                // Notify other users
                this.ws.send(JSON.stringify({ type: 'booking', data: { slot_number: slotNumber, number_plate: carNumberPlate, start_time: startTime, end_time: endTime } }));
            } else {
                alert('Booking failed. Slot is already booked for the specified time.');
            }
        })
        .catch(error => {
            console.error('Error booking slot:', error);
            alert('An error occurred. Please try again.');
        });
    }

    notifyBooking(data) {
        alert(`Slot ${data.slot_number} has been booked for car ${data.number_plate} from ${data.start_time} to ${data.end_time}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.parkingSystem = new ParkingSystem();

    const slots = [
        { id: 1, is_occupied: 0 },
        { id: 2, is_occupied: 1 },
        { id: 3, is_occupied: 0 }
    ];

    slots.forEach(slot => {
        const slotElement = document.getElementById(`slot${slot.id}Container`);
        if (slotElement) {
            if (slot.is_occupied === 1) {
                slotElement.classList.add('occupied');
                slotElement.classList.remove('available');
            } else {
                slotElement.classList.add('available');
                slotElement.classList.remove('occupied');
            }

            console.log(`Slot ${slot.id} status: ${slot.is_occupied ? 'Occupied' : 'Available'}`);
        } else {
            console.warn(`Element with ID slot${slot.id}Container not found.`);
        }
    });
});
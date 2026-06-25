const API = '';
let selectedEventId = null;

// ─── Events ──────────────────────────────────────────────────────────────────
async function loadEvents() {
  try {
    const res = await fetch(`${API}/api/admin/events`);
    const data = await res.json();
    renderEvents(data.events);
  } catch (err) {
    console.error('Failed to load events:', err);
  }
}

function renderEvents(evts) {
  const tbody = document.getElementById('eventsTableBody');
  const empty = document.getElementById('eventsEmpty');

  if (!evts.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = evts.map(e => {
    const safeName = e.eventName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `
    <tr class="event-card ${e.eventId === selectedEventId ? 'selected' : ''}" onclick="selectEvent('${e.eventId}', '${safeName}')">
      <td><strong>${e.eventName}</strong><br><small style="color:#6b7280">${e.eventId}</small></td>
      <td>${e.eventType}</td>
      <td><span class="status-${e.status}">${e.status.toUpperCase()}</span></td>
      <td>${e.maxTrainerSlots}T / ${e.maxTraineeSlots}Tr</td>
      <td>${e.attendeeCount}</td>
      <td>
        <button class="btn btn-sm ${e.status === 'open' ? 'btn-danger' : 'btn-primary'}" onclick="event.stopPropagation(); toggleEventStatus('${e.eventId}', '${e.status}')">${e.status === 'open' ? 'Close' : 'Open'}</button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteEvent('${e.eventId}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function showAddEvent() {
  const form = document.getElementById('addEventForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') {
    document.getElementById('newEventName').focus();
  }
}

async function handleCreateEvent() {
  const nameInput = document.getElementById('newEventName');
  const name = nameInput.value.trim();
  if (!name) {
    toast('Event name is required');
    nameInput.focus();
    return;
  }

  try {
    const res = await fetch(`${API}/api/admin/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: name,
        eventType: document.getElementById('newEventType').value,
        maxTrainerSlots: parseInt(document.getElementById('newMaxTrainers').value) || 1,
        maxTraineeSlots: parseInt(document.getElementById('newMaxTrainees').value) || 3,
      })
    });

    if (!res.ok) {
      const err = await res.json();
      toast(err.message || 'Failed to create event');
      return;
    }

    nameInput.value = '';
    document.getElementById('addEventForm').style.display = 'none';
    toast('Event created');
    loadEvents();
  } catch (err) {
    console.error('Create event error:', err);
    toast('Network error creating event');
  }
}

async function toggleEventStatus(eventId, currentStatus) {
  const newStatus = currentStatus === 'open' ? 'closed' : 'open';
  await fetch(`${API}/api/admin/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus })
  });
  toast(`Event ${newStatus}`);
  loadEvents();
}

async function deleteEvent(eventId) {
  if (!confirm('Delete this event and all its attendees?')) return;
  await fetch(`${API}/api/admin/events/${eventId}`, { method: 'DELETE' });
  if (selectedEventId === eventId) {
    selectedEventId = null;
    document.getElementById('attendeesSection').style.display = 'none';
  }
  toast('Event deleted');
  loadEvents();
}

// ─── Attendees ───────────────────────────────────────────────────────────────
function selectEvent(eventId, eventName) {
  selectedEventId = eventId;
  document.getElementById('selectedEventName').textContent = eventName;
  document.getElementById('attendeesSection').style.display = 'block';
  loadAttendees();
  loadEvents();
}

async function loadAttendees() {
  if (!selectedEventId) return;
  try {
    const res = await fetch(`${API}/api/admin/events/${selectedEventId}/attendees`);
    const data = await res.json();
    renderAttendees(data.attendees);
  } catch (err) {
    console.error('Failed to load attendees:', err);
  }
}

function renderAttendees(attendees) {
  const tbody = document.getElementById('attendeesTableBody');
  const empty = document.getElementById('attendeesEmpty');

  if (!attendees.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = attendees.map(a => `
    <tr>
      <td><strong>${a.name}</strong></td>
      <td>${a.company || '—'}</td>
      <td>${a.crew || '—'}</td>
      <td><span class="role-badge role-${a.role}">${a.role}</span></td>
      <td style="color:#6b7280">${a.phone}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="removeAttendee('${a.attendeeId}')">✕</button>
      </td>
    </tr>
  `).join('');
}

function showAddAttendee() {
  const form = document.getElementById('addAttendeeForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') {
    document.getElementById('newAttendeeName').focus();
  }
}

async function addAttendee() {
  const name = document.getElementById('newAttendeeName').value.trim();
  const phone = document.getElementById('newAttendeePhone').value.trim();
  const role = document.getElementById('newAttendeeRole').value;

  if (!name || !phone) { toast('Name and phone required'); return; }

  try {
    await fetch(`${API}/api/admin/events/${selectedEventId}/attendees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        company: document.getElementById('newAttendeeCompany').value.trim(),
        crew: document.getElementById('newAttendeeCrew').value.trim(),
        role,
        phone
      })
    });

    document.getElementById('newAttendeeName').value = '';
    document.getElementById('newAttendeeCompany').value = '';
    document.getElementById('newAttendeeCrew').value = '';
    document.getElementById('newAttendeePhone').value = '';
    document.getElementById('addAttendeeForm').style.display = 'none';
    toast('Attendee added');
    loadAttendees();
    loadEvents();
  } catch (err) {
    console.error('Add attendee error:', err);
    toast('Network error adding attendee');
  }
}

async function removeAttendee(attendeeId) {
  await fetch(`${API}/api/admin/events/${selectedEventId}/attendees/${attendeeId}`, { method: 'DELETE' });
  toast('Attendee removed');
  loadAttendees();
  loadEvents();
}

// ─── Code Log ────────────────────────────────────────────────────────────────
function logCode(attendeeName, eventName) {
  const logDiv = document.getElementById('codeLog');
  const emptyDiv = document.getElementById('logEmpty');
  if (emptyDiv) emptyDiv.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span style="color:#6b7280">[${new Date().toLocaleTimeString()}]</span> Code sent to <strong>${attendeeName}</strong> for <em>${eventName}</em> — <span class="code">check server terminal</span>`;
  logDiv.prepend(entry);
}

function clearLog() {
  document.getElementById('codeLog').innerHTML = '<div class="empty" id="logEmpty">Codes will appear here when Unity requests verification...</div>';
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('createEventBtn').addEventListener('click', () => {
    console.log('Create button clicked');
    handleCreateEvent();
  });

  loadEvents();
});

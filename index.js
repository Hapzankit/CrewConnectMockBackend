const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 5055;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Dynamic Event & Attendee Storage ────────────────────────────────────────
let nextEventNum = 1001;
let nextAttendeeNum = 1;

const events = [
  {
    eventId: "event_1001",
    eventName: "Brava Roof Training 1",
    eventType: "multiplayer",
    status: "open",
    photonSessionName: "cc_event_1001",
    maxTrainerSlots: 1,
    maxTraineeSlots: 3,
    observersAllowed: true,
  },
];

// Attendees keyed by eventId
const attendeesByEvent = {
  event_1001: [
    { attendeeId: "att_001", name: "John Mitchell", company: "Brava Roofing Co.", crew: "Alpha", role: "trainer", phone: "9999991111" },
    { attendeeId: "att_002", name: "Sarah Chen", company: "Brava Roofing Co.", crew: "Alpha", role: "trainee", phone: "9999992222" },
    { attendeeId: "att_003", name: "Marcus Johnson", company: "Summit Installations", crew: "Bravo", role: "trainee", phone: "9999993333" },
    { attendeeId: "att_004", name: "Emily Rodriguez", company: "Summit Installations", crew: "Bravo", role: "trainee", phone: "9999994444" },
    { attendeeId: "att_005", name: "David Park", company: "Brava Roofing Co.", crew: "Alpha", role: "observer", phone: "9999995555" },
  ],
};

// ─── In-Memory Session State (per event) ─────────────────────────────────────
// eventId → { activeTrainerUserId, traineeSlots[], participants{}, roomCreated, pendingCodes{} }
const sessionState = {};

function getSessionState(eventId) {
  if (!sessionState[eventId]) {
    const evt = events.find((e) => e.eventId === eventId);
    const maxTrainees = evt ? evt.maxTraineeSlots : 3;
    const slots = [];
    for (let i = 1; i <= maxTrainees; i++) {
      slots.push({ slotId: `trainee_${i}`, userId: null, status: "vacant" });
    }
    sessionState[eventId] = {
      activeTrainerUserId: null,
      traineeSlots: slots,
      participants: {},
      roomCreated: false,
      pendingCodes: {},
    };
  }
  return sessionState[eventId];
}

// Generate a random 3-digit short code
function generateShortCode() {
  return String(Math.floor(100 + Math.random() * 900));
}

// ─── Root endpoint ───────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ADMIN API (used by frontend) ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/events ───────────────────────────────────────────────────
app.get("/api/admin/events", (req, res) => {
  const result = events.map((e) => ({
    ...e,
    attendeeCount: (attendeesByEvent[e.eventId] || []).length,
  }));
  res.json({ success: true, events: result });
});

// ─── POST /api/admin/events ──────────────────────────────────────────────────
app.post("/api/admin/events", (req, res) => {
  const { eventName, eventType, maxTrainerSlots, maxTraineeSlots, observersAllowed } = req.body;

  if (!eventName) {
    return res.status(400).json({ success: false, message: "eventName is required" });
  }

  nextEventNum++;
  const eventId = `event_${nextEventNum}`;
  const newEvent = {
    eventId,
    eventName,
    eventType: eventType || "multiplayer",
    status: "open",
    photonSessionName: `cc_${eventId}`,
    maxTrainerSlots: maxTrainerSlots || 1,
    maxTraineeSlots: maxTraineeSlots || 3,
    observersAllowed: observersAllowed !== false,
  };

  events.push(newEvent);
  attendeesByEvent[eventId] = [];

  console.log(`[ADMIN] Created event: ${eventName} (${eventId})`);
  res.json({ success: true, event: newEvent });
});

// ─── DELETE /api/admin/events/:eventId ───────────────────────────────────────
app.delete("/api/admin/events/:eventId", (req, res) => {
  const { eventId } = req.params;
  const idx = events.findIndex((e) => e.eventId === eventId);
  if (idx === -1) return res.status(404).json({ success: false, message: "Event not found" });

  events.splice(idx, 1);
  delete attendeesByEvent[eventId];
  delete sessionState[eventId];

  res.json({ success: true, message: `Event ${eventId} deleted.` });
});

// ─── PATCH /api/admin/events/:eventId ────────────────────────────────────────
app.patch("/api/admin/events/:eventId", (req, res) => {
  const { eventId } = req.params;
  const evt = events.find((e) => e.eventId === eventId);
  if (!evt) return res.status(404).json({ success: false, message: "Event not found" });

  const { status, eventName, maxTrainerSlots, maxTraineeSlots, observersAllowed } = req.body;
  if (status) evt.status = status;
  if (eventName) evt.eventName = eventName;
  if (maxTrainerSlots !== undefined) evt.maxTrainerSlots = maxTrainerSlots;
  if (maxTraineeSlots !== undefined) evt.maxTraineeSlots = maxTraineeSlots;
  if (observersAllowed !== undefined) evt.observersAllowed = observersAllowed;

  res.json({ success: true, event: evt });
});

// ─── GET /api/admin/events/:eventId/attendees ────────────────────────────────
app.get("/api/admin/events/:eventId/attendees", (req, res) => {
  const { eventId } = req.params;
  const list = attendeesByEvent[eventId];
  if (!list) return res.status(404).json({ success: false, message: "Event not found" });

  res.json({ success: true, eventId, attendees: list });
});

// ─── POST /api/admin/events/:eventId/attendees ───────────────────────────────
app.post("/api/admin/events/:eventId/attendees", (req, res) => {
  const { eventId } = req.params;
  const list = attendeesByEvent[eventId];
  if (!list) return res.status(404).json({ success: false, message: "Event not found" });

  const { name, company, crew, role, phone } = req.body;
  if (!name || !phone || !role) {
    return res.status(400).json({ success: false, message: "name, phone, and role are required" });
  }

  nextAttendeeNum++;
  const attendeeId = `att_${String(nextAttendeeNum).padStart(3, "0")}`;
  const attendee = { attendeeId, name, company: company || "", crew: crew || "", role, phone };
  list.push(attendee);

  console.log(`[ADMIN] Added attendee: ${name} (${role}) to ${eventId}`);
  res.json({ success: true, attendee });
});

// ─── DELETE /api/admin/events/:eventId/attendees/:attendeeId ─────────────────
app.delete("/api/admin/events/:eventId/attendees/:attendeeId", (req, res) => {
  const { eventId, attendeeId } = req.params;
  const list = attendeesByEvent[eventId];
  if (!list) return res.status(404).json({ success: false, message: "Event not found" });

  const idx = list.findIndex((a) => a.attendeeId === attendeeId);
  if (idx === -1) return res.status(404).json({ success: false, message: "Attendee not found" });

  list.splice(idx, 1);
  res.json({ success: true, message: `Attendee ${attendeeId} removed.` });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── VR API (used by Unity) ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/vr/events/available ────────────────────────────────────────────
app.get("/api/vr/events/available", (req, res) => {
  const available = events
    .filter((e) => e.status === "open")
    .map((e) => ({ ...e, joinWindowOpen: true }));
  res.json({ events: available });
});

// ─── GET /api/vr/events/:eventId/roster ──────────────────────────────────────
// Step 4: Unity shows roster of pre-added attendees (name + company/crew, NO phone numbers)
app.get("/api/vr/events/:eventId/roster", (req, res) => {
  const { eventId } = req.params;
  const list = attendeesByEvent[eventId];

  if (!list) {
    return res.status(404).json({ success: false, message: "Event not found" });
  }

  // Return attendees without phone numbers
  const roster = list.map(({ attendeeId, name, company, crew, role }) => ({
    attendeeId,
    name,
    company,
    crew,
    role,
  }));

  res.json({ success: true, eventId, roster });
});

// ─── POST /api/vr/events/:eventId/send-code ─────────────────────────────────
// Step 6: User selects their name → CrewConnect texts a short code to the attendee
app.post("/api/vr/events/:eventId/send-code", (req, res) => {
  const { eventId } = req.params;
  const { attendeeId } = req.body;

  if (!attendeeId) {
    return res.status(400).json({ success: false, message: "attendeeId is required" });
  }

  const list = attendeesByEvent[eventId];
  if (!list) return res.status(404).json({ success: false, message: "Event not found" });

  const attendee = list.find((a) => a.attendeeId === attendeeId);
  if (!attendee) {
    return res.status(404).json({ success: false, message: "Attendee not found in roster" });
  }

  const ss = getSessionState(eventId);
  const code = generateShortCode();
  ss.pendingCodes[attendeeId] = {
    code,
    expiresAt: Date.now() + 300000, // 5 minutes
    eventId,
  };

  console.log(`[CODE] Sent "${code}" via SMS to ${attendee.name} (${attendee.phone}) for event ${eventId}`);

  res.json({
    success: true,
    codeLength: 3,
    expiresInSeconds: 300,
    message: `Verification code sent to ${attendee.name}.`,
  });
});

// ─── POST /api/vr/events/:eventId/verify-and-join ────────────────────────────
// Steps 7-9: User enters code → verify → return role, slot, Photon info
app.post("/api/vr/events/:eventId/verify-and-join", (req, res) => {
  const { eventId } = req.params;
  const { attendeeId, code } = req.body;

  if (!attendeeId || !code) {
    return res.status(400).json({ success: false, message: "attendeeId and code are required" });
  }

  const evt = events.find((e) => e.eventId === eventId);
  if (!evt) return res.status(404).json({ success: false, message: "Event not found" });

  const ss = getSessionState(eventId);

  // Verify the code
  const pending = ss.pendingCodes[attendeeId];
  if (!pending) {
    return res.status(401).json({ success: false, message: "No verification code was sent for this attendee. Request a new code." });
  }

  if (pending.eventId !== eventId) {
    return res.status(401).json({ success: false, message: "Code was issued for a different event." });
  }

  if (Date.now() > pending.expiresAt) {
    delete ss.pendingCodes[attendeeId];
    return res.status(401).json({ success: false, message: "Code expired. Request a new one." });
  }

  if (pending.code !== code) {
    return res.status(401).json({ success: false, message: "Invalid code." });
  }

  // Code valid — consume it
  delete ss.pendingCodes[attendeeId];

  if (evt.status !== "open") {
    return res.status(403).json({ success: false, message: "Event is closed." });
  }

  const list = attendeesByEvent[eventId];
  const attendee = list.find((a) => a.attendeeId === attendeeId);
  const userId = `user_${attendeeId}`;
  let activeSessionRole = attendee.role;
  let slotId = null;
  let isPrimaryTrainer = false;
  let createdPhotonRoomByThisUser = false;

  // Role assignment logic
  if (attendee.role === "trainer") {
    if (!ss.activeTrainerUserId) {
      ss.activeTrainerUserId = userId;
      isPrimaryTrainer = true;
      activeSessionRole = "trainer";
    } else {
      activeSessionRole = "observer";
    }
  } else if (attendee.role === "trainee") {
    const vacantSlot = ss.traineeSlots.find((s) => s.status === "vacant");
    if (vacantSlot) {
      vacantSlot.userId = userId;
      vacantSlot.status = "occupied";
      slotId = vacantSlot.slotId;
      activeSessionRole = "trainee";
    } else {
      activeSessionRole = "observer";
    }
  } else {
    activeSessionRole = "observer";
  }

  // Room creation
  if (!ss.roomCreated) {
    ss.roomCreated = true;
    createdPhotonRoomByThisUser = true;
  }

  // Track participant
  ss.participants[userId] = {
    attendeeId,
    userId,
    displayName: attendee.name,
    eventRole: attendee.role,
    activeSessionRole,
    slotId,
    lastHeartbeat: Date.now(),
  };

  console.log(`[JOIN] ${attendee.name} → ${activeSessionRole} (slot: ${slotId || "none"})`);

  res.json({
    success: true,
    accessToken: `mock_access_token_${userId}`,
    user: {
      userId,
      attendeeId,
      displayName: attendee.name,
      company: attendee.company,
      crew: attendee.crew,
    },
    event: {
      ...evt,
      joinWindowOpen: evt.status === "open",
    },
    roleAssignment: {
      eventRole: attendee.role,
      activeSessionRole,
      slotId,
      isPrimaryTrainer,
    },
    photon: {
      photonSessionName: evt.photonSessionName,
      oneEventOneRoom: true,
      roomAlreadyCreated: !createdPhotonRoomByThisUser && ss.roomCreated,
      createdPhotonRoomByThisUser,
    },
  });
});

// ─── GET /api/vr/events/:eventId/session-status ──────────────────────────────
app.get("/api/vr/events/:eventId/session-status", (req, res) => {
  const { eventId } = req.params;
  const evt = events.find((e) => e.eventId === eventId);
  if (!evt) return res.status(404).json({ success: false, message: "Event not found" });

  const ss = getSessionState(eventId);
  const availableTraineeSlots = ss.traineeSlots.filter((s) => s.status === "vacant").length;

  res.json({
    success: true,
    eventId,
    status: evt.status,
    photonSessionName: evt.photonSessionName,
    roomCreated: ss.roomCreated,
    activeTrainerUserId: ss.activeTrainerUserId,
    activeTraineeSlots: ss.traineeSlots,
    availableTraineeSlots,
    observersAllowed: evt.observersAllowed,
  });
});

// ─── POST /api/vr/events/:eventId/participation ──────────────────────────────
app.post("/api/vr/events/:eventId/participation", (req, res) => {
  const { eventId } = req.params;
  const { userId, action } = req.body;
  const ss = getSessionState(eventId);

  if (action === "leave" && ss.participants[userId]) {
    const p = ss.participants[userId];
    if (p.slotId) {
      const slot = ss.traineeSlots.find((s) => s.slotId === p.slotId);
      if (slot) { slot.userId = null; slot.status = "vacant"; }
    }
    if (ss.activeTrainerUserId === userId) {
      ss.activeTrainerUserId = null;
    }
    delete ss.participants[userId];
  }

  res.json({ success: true, message: `Participation ${action || "updated"} for ${userId}` });
});

// ─── POST /api/vr/events/:eventId/users/:userId/heartbeat ────────────────────
app.post("/api/vr/events/:eventId/users/:userId/heartbeat", (req, res) => {
  const { eventId } = req.params;
  const { userId } = req.params;
  const ss = getSessionState(eventId);

  if (ss.participants[userId]) {
    ss.participants[userId].lastHeartbeat = Date.now();
  }

  res.json({ success: true, message: "Heartbeat received", userId, timestamp: Date.now() });
});

// ─── POST /api/vr/debug/reset ────────────────────────────────────────────────
app.post("/api/vr/debug/reset", (req, res) => {
  Object.keys(sessionState).forEach((k) => delete sessionState[k]);
  console.log("[DEBUG] All session state reset.");
  res.json({ success: true, message: "Mock CrewConnect API state reset." });
});

// ─── Start Server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("Mock CrewConnect API running");
  console.log(`Local URL: http://localhost:${PORT}`);
  console.log(`Admin Panel: http://localhost:${PORT}`);
  console.log("Flow: Select Event → Pick Name from Roster → Enter SMS Code → Join");
});

// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---------- Static Frontend ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "./frontend")));

// ---------- WebSocket Layer ----------
const server = app.listen(process.env.PORT || 3000, () =>
  console.log(`🌍 Server running on ${process.env.PORT || 3000}`)
);

const wss = new WebSocketServer({ server });

// Map: deviceId -> ws
const deviceSockets = new Map();

// (optional) browser clients list – if needed
const browserSockets = new Set();

// Helper: send JSON safely
function sendJson(ws, obj) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(obj));
}

wss.on("connection", (ws) => {
  console.log("🔗 WebSocket client connected");

  let isDevice = false;
  let deviceId = null;

  ws.on("message", (data) => {
    const msg = data.toString().trim();
    console.log("📩 WS message:", msg);

    // --- DEVICE REGISTRATION: "REGISTER:DEVICE_1234" ---
    if (!isDevice && msg.startsWith("REGISTER:")) {
      deviceId = msg.substring("REGISTER:".length).trim();
      isDevice = true;

      deviceSockets.set(deviceId, ws);
      console.log("✅ Device registered:", deviceId);

      sendJson(ws, { type: "registered", deviceId });
      return;
    }

    // --- BROWSER JSON MESSAGE ---
    // Expect: { "type":"speak", "deviceId":"DEVICE_1234", "text":"Hello" }
    if (!isDevice && msg.startsWith("{")) {
      let obj;
      try {
        obj = JSON.parse(msg);
      } catch (e) {
        console.log("⚠ Invalid JSON from browser");
        return;
      }

      if (obj.type === "speak" && obj.deviceId && obj.text) {
        const target = deviceSockets.get(obj.deviceId);
        if (target && target.readyState === 1) {
          sendJson(target, {
            type: "speak",
            deviceId: obj.deviceId,
            text: obj.text,
          });
          console.log(`📤 Forwarded to ${obj.deviceId}:`, obj.text);
        } else {
          console.log("⚠ Device not connected:", obj.deviceId);
          sendJson(ws, { type: "error", message: "Device not connected" });
        }
      }
      return;
    }

    // Optional: other types / debug
  });

  ws.on("close", () => {
    console.log("❌ WebSocket closed");

    // If this was a device, remove it from map
    if (isDevice && deviceId && deviceSockets.get(deviceId) === ws) {
      deviceSockets.delete(deviceId);
      console.log("🗑 Device removed from map:", deviceId);
    }
  });
});

// ---------- REST: list connected devices ----------
app.get("/devices", (req, res) => {
  res.json({ devices: Array.from(deviceSockets.keys()) });
});

// ---------- Fallback for frontend ----------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});

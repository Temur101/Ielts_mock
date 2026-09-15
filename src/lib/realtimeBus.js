// Real-time Event Bus supporting Cross-Tab BroadcastChannel + LocalStorage Sync + Supabase Bridge

const CHANNEL_NAME = "ielts_realtime_classroom";

class RealtimeBus {
  constructor() {
    this.subscribers = new Set();
    this.channel = null;

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          this.notifySubscribers(event.data);
        };
      } catch (err) {
        console.warn("BroadcastChannel error, falling back to storage events:", err);
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === "ielts_event_bus" && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            this.notifySubscribers(data);
          } catch (err) {
            console.error("Failed to parse storage event:", err);
          }
        }
      });
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(payload) {
    this.subscribers.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error("Subscriber callback failed:", err);
      }
    });
  }

  broadcast(type, payload = {}) {
    const message = {
      type,
      payload,
      timestamp: Date.now(),
      senderId: typeof window !== "undefined" ? window.name || "tab-" + Math.random().toString(36).substr(2, 5) : "server"
    };

    // 1. Dispatch locally to current tab
    this.notifySubscribers(message);

    // 2. Dispatch to other tabs via BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch (err) {
        console.warn("Failed to broadcast via channel:", err);
      }
    }

    // 3. Fallback sync via localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("ielts_event_bus", JSON.stringify(message));
      } catch (err) {
        // storage quota or private mode
      }
    }

    return message;
  }
}

export const realtimeBus = new RealtimeBus();

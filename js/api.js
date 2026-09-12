/**
 * RadarMarket - Multi-User Client API & Real-time Delta Sync Layer
 */

(function () {
  const DEVICE_KEY = "radarmarket_device_id_v2";
  const USER_KEY = "radarmarket_user_profile_v2";
  const SESSION_KEY = "radarmarket_google_session_v2";
  const GOOGLE_USER_KEY = "radarmarket_google_user_v2";
  const GOOGLE_CLIENT_ID_KEY = "radarmarket_google_client_id_v2";
  const DEFAULT_GOOGLE_CLIENT_ID = "920180307647-smeph38kbik69njoghdmst0pnalvvv68.apps.googleusercontent.com";

  // Generate or retrieve persistent device ID
  function getOrCreateDeviceId() {
    let devId = localStorage.getItem(DEVICE_KEY);
    if (!devId) {
      devId = "dev-" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem(DEVICE_KEY, devId);
    }
    return devId;
  }

  const state = {
    deviceId: getOrCreateDeviceId(),
    sessionToken: localStorage.getItem(SESSION_KEY) || null,
    googleUser: null,
    currentUser: null,
    lastSyncTimestamp: 0,
    networkInfo: null,
    isSyncing: false,
    syncIntervalId: null,
    listeners: {
      itemsUpdated: [],
      newItemBroadcast: [],
      newChatMessage: [],
      profileUpdated: [],
      authStateChanged: []
    }
  };

  /**
   * Internal HTTP fetch helper with device and authorization headers
   */
  async function request(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      "X-Device-Id": state.deviceId,
      ...(state.sessionToken ? { "Authorization": `Bearer ${state.sessionToken}` } : {}),
      ...(options.headers || {})
    };

    try {
      const res = await fetch(endpoint, {
        ...options,
        headers
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  }

  /**
   * Initialize or fetch current user profile and validate active Google session
   */
  async function initUser() {
    // Check cached Google user first
    try {
      const cachedGoogle = localStorage.getItem(GOOGLE_USER_KEY);
      if (cachedGoogle) {
        state.googleUser = JSON.parse(cachedGoogle);
        state.currentUser = state.googleUser;
      }
    } catch (e) {}

    // Verify session token with backend if exists
    if (state.sessionToken) {
      try {
        const sessData = await request("/api/auth/session");
        if (sessData && sessData.authenticated && sessData.user) {
          state.googleUser = sessData.user;
          state.currentUser = sessData.user;
          localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(sessData.user));
          emit("authStateChanged", { authenticated: true, user: sessData.user });
          emit("profileUpdated", state.currentUser);
          return state.currentUser;
        } else {
          // Token expired or invalid, reset
          state.sessionToken = null;
          state.googleUser = null;
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(GOOGLE_USER_KEY);
        }
      } catch (e) {
        console.warn("Session check offline:", e.message);
      }
    }

    // Check localStorage cache for guest profile
    try {
      const cached = localStorage.getItem(USER_KEY);
      if (cached && !state.currentUser) {
        state.currentUser = JSON.parse(cached);
      }
    } catch (e) {}

    try {
      const data = await request(`/api/me`);
      if (data && data.user) {
        state.currentUser = data.user;
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        emit("profileUpdated", state.currentUser);
      }
    } catch (e) {
      // Offline fallback
      if (!state.currentUser) {
        state.currentUser = {
          id: state.deviceId,
          nickname: "Student #" + state.deviceId.slice(-4),
          avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80",
          is_verified: false,
          is_campus_verified: false
        };
      }
    }

    emit("authStateChanged", { authenticated: !!state.googleUser, user: state.currentUser });
    return state.currentUser;
  }

  /**
   * Authenticate with Google ID Token
   */
  async function loginWithGoogle(credential) {
    try {
      const res = await request("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({ credential, device_id: state.deviceId })
      });

      if (res && res.success) {
        state.sessionToken = res.session_token;
        state.googleUser = res.user;
        state.currentUser = res.user;
        localStorage.setItem(SESSION_KEY, res.session_token);
        localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(res.user));
        emit("authStateChanged", { authenticated: true, user: res.user });
        emit("profileUpdated", res.user);
        return res;
      }
    } catch (err) {
      console.error("Google authentication failed:", err);
      throw err;
    }
  }

  /**
   * Authenticate with Instant Campus / Student Demo Profile
   */
  async function loginWithDemoGoogle(demoProfile) {
    try {
      const res = await request("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({
          demo: true,
          email: demoProfile.email,
          name: demoProfile.name,
          picture: demoProfile.picture,
          device_id: state.deviceId
        })
      });

      if (res && res.success) {
        state.sessionToken = res.session_token;
        state.googleUser = res.user;
        state.currentUser = res.user;
        localStorage.setItem(SESSION_KEY, res.session_token);
        localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(res.user));
        emit("authStateChanged", { authenticated: true, user: res.user });
        emit("profileUpdated", res.user);
        return res;
      }
    } catch (err) {
      console.error("Demo login failed:", err);
      throw err;
    }
  }

  /**
   * Sign out of Google Account (reverts to guest device ID)
   */
  async function logoutGoogle() {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch (e) {}

    state.sessionToken = null;
    state.googleUser = null;
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(GOOGLE_USER_KEY);

    // Refresh guest identity
    await initUser();
    emit("authStateChanged", { authenticated: false, user: state.currentUser });
    return { success: true };
  }

  /**
   * Update User Nickname / Avatar
   */
  async function updateProfile(nickname, avatar = null) {
    try {
      const data = await request("/api/me", {
        method: "POST",
        body: JSON.stringify({ nickname, avatar })
      });
      if (data && data.user) {
        state.currentUser = data.user;
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        emit("profileUpdated", state.currentUser);
        return data.user;
      }
    } catch (err) {
      if (state.currentUser) {
        state.currentUser.nickname = nickname;
        if (avatar) state.currentUser.avatar = avatar;
        localStorage.setItem(USER_KEY, JSON.stringify(state.currentUser));
        emit("profileUpdated", state.currentUser);
      }
    }
    return state.currentUser;
  }

  /**
   * Fetch Wi-Fi LAN IP info for mobile pairing
   */
  async function getNetworkInfo() {
    if (state.networkInfo) return state.networkInfo;
    try {
      const data = await request("/api/network-info");
      state.networkInfo = data;
      return data;
    } catch (e) {
      return {
        lan_ip: window.location.hostname,
        port: window.location.port || 5000,
        lan_url: window.location.origin,
        local_url: window.location.origin
      };
    }
  }

  /**
   * Fetch all items from SQLite database
   */
  async function getItems() {
    try {
      const data = await request("/api/items");
      if (data && data.items) {
        return data.items;
      }
    } catch (err) {
      console.warn("Backend unavailable, falling back to local dataset:", err.message);
    }
    // Fallback to local memory/storage
    return MarketData.getMarketItems();
  }

  /**
   * Post a new stationery or book listing to backend
   */
  async function createItem(itemData) {
    try {
      const payload = {
        ...itemData,
        seller_id: state.deviceId,
        seller_name: state.currentUser?.nickname || "Student Seller",
        seller_avatar: state.currentUser?.avatar || ""
      };

      const data = await request("/api/items", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (data && data.item) {
        pollSync();
        return data.item;
      }
    } catch (err) {
      console.warn("Posting to backend failed, saving locally:", err.message);
    }
    // Local fallback
    return MarketData.addNewListing(itemData);
  }

  /**
   * Toggle item reservation
   */
  async function toggleReserve(itemId) {
    try {
      const data = await request(`/api/items/${itemId}/reserve`, {
        method: "POST",
        body: JSON.stringify({ device_id: state.deviceId })
      });
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch items broadcasted by this device
   */
  async function getMyItems() {
    try {
      const data = await request("/api/my-items");
      if (data && data.items) {
        return data.items;
      }
    } catch (err) {
      console.warn("Could not fetch my items:", err.message);
    }
    return [];
  }

  /**
   * Update item status (e.g. mark as sold or delete)
   */
  async function updateItemStatus(itemId, status) {
    try {
      const data = await request(`/api/items/${itemId}/status`, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      return data;
    } catch (err) {
      console.warn("Could not update item status:", err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get chat messages for an item
   */
  async function getChatMessages(itemId) {
    try {
      const data = await request(`/api/chat/${itemId}`);
      if (data && data.messages) {
        return data.messages;
      }
    } catch (err) {
      console.warn("Could not load chat messages:", err.message);
    }
    return [];
  }

  /**
   * Send a chat message
   */
  async function sendChatMessage(itemId, text) {
    try {
      const data = await request(`/api/chat/${itemId}`, {
        method: "POST",
        body: JSON.stringify({
          sender_id: state.deviceId,
          sender_name: state.currentUser?.nickname || "Student",
          text
        })
      });
      if (data && data.message) {
        return data.message;
      }
    } catch (err) {
      console.warn("Failed to send message to backend:", err.message);
    }
    return {
      id: Date.now(),
      item_id: itemId,
      sender_id: state.deviceId,
      sender_name: state.currentUser?.nickname || "You",
      text,
      created_at: Date.now() / 1000
    };
  }

  /**
   * Get secure handshake status for an item (PIN visible only to seller)
   */
  async function getHandshakeStatus(itemId) {
    try {
      const data = await request(`/api/handshake/${itemId}`);
      return data;
    } catch (err) {
      console.warn("Could not get handshake status:", err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Verify secure handshake meetup using 4-digit PIN
   */
  async function verifyHandshake(itemId, code, rating = 5, feedback = "") {
    try {
      const data = await request(`/api/handshake/${itemId}/verify`, {
        method: "POST",
        body: JSON.stringify({
          code,
          rating,
          feedback,
          buyer_name: state.currentUser?.nickname || "Campus Buyer"
        })
      });
      if (data && data.success) {
        pollSync();
      }
      return data;
    } catch (err) {
      console.warn("Handshake verification failed:", err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Real-time Delta Sync Loop (every 1.5 seconds)
   */
  async function pollSync() {
    if (state.isSyncing) return;
    state.isSyncing = true;

    try {
      const data = await request(`/api/sync?since=${state.lastSyncTimestamp}`);
      if (data && data.success) {
        state.lastSyncTimestamp = data.timestamp;

        // If items changed on another phone or laptop
        if (data.has_item_changes && data.items !== undefined) {
          emit("itemsUpdated", data.items);

          // Check if there's a new item posted by another device
          const newItems = (data.events || []).filter(
            (e) => e.event_type === "new_item"
          );
          if (newItems.length > 0) {
            emit("newItemBroadcast", newItems);
          }
        }

        // If new chat messages arrived
        if (data.new_messages && data.new_messages.length > 0) {
          data.new_messages.forEach((msg) => {
            emit("newChatMessage", msg);
          });
        }

        // If handshake verified event arrived
        const handshakeEvents = (data.events || []).filter(
          (e) => e.event_type === "handshake_completed"
        );
        if (handshakeEvents.length > 0) {
          handshakeEvents.forEach((ev) => {
            const payload = typeof ev.payload === "string" ? JSON.parse(ev.payload) : ev.payload;
            emit("handshakeCompleted", payload);
          });
        }
      }
    } catch (err) {
      // Server may be momentarily busy or offline
    } finally {
      state.isSyncing = false;
    }
  }

  function startSyncLoop(intervalMs = 1200) {
    if (state.syncIntervalId) clearInterval(state.syncIntervalId);
    state.syncIntervalId = setInterval(pollSync, intervalMs);
    // Initial sync
    pollSync();
  }

  function stopSyncLoop() {
    if (state.syncIntervalId) {
      clearInterval(state.syncIntervalId);
      state.syncIntervalId = null;
    }
  }

  // Event dispatcher
  function on(eventName, callback) {
    if (!state.listeners[eventName]) state.listeners[eventName] = [];
    state.listeners[eventName].push(callback);
  }

  function emit(eventName, payload) {
    const list = state.listeners[eventName] || [];
    list.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`Listener error on [${eventName}]:`, err);
      }
    });
  }

  /**
   * Resolve academic textbook details from an ISBN-10 or ISBN-13 barcode.
   * Leverages backend proxy caching with automatic client-side OpenLibrary fallback.
   */
  async function lookupIsbn(isbn) {
    if (!isbn) throw new Error("Please enter or scan an ISBN barcode.");
    let clean = isbn.replace(/[^0-9X]/gi, "").toUpperCase();
    if (clean.length === 12) {
      clean = "0" + clean;
    }
    if (clean.length !== 10 && clean.length !== 13) {
      throw new Error(`Invalid ISBN length (${clean.length}). Expected 10 or 13 digits.`);
    }

    // 1. Try local backend resolver proxy
    try {
      const res = await request(`/api/isbn/${clean}`);
      if (res && res.success && res.data) {
        return res.data;
      }
    } catch (proxyErr) {
      console.warn("Backend ISBN proxy bypassed, trying direct OpenLibrary...", proxyErr);
    }

    // 2. Direct client-side OpenLibrary fallback
    try {
      const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`;
      const directRes = await fetch(olUrl);
      if (directRes.ok) {
        const data = await directRes.json();
        const key = `ISBN:${clean}`;
        if (data && data[key]) {
          const b = data[key];
          const authors = (b.authors || []).map(a => a.name).filter(Boolean).join(", ");
          const publishers = (b.publishers || []).map(p => p.name).filter(Boolean).join(", ");
          const coverObj = b.cover || {};
          const coverUrl = coverObj.large || coverObj.medium || coverObj.small || `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`;
          const subjects = (b.subjects || []).map(s => s.name).slice(0, 5);

          return {
            isbn: clean,
            title: b.title || "",
            subtitle: b.subtitle || "",
            authors: authors || "Unknown Author",
            publishers: publishers,
            publish_date: b.publish_date || "",
            number_of_pages: b.number_of_pages,
            cover_url: coverUrl,
            subjects: subjects,
            suggested_category: "books",
            suggested_subcategory: subjects[0] || "Textbook",
            source: "OpenLibraryDirect"
          };
        }
      }
    } catch (directErr) {
      console.error("Direct OpenLibrary lookup failed:", directErr);
    }

    throw new Error(`No textbook record found for ISBN "${clean}".`);
  }

  window.MarketAPI = {
    getDeviceId: () => state.deviceId,
    getCurrentUser: () => state.currentUser,
    getGoogleUser: () => state.googleUser,
    isGoogleAuthenticated: () => !!state.googleUser,
    getSessionToken: () => state.sessionToken,
    getGoogleClientId: () => {
      const stored = localStorage.getItem(GOOGLE_CLIENT_ID_KEY);
      if (stored && stored.includes("-") && stored.endsWith(".apps.googleusercontent.com") && /^\d+/.test(stored)) {
        return stored;
      }
      if (stored) {
        localStorage.removeItem(GOOGLE_CLIENT_ID_KEY);
      }
      return DEFAULT_GOOGLE_CLIENT_ID;
    },
    setGoogleClientId: (id) => {
      if (id && id.trim()) {
        localStorage.setItem(GOOGLE_CLIENT_ID_KEY, id.trim());
      }
    },
    loginWithGoogle,
    loginWithDemoGoogle,
    logoutGoogle,
    initUser,
    updateProfile,
    getNetworkInfo,
    getItems,
    createItem,
    toggleReserve,
    getMyItems,
    updateItemStatus,
    getChatMessages,
    sendChatMessage,
    getHandshakeStatus,
    verifyHandshake,
    startSyncLoop,
    stopSyncLoop,
    lookupIsbn,
    on
  };
})();

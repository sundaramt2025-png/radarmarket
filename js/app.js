/**
 * RadarMarket - Main Application Controller (Production Multi-User Enabled)
 */

(function () {
  // 0. Restore last known real GPS fix across sessions if available
  let initialLocation = { ...MarketData.DEFAULT_USER_LOCATION };
  let hasStoredGps = false;
  try {
    const cachedGps = localStorage.getItem("radarmarket_last_known_gps");
    if (cachedGps) {
      const parsedGps = JSON.parse(cachedGps);
      // Cleanse stale Goa ISP gateway coordinates or inaccurate IP estimates (> 1500m)
      const isGoaRange = (parsedGps && parsedGps.lat >= 14.8 && parsedGps.lat <= 16.0 && parsedGps.lng >= 73.4 && parsedGps.lng <= 74.6 && !parsedGps.isManual);
      const isCoarse = (parsedGps && parsedGps.accuracy && parsedGps.accuracy > 1500 && !parsedGps.isManual);
      if (isGoaRange || isCoarse) {
        localStorage.removeItem("radarmarket_last_known_gps");
      } else if (parsedGps && typeof parsedGps.lat === "number" && typeof parsedGps.lng === "number") {
        initialLocation = {
          lat: parsedGps.lat,
          lng: parsedGps.lng,
          accuracy: parsedGps.accuracy || 10,
          name: parsedGps.isManual ? `📍 ${parsedGps.landmark || "Custom Location"}` : `📍 Live GPS (±${parsedGps.accuracy || 10}m)`,
          isLiveGPS: !parsedGps.isManual,
          isManual: !!parsedGps.isManual
        };
        hasStoredGps = true;
      }
    }
  } catch (e) {}

  // Restore active Indian campus preference
  let initialCampus = null;
  try {
    const rawCampus = localStorage.getItem("radarmarket_active_campus");
    if (rawCampus) {
      initialCampus = JSON.parse(rawCampus);
      if (initialCampus && !hasStoredGps) {
        initialLocation = {
          lat: initialCampus.lat,
          lng: initialCampus.lng,
          accuracy: 10,
          name: `🏫 ${initialCampus.shortName || initialCampus.name}`,
          isLiveGPS: false,
          isManual: true,
          campusId: initialCampus.id
        };
      }
    }
  } catch (e) {}

  // Application State
  const state = {
    userLocation: initialLocation,
    activeCampus: initialCampus,
    selectedPickupCoords: {
      lat: initialLocation.lat,
      lng: initialLocation.lng,
      accuracy: initialLocation.accuracy || 10,
      landmark: initialCampus ? (initialCampus.shortName || initialCampus.name) : (hasStoredGps ? "Current Live Location" : "Campus Central"),
      isCustom: false,
      isLiveGPS: hasStoredGps
    },
    maxRadiusMeters: 500,
    liveGpsWatchId: null,
    selectedCategory: "all",
    searchQuery: "",
    currentView: "radar", // "radar" | "map" | "grid"
    gridSortBy: "algo",
    rawItems: [],
    evaluatedItems: [],
    filteredItems: [],
    selectedTarget: null,
    audioEnabled: false,
    activeChatId: null,
    activeChatAgreedPrice: null,
    latestAlertItemId: null,
    unreadInboxCount: 0,
    chatMessagesCache: new Map() // itemId -> Array
  };

  let radarEngine = null;

  // Interactive Campus Street Map & Pinpoint Reticle State (Leaflet + Google Maps)
  let campusMap = null;
  let campusUserMarker = null;
  let campusMapMarkers = [];
  let campusPathLine = null;
  let campusCurrentTileLayer = null;
  let campusActiveLayerType = "streets";
  let pinpointMap = null;
  let pinpointMarker = null;
  let pinpointPicker = null;
  let pinpointCurrentTileLayer = null;
  let pinpointActiveLayerType = "streets";
  let googleMapsModalInitialized = false;
  let handshakeModal = null;
  let makeOfferModal = null;
  let counterOfferModal = null;

  // Google Maps Public Tile Configuration (Official Google Roadmaps & Satellite Imagery, No API Key Required)
  const GOOGLE_TILE_CONFIG = {
    streets: {
      url: "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
      options: {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: "&copy; Google Maps"
      }
    },
    satellite: {
      url: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", // hybrid satellite + road overlays & landmark labels
      options: {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: "&copy; Google Maps Satellite"
      }
    }
  };

  // Preset fallback photos for quick posting
  const PRESET_PHOTOS = {
    stationery: [
      "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=600&q=80"
    ],
    books: [
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1532012164546-f432f2e3777a?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=600&q=80"
    ],
    hostel: [
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1540518614846-7ede433c4ef0?auto=format&fit=crop&w=600&q=80"
    ],
    lab: [
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=600&q=80"
    ],
    tech: [
      "https://images.unsplash.com/photo-1588508065123-287b28e013da?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=600&q=80"
    ]
  };

  /**
   * Initialize App on DOM ready
   */
  document.addEventListener("DOMContentLoaded", async () => {
    initRadarEngine();
    setupEventListeners();

    // Initialize Pan-India Campus display
    if (state.activeCampus) {
      updateCampusUI(state.activeCampus);
    } else {
      updateCampusUI(null);
    }

    // Fast 0ms instant paint from local feed cache before network fetch
    if (window.MarketAPI && typeof MarketAPI.getCachedFeed === "function") {
      const cached = MarketAPI.getCachedFeed();
      if (cached && Array.isArray(cached) && cached.length > 0) {
        state.rawItems = cached;
        recalculateAndRender();
      }
    }

    // 1. Initialize user profile & network
    if (window.MarketAPI) {
      const user = await MarketAPI.initUser();
      updateProfileUI(user);
      setupSyncListeners();
      MarketAPI.startSyncLoop(1500);
    }

    // 2. Auto-acquire live user GPS position
    initLiveLocationTracking();

    // 3. Initial market load
    await refreshMarket();

    // 3. Setup PWA & Service Worker
    setupPWA();
  });

  /**
   * Setup Radar Engine Canvas
   */
  function initRadarEngine() {
    const canvas = document.getElementById("radar-canvas");
    radarEngine = new RadarEngine(canvas, {
      rpm: 24,
      rings: 4,
      maxRadiusMeters: state.maxRadiusMeters,
      audioEnabled: state.audioEnabled,
      onSelectTarget: (target) => {
        selectTarget(target);
      },
      onHoverTarget: (target) => {
        handleRadarHover(target);
      }
    });
  }

  /**
   * Listen for real-time events from other connected phones & laptops
   */
  function setupSyncListeners() {
    if (!window.MarketAPI) return;

    // When another device lists or reserves an item
    MarketAPI.on("itemsUpdated", (items) => {
      state.rawItems = items || [];
      recalculateAndRender();
      updateMyBeaconsBadge();
      updateBountyBadge();
    });

    // When a new radar beacon is broadcasted by someone else on the network
    MarketAPI.on("newItemBroadcast", (events) => {
      try {
        const first = events[0];
        const payload = typeof first.payload === "string" ? JSON.parse(first.payload) : first.payload;
        showToast("RADAR BEACON DETECTED", `New listing: "${payload.title || 'Item'}" was just broadcasted!`);
        if (radarEngine) {
          radarEngine.triggerActiveSonarSweep();
          if (state.audioEnabled) {
            radarEngine.playSonarPing(1100, 0.1);
          }
        }
      } catch (e) {}
    });

    // When an incoming chat message arrives
    MarketAPI.on("newChatMessage", (msg) => {
      const myDeviceId = window.MarketAPI ? MarketAPI.getDeviceId() : null;
      const isFromMe = msg.sender_id === myDeviceId || msg.sender === "me";

      if (state.activeChatId === msg.item_id) {
        appendMessageBubble(msg);
        if (!isFromMe) {
          playChatAlertSound(true); // Soft pop when chat is currently active
        }
      } else if (!isFromMe) {
        // Chat is not active for this item: alert user with sound, toast, push, and badge
        const cleanMsg = formatMessageForAlert(msg.text);
        const senderName = msg.sender_name || (msg.sender_id === msg.seller_id ? (msg.seller_name || "Seller") : "Buyer");
        const itemTitle = msg.item_title || "Campus Beacon";

        showCommunicationAlert({
          type: "message",
          senderName: senderName,
          senderAvatar: msg.sender_avatar || "",
          itemTitle: itemTitle,
          messageText: cleanMsg,
          itemId: msg.item_id
        });
      }
    });

    // When an offer bargaining update arrives
    MarketAPI.on("offerUpdated", (payload) => {
      const myDeviceId = window.MarketAPI ? MarketAPI.getDeviceId() : null;
      const isFromMe = payload.buyer_id === myDeviceId || payload.sender_id === myDeviceId;

      if (state.activeChatId === payload.item_id) {
        if (payload.type === "offer_accepted" && payload.agreed_price) {
          state.activeChatAgreedPrice = payload.agreed_price;
          const priceDisplay = document.getElementById("chat-item-price");
          let target = state.selectedTarget;
          if (!target && state.activeChatId) {
            target = state.evaluatedItems.find(t => t.item.id === state.activeChatId);
          }
          if (priceDisplay && target) {
            priceDisplay.innerHTML = `<span class="line-through text-slate-500 text-xs mr-1">₹${target.item.price}</span><span class="text-emerald-400 font-bold">₹${payload.agreed_price}</span>`;
          }
          playHandshakeChime();
        }
      }

      // Proactive cross-device notification alert:
      if (payload.type === "new_offer" && (!isFromMe || payload.seller_id === myDeviceId)) {
        showCommunicationAlert({
          type: "offer",
          senderName: payload.buyer_name || "Prospective Buyer",
          itemTitle: payload.item_title || "Market Item",
          messageText: `New offer received: ₹${payload.offer_amount || payload.amount}. Tap to inspect or respond!`,
          itemId: payload.item_id
        });
      } else if (payload.type === "offer_countered" && (payload.buyer_id === myDeviceId || !isFromMe)) {
        showCommunicationAlert({
          type: "counter",
          senderName: payload.seller_name || "Seller",
          itemTitle: payload.item_title || "Market Item",
          messageText: `Counter offer received: ₹${payload.counter_amount}. Tap to reply!`,
          itemId: payload.item_id
        });
      } else if (payload.type === "offer_accepted" && (payload.buyer_id === myDeviceId || !isFromMe)) {
        showCommunicationAlert({
          type: "accepted",
          senderName: payload.seller_name || "Seller",
          itemTitle: payload.item_title || "Market Item",
          messageText: `Offer accepted at ₹${payload.agreed_price}! Open chat to pick meetup spot.`,
          itemId: payload.item_id
        });
      }
    });

    // When a new bounty / wanted request is posted by another device
    MarketAPI.on("bountyPosted", (payload) => {
      if (payload && payload.title) {
        showToast(
          "🎯 CAMPUS BOUNTY DETECTED",
          `"${payload.title}" — Someone needs this! Tap BOUNTY BOARD if you have it.`
        );
        if (radarEngine) {
          radarEngine.triggerActiveSonarSweep();
        }
        // Update bounty badge count
        updateBountyBadge();
      }
    });

    // Profile & Auth updates
    MarketAPI.on("profileUpdated", (user) => {
      updateProfileUI(user);
    });

    MarketAPI.on("authStateChanged", ({ authenticated, user }) => {
      updateProfileUI(user);
      updateAuthModalUI(user);
    });
  }

  function updateProfileUI(user) {
    if (!user) return;
    const nameEl = document.getElementById("user-profile-name");
    const avatarEl = document.getElementById("hud-user-avatar");
    const dotEl = document.getElementById("hud-verified-dot");
    const badgeEl = document.getElementById("hud-verified-badge");

    const isAuth = !!(user.google_id || user.auth_provider === "google");
    const isCampus = !!user.is_campus_verified;

    if (nameEl) {
      nameEl.textContent = user.nickname || (isAuth ? "Google User" : "Guest");
    }

    if (avatarEl) {
      avatarEl.src = user.avatar || user.picture || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80";
      if (isCampus) {
        avatarEl.className = "w-5 h-5 rounded-full object-cover border-2 border-amber-400";
      } else if (isAuth) {
        avatarEl.className = "w-5 h-5 rounded-full object-cover border-2 border-emerald-400";
      } else {
        avatarEl.className = "w-5 h-5 rounded-full object-cover border border-cyan-400";
      }
    }

    if (dotEl) {
      if (isCampus) {
        dotEl.className = "absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse";
      } else if (isAuth) {
        dotEl.className = "absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
      } else {
        dotEl.className = "absolute -top-1 -right-1 w-2 h-2 rounded-full bg-slate-500";
      }
    }

    if (badgeEl) {
      if (isCampus) {
        badgeEl.classList.remove("hidden");
        badgeEl.textContent = "CAMPUS";
        badgeEl.className = "px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40";
      } else if (isAuth) {
        badgeEl.classList.remove("hidden");
        badgeEl.textContent = "VERIFIED";
        badgeEl.className = "px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
      } else {
        badgeEl.classList.add("hidden");
      }
    }

    // Also update the Broadcast Form poster strip
    const posterAvatar = document.getElementById("sell-poster-avatar");
    const posterName = document.getElementById("sell-poster-name");
    const posterBadge = document.getElementById("sell-poster-verified-badge");
    const switchBtn = document.getElementById("btn-sell-switch-google");

    if (posterAvatar) {
      posterAvatar.src = user.avatar || user.picture || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80";
    }
    if (posterName) {
      posterName.textContent = user.nickname || (isAuth ? "Verified Student" : "Guest Student");
    }
    if (posterBadge) {
      if (isCampus || isAuth) {
        posterBadge.classList.remove("hidden");
        posterBadge.textContent = isCampus ? "✓ CAMPUS VERIFIED" : "✓ GOOGLE VERIFIED";
      } else {
        posterBadge.classList.add("hidden");
      }
    }
    if (switchBtn) {
      switchBtn.textContent = isAuth ? "Switch Account" : "Verify with Google";
    }
  }

  /**
   * Recalculate all items through the DSP-VI algorithm, filter, and render
   */
  async function refreshMarket() {
    if (window.MarketAPI) {
      state.rawItems = await MarketAPI.getItems();
    } else {
      state.rawItems = MarketData.getMarketItems();
    }
    recalculateAndRender();
  }

  function recalculateAndRender() {
    // 1. Evaluate with DSP-VI Multi-factor Algorithm
    const evaluated = state.rawItems.map((item) =>
      RadarAlgorithm.evaluateItemAlgorithm(
        item,
        state.userLocation,
        state.maxRadiusMeters,
        state.searchQuery
      )
    );

    // 2. Apply anti-collision spatial jitter for overlapping coordinates
    state.evaluatedItems = RadarAlgorithm.applyRadarClusterSolver(evaluated);

    // 3. Filter by category / beacon_type, search query & strict Campus Radius (500m to 2km)
    state.filteredItems = state.evaluatedItems.filter((entry) => {
      // Strict Campus Perimeter Fence: 500m to 5000m (5 km)
      // When a campus is selected, products within the selected radar radius are displayed
      if (state.activeCampus) {
        const campusMaxRadius = Math.min(5000, Math.max(500, state.maxRadiusMeters || 500));
        if (entry.distance > campusMaxRadius) {
          return false; // Strictly exclude items outside the selected college/campus perimeter!
        }
      }

      // Special filter: BOUNTIES tab shows only wanted beacon_type
      if (state.selectedCategory === "wanted") {
        return entry.item.beacon_type === "wanted";
      }
      // Category match (skip wanted items in normal category tabs unless ALL)
      if (state.selectedCategory !== "all" && entry.item.category !== state.selectedCategory) {
        return false;
      }
      // Query match (if search term entered)
      if (state.searchQuery && !entry.matchesQuery) {
        return false;
      }
      return true;
    });

    // 4. Sort
    sortItems();

    // 5. Update Radar Scope
    if (radarEngine) {
      radarEngine.setTargets(state.filteredItems, state.maxRadiusMeters);
    }

    // 6. Update HUD Stats
    updateHUDStats();

    // 7. Update Active Spotlight Target
    if (
      !state.selectedTarget ||
      !state.filteredItems.some((t) => t.item.id === state.selectedTarget.item.id)
    ) {
      const topMatch = state.filteredItems.find((t) => t.inRadarRange) || state.filteredItems[0] || null;
      selectTarget(topMatch);
    } else {
      const refreshed = state.filteredItems.find((t) => t.item.id === state.selectedTarget.item.id);
      if (refreshed) {
        selectTarget(refreshed);
      }
    }

    // 8. Render UI Views
    renderNearbyFeed();
    updateBountyBadge();
    if (state.currentView === "map") {
      renderCampusMapPins();
    } else if (state.currentView === "grid") {
      renderCatalogGrid();
    }
  }

  /**
   * Sort filtered items based on current sorting criteria
   */
  function sortItems() {
    const sortBy = state.currentView === "grid" ? state.gridSortBy : (state.radarSortBy || "distance");
    state.filteredItems.sort((a, b) => {
      if (sortBy === "distance") {
        return a.distance - b.distance;
      }
      if (sortBy === "algo") {
        return b.algorithmScore - a.algorithmScore;
      }
      if (sortBy === "price_asc") {
        return a.item.price - b.item.price;
      }
      if (sortBy === "price_desc") {
        return b.item.price - a.item.price;
      }
      if (sortBy === "discount") {
        return (b.breakdown?.discountPct || 0) - (a.breakdown?.discountPct || 0);
      }
      return 0;
    });
  }

  /**
   * Update HUD status bar numbers
   */
  function updateHUDStats() {
    const inRangeCount = state.filteredItems.filter((t) => t.inRadarRange).length;
    const totalCount = state.filteredItems.length;
    document.getElementById("hud-target-count").textContent = inRangeCount > 0 ? inRangeCount : totalCount;
    document.getElementById("feed-count").textContent = totalCount;
    const mobileFeedCount = document.getElementById("mobile-feed-count");
    if (mobileFeedCount) mobileFeedCount.textContent = totalCount;
    // Only update via textContent when NOT in live GPS mode, to avoid destroying
    // the pulsing green dot animation set by initLiveLocationTracking via innerHTML.
    if (!state.userLocation.isLiveGPS) {
      const hud = document.getElementById("hud-location-text");
      if (hud) {
        if (state.activeCampus) {
          hud.textContent = `🏫 ${state.activeCampus.shortName || state.activeCampus.name}`;
          hud.onclick = () => openCampusSearchModal();
        } else if (state.userLocation && state.userLocation.isManual && state.userLocation.name && !state.userLocation.name.includes("Detecting") && !state.userLocation.name.includes("SEARCH YOUR COLLAGE")) {
          hud.textContent = state.userLocation.name;
        } else {
          hud.innerHTML = `<span class="text-cyan-300 font-bold animate-pulse">SEARCH YOUR COLLAGE HERE....</span>`;
          hud.onclick = () => openCampusSearchModal();
        }
      }
    }

    // Smart Perimeter Alert Banner
    const perimBanner = document.getElementById("radar-perimeter-banner");
    const perimText = document.getElementById("radar-perimeter-banner-text");
    const expandBtn = document.getElementById("btn-expand-perimeter-range");
    if (perimBanner && perimText) {
      if (inRangeCount === 0 && totalCount > 0) {
        const closest = state.filteredItems[0];
        const neededRadius = Math.min(2000, Math.ceil((closest.distance + 50) / 100) * 100);
        perimText.textContent = `📡 "${closest.item.title}" detected ${closest.distanceFormatted} away`;
        perimBanner.classList.remove("hidden");
        if (expandBtn) {
          expandBtn.textContent = `EXPAND TO ${neededRadius >= 1000 ? (neededRadius/1000).toFixed(1) + 'KM' : neededRadius + 'M'}`;
          expandBtn.onclick = () => {
            state.maxRadiusMeters = neededRadius;
            const slider = document.getElementById("range-slider");
            if (slider) slider.value = neededRadius;
            const display = document.getElementById("range-value-display");
            if (display) display.textContent = neededRadius >= 1000 ? `${(neededRadius/1000).toFixed(1)} km` : `${neededRadius} m`;
            if (radarEngine) radarEngine.setMaxRadius(neededRadius);
            recalculateAndRender();
            showToast("RADAR EXPANDED", `Radar range expanded to ${neededRadius}m to lock onto target.`);
          };
        }
      } else {
        perimBanner.classList.add("hidden");
      }
    }
  }

  /**
   * Handle Target Selection (Lock Target)
   */
  function selectTarget(target) {
    state.selectedTarget = target;
    if (radarEngine && target) {
      radarEngine.setSelectedTarget(target.item.id);
    }
    renderTargetSpotlight(target);
    highlightFeedItem(target ? target.item.id : null);
  }

  /**
   * Re-measure real-time GPS distance to current target on demand
   */
  function remeasureDistanceToTarget() {
    const remeasureBtn = document.getElementById("btn-remeasure-distance");
    if (remeasureBtn) {
      remeasureBtn.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 text-cyan-400 animate-spin"></i><span>PINGING SATELLITES...</span>`;
      if (window.lucide) lucide.createIcons();
    }
    if (radarEngine && state.audioEnabled) {
      radarEngine.playSonarPing(1350, 0.12);
    }
    if (!("geolocation" in navigator)) {
      showToast("GPS ERROR", "Geolocation is not supported by your browser.");
      if (remeasureBtn) {
        remeasureBtn.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 text-cyan-400"></i><span>PING LIVE DISTANCE</span>`;
        if (window.lucide) lucide.createIcons();
      }
      return;
    }

    const onFixSuccess = (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = Math.round(pos.coords.accuracy || 8);
      state.userLocation = {
        lat,
        lng,
        accuracy,
        name: `📍 Live GPS (±${accuracy}m)`,
        isLiveGPS: true
      };
      try {
        localStorage.setItem("radarmarket_last_known_gps", JSON.stringify({ lat, lng, accuracy, timestamp: Date.now() }));
      } catch (e) {}

      recalculateAndRender();
      if (state.selectedTarget) {
        renderTargetSpotlight(state.selectedTarget);
        showToast("GPS RE-CALIBRATED", `Distance to ${state.selectedTarget.item.title}: ${state.selectedTarget.distanceFormatted} (±${accuracy}m fix)`);
      }
      if (remeasureBtn) {
        remeasureBtn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i><span>DISTANCE VERIFIED</span>`;
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
          remeasureBtn.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 text-cyan-400"></i><span>PING LIVE DISTANCE</span>`;
          if (window.lucide) lucide.createIcons();
        }, 2200);
      }
    };

    navigator.geolocation.getCurrentPosition(
      onFixSuccess,
      (err) => {
        console.warn("High-accuracy re-measure failed, trying network fallback:", err.message);
        navigator.geolocation.getCurrentPosition(
          onFixSuccess,
          (err2) => {
            showToast("GPS DENIED", "Please tap the lock or location icon in your browser URL bar to allow GPS.");
            if (remeasureBtn) {
              remeasureBtn.innerHTML = `<i data-lucide="refresh-cw" class="w-3 h-3 text-cyan-400"></i><span>PING LIVE DISTANCE</span>`;
              if (window.lucide) lucide.createIcons();
            }
          },
          { enableHighAccuracy: false, timeout: 8000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  /**
   * Render Spotlight Target Card in Radar View
   */
  function renderTargetSpotlight(target) {
    const panel = document.getElementById("selected-target-panel");
    if (!target) {
      panel.classList.add("opacity-50");
      document.getElementById("target-title").textContent = "No target acquired in this sector";
      document.getElementById("target-algo-score").textContent = "--";
      document.getElementById("target-signal-tier").textContent = "SIGNAL: LOST";
      // Reset proximity zone badge to avoid stale distance values
      const proximityZoneReset = document.getElementById("target-proximity-zone");
      if (proximityZoneReset) {
        proximityZoneReset.textContent = "";
        proximityZoneReset.className = "hidden";
      }
      return;
    }
    panel.classList.remove("opacity-50");

    const item = target.item;
    const catBadge = document.getElementById("target-category-badge");
    if (item.beacon_type === "wanted") {
      catBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase bg-pink-950 text-pink-300 border border-pink-500/40";
      catBadge.textContent = "🚨 WANTED REQUEST";
    } else if (item.category === "stationery") {
      catBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase badge-stationery";
      catBadge.textContent = "✏️ " + (item.sub_category || item.subCategory || "Stationery");
    } else if (item.category === "books") {
      catBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase badge-book";
      catBadge.textContent = "📖 " + (item.sub_category || item.subCategory || "Book");
    } else if (item.category === "hostel") {
      catBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase badge-hostel";
      catBadge.textContent = "🛏️ " + (item.sub_category || item.subCategory || "Hostel");
    } else if (item.category === "lab") {
      catBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase badge-lab";
      catBadge.textContent = "🔬 " + (item.sub_category || item.subCategory || "Lab Gear");
    } else if (item.category === "tech") {
      catBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase badge-tech";
      catBadge.textContent = "🔌 " + (item.sub_category || item.subCategory || "Tech");
    } else {
      catBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase badge-stationery";
      catBadge.textContent = "📦 " + (item.sub_category || item.subCategory || "Item");
    }

    document.getElementById("target-condition-badge").textContent = item.condition.toUpperCase();
    document.getElementById("target-title").textContent = item.title;
    document.getElementById("target-algo-score").textContent = target.algorithmScore;
    document.getElementById("target-algo-score").className = `text-2xl font-black font-mono ${
      target.algorithmScore >= 80 ? "text-emerald-400" : target.algorithmScore >= 60 ? "text-cyan-400" : "text-amber-400"
    }`;

    const tierElem = document.getElementById("target-signal-tier");
    tierElem.textContent = `SIGNAL: ${target.signalClass} (${target.rssi} dBm)`;
    tierElem.className = `text-[10px] font-mono font-bold uppercase ${target.signalBadgeColor}`;

    document.getElementById("target-image").src = item.image || (PRESET_PHOTOS[item.category] || PRESET_PHOTOS.stationery)[0];

    // Populate Collapsible DSP-VI Mathematical Telemetry Drawer
    const bd = target.breakdown || {};
    const metricProx = document.getElementById("dsp-metric-prox");
    const barProx = document.getElementById("dsp-bar-prox");
    if (metricProx && barProx) {
      const p = Math.round(bd.proximityScore || 0);
      metricProx.textContent = `${p} / 100`;
      barProx.style.width = `${Math.min(100, Math.max(0, p))}%`;
    }
    const metricVal = document.getElementById("dsp-metric-val");
    const barVal = document.getElementById("dsp-bar-val");
    if (metricVal && barVal) {
      const v = Math.round(bd.valueScore || 0);
      metricVal.textContent = `${v} / 100`;
      barVal.style.width = `${Math.min(100, Math.max(0, v))}%`;
    }
    const metricRep = document.getElementById("dsp-metric-rep");
    const barRep = document.getElementById("dsp-bar-rep");
    if (metricRep && barRep) {
      const r = Math.round(bd.trustScore || 0);
      metricRep.textContent = `${r} / 100`;
      barRep.style.width = `${Math.min(100, Math.max(0, r))}%`;
    }
    const metricFresh = document.getElementById("dsp-metric-fresh");
    const barFresh = document.getElementById("dsp-bar-fresh");
    if (metricFresh && barFresh) {
      const f = Math.round(bd.freshnessScore || 0);
      metricFresh.textContent = `${f} / 100`;
      barFresh.style.width = `${Math.min(100, Math.max(0, f))}%`;
    }
    document.getElementById("target-distance").textContent = target.distanceFormatted;
    
    const walkingElem = document.getElementById("target-walking-time");
    if (walkingElem) {
      walkingElem.textContent = target.walkingTime || "walking dist";
    }

    const proximityZone = document.getElementById("target-proximity-zone");
    if (proximityZone) {
      const in500 = target.distance <= 500;
      proximityZone.className = in500
        ? "px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40"
        : "px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40";
      proximityZone.textContent = in500 ? "🟢 < 500M ZONE" : "🟠 BEYOND 500M";
    }

    // Live Dual GPS Coordinates Readout (Buyer vs Seller)
    const buyerCoordsElem = document.getElementById("target-buyer-coords");
    if (buyerCoordsElem) {
      if (state.userLocation.isLiveGPS) {
        buyerCoordsElem.innerHTML = `<span class="text-emerald-400 font-bold">${state.userLocation.lat.toFixed(5)}, ${state.userLocation.lng.toFixed(5)}</span> <span class="text-[9px] text-slate-400 font-normal">(±${state.userLocation.accuracy || 8}m)</span>`;
      } else {
        buyerCoordsElem.innerHTML = `<span class="text-amber-400 font-bold">Acquiring GPS... (Tap Ping)</span>`;
      }
    }

    const sellerCoordsElem = document.getElementById("target-seller-coords");
    if (sellerCoordsElem) {
      sellerCoordsElem.innerHTML = `<span class="text-cyan-300 font-bold">${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}</span> <span class="text-[9px] text-slate-400 font-normal">(${item.landmark || "Campus Spot"})</span>`;
    }

    const remeasureBtn = document.getElementById("btn-remeasure-distance");
    if (remeasureBtn) {
      remeasureBtn.onclick = (e) => {
        e.stopPropagation();
        remeasureDistanceToTarget();
      };
    }

    document.getElementById("target-bearing").textContent = `${target.bearingFormatted} (Azimuth)`;
    document.getElementById("target-landmark").textContent = item.landmark || "Campus";

    const gmapsBtn = document.getElementById("btn-target-google-maps");
    if (gmapsBtn) {
      gmapsBtn.onclick = (e) => {
        e.stopPropagation();
        openGoogleMapsDirections(item.lat, item.lng, item.landmark);
      };
    }

    document.getElementById("target-price").textContent = `₹${item.price}`;
    const origPriceElem = document.getElementById("target-orig-price");
    const discountBadge = document.getElementById("target-discount-pct");

    const origPrice = item.original_price || item.originalPrice;
    if (origPrice && origPrice > item.price) {
      origPriceElem.textContent = `₹${origPrice}`;
      origPriceElem.classList.remove("hidden");
      discountBadge.textContent = `${target.breakdown.discountPct}% OFF`;
      discountBadge.classList.remove("hidden");
    } else {
      origPriceElem.classList.add("hidden");
      discountBadge.classList.add("hidden");
    }

    document.getElementById("target-description").textContent = item.description || "No further details listed.";

    // Seller Info
    document.getElementById("target-seller-name").textContent = item.seller?.name || item.seller_name || "Campus Peer";
    document.getElementById("target-seller-rating").textContent = (item.seller?.rating || 4.9).toFixed(1);
    document.getElementById("target-seller-avatar").src =
      item.seller?.avatar || item.seller_avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80";

    const verifiedIcon = document.getElementById("target-seller-verified");
    if (item.seller?.verified) {
      verifiedIcon.classList.remove("hidden");
    } else {
      verifiedIcon.classList.add("hidden");
    }

    const campusTag = document.getElementById("target-seller-campus-tag");
    if (campusTag) {
      if (item.seller?.campus_verified) {
        campusTag.classList.remove("hidden");
      } else {
        campusTag.classList.add("hidden");
      }
    }

    // Reservation status
    const currentDeviceId = window.MarketAPI ? MarketAPI.getDeviceId() : null;
    const isReservedByMe = item.reserved_by === currentDeviceId;
    const isReservedByOther = item.reserved_by && !isReservedByMe;

    const reserveBtn = document.getElementById("btn-reserve-item");
    const reserveText = document.getElementById("reserve-btn-text");

    if (isReservedByMe) {
      reserveText.textContent = "Reserved (Cancel)";
      reserveBtn.className = "w-full py-2 px-3 rounded-lg bg-amber-500/20 border border-amber-400/80 text-amber-300 font-bold font-mono text-xs tracking-wider uppercase transition flex items-center justify-center gap-1.5";
    } else if (isReservedByOther) {
      reserveText.textContent = "Reserved by Peer";
      reserveBtn.className = "w-full py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 font-bold font-mono text-xs tracking-wider uppercase cursor-not-allowed flex items-center justify-center gap-1.5";
    } else {
      reserveText.textContent = "Reserve Deal";
      reserveBtn.className = "w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/50 text-emerald-400 font-bold font-mono text-xs tracking-wider uppercase transition flex items-center justify-center gap-1.5";
    }

    lucide.createIcons();
  }

  /**
   * Adjust Radar Radius & Update UI/Engine
   */
  function setRadarRadius(newRadiusMeters) {
    state.maxRadiusMeters = newRadiusMeters;
    const slider = document.getElementById("range-slider");
    if (slider) slider.value = newRadiusMeters;
    const rangeDisplay = document.getElementById("range-value-display");
    if (rangeDisplay) {
      rangeDisplay.textContent = newRadiusMeters >= 1000 ? `${(newRadiusMeters / 1000).toFixed(1)} km` : `${newRadiusMeters} m`;
      rangeDisplay.className = newRadiusMeters === 500
        ? "text-emerald-400 font-bold min-w-[46px] text-right"
        : "text-cyan-400 font-bold min-w-[46px] text-right";
    }
    if (radarEngine) {
      radarEngine.setMaxRadius(newRadiusMeters);
    }
    recalculateAndRender();
  }

  /**
   * Render Sidebar Live Nearby Feed
   */
  function renderNearbyFeed() {
    const list = document.getElementById("radar-feed-list");
    list.innerHTML = "";

    if (state.filteredItems.length === 0) {
      const campusName = state.activeCampus ? (state.activeCampus.shortName || state.activeCampus.name) : "Your Zone";
      const currentKm = ((state.maxRadiusMeters || 500) / 1000).toFixed(1);

      list.innerHTML = `
        <div class="py-6 px-3.5 text-center rounded-xl bg-slate-900/80 border border-cyan-500/30 font-mono text-xs shadow-[0_0_20px_rgba(0,229,255,0.06)]">
          <div class="w-11 h-11 mx-auto mb-2.5 rounded-full bg-cyan-950/90 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.25)]">
            <i data-lucide="crosshair" class="w-5 h-5 animate-pulse"></i>
          </div>
          <p class="font-bold text-slate-100 text-xs mb-1">0 Beacons Scanned Within ${currentKm} km</p>
          <p class="text-[11px] text-slate-400 mb-3.5 leading-relaxed max-w-xs mx-auto">
            No active student listings detected at ${campusName}. Expand your radar radius or broadcast the first beacon!
          </p>

          <!-- 1-Tap Radius Expansion Buttons -->
          <div class="flex items-center justify-center gap-2 mb-3">
            <button id="btn-feed-expand-2km" type="button" class="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer">
              <i data-lucide="maximize-2" class="w-3 h-3"></i>
              <span>Expand to 2.0 km</span>
            </button>
            <button id="btn-feed-expand-5km" type="button" class="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer">
              <i data-lucide="maximize" class="w-3 h-3"></i>
              <span>Expand to 5.0 km</span>
            </button>
          </div>

          <!-- Quick Action Buttons -->
          <div class="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-slate-800">
            <button id="btn-feed-empty-broadcast" type="button" class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow-[0_0_10px_rgba(0,255,157,0.3)] flex items-center gap-1">
              <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
              <span>Post Item</span>
            </button>
            <button id="btn-feed-empty-wanted" type="button" class="px-3 py-1.5 rounded-lg bg-pink-950 hover:bg-pink-900 border border-pink-500/50 text-pink-300 font-bold text-xs transition cursor-pointer flex items-center gap-1">
              <i data-lucide="target" class="w-3.5 h-3.5"></i>
              <span>Post Wanted</span>
            </button>
            <button id="btn-feed-empty-waitlist" type="button" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-amber-300 text-xs font-bold transition cursor-pointer flex items-center gap-1">
              <i data-lucide="bell-ring" class="w-3.5 h-3.5 text-amber-400"></i>
              <span>Campus Waitlist</span>
            </button>
          </div>
        </div>
      `;

      // Wire Fallback Action Buttons
      const btnExp2 = document.getElementById("btn-feed-expand-2km");
      if (btnExp2) btnExp2.onclick = () => setRadarRadius(2000);

      const btnExp5 = document.getElementById("btn-feed-expand-5km");
      if (btnExp5) btnExp5.onclick = () => setRadarRadius(5000);

      const emptyBroadcastBtn = document.getElementById("btn-feed-empty-broadcast");
      if (emptyBroadcastBtn) {
        emptyBroadcastBtn.onclick = () => {
          const openSellBtn = document.getElementById("btn-open-sell-modal");
          if (openSellBtn) openSellBtn.click();
        };
      }

      const emptyWantedBtn = document.getElementById("btn-feed-empty-wanted");
      if (emptyWantedBtn) {
        emptyWantedBtn.onclick = () => {
          const openSellBtn = document.getElementById("btn-open-sell-modal");
          if (openSellBtn) {
            openSellBtn.click();
            const wantedRadio = document.querySelector("input[name='sell-beacon-type'][value='wanted']");
            if (wantedRadio) {
              wantedRadio.checked = true;
              wantedRadio.dispatchEvent(new Event("change"));
            }
          }
        };
      }

      const emptyWaitlistBtn = document.getElementById("btn-feed-empty-waitlist");
      if (emptyWaitlistBtn) {
        emptyWaitlistBtn.onclick = () => {
          const waitlistModal = document.getElementById("modal-campus-waitlist");
          if (waitlistModal) {
            waitlistModal.classList.remove("hidden");
            const campusInput = document.getElementById("waitlist-campus-name");
            if (campusInput && state.activeCampus) {
              campusInput.value = state.activeCampus.name || "";
            }
          }
        };
      }

      lucide.createIcons();
      return;
    }

    state.filteredItems.forEach((target) => {
      const item = target.item;
      const isSelected = state.selectedTarget && state.selectedTarget.item.id === item.id;
      const inRange = target.inRadarRange;

      const itemCard = document.createElement("div");
      itemCard.className = `p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between gap-3 ${
        isSelected
          ? "bg-cyan-950/60 border-cyan-400/80 shadow-[0_0_12px_rgba(0,229,255,0.2)]"
          : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700"
      }`;
      itemCard.dataset.itemId = item.id;

      const categoryDotClass =
        item.beacon_type === "wanted" ? "bg-[#ff0077]" :
        item.category === "stationery" ? "bg-[#00ff9d]" :
        item.category === "books" ? "bg-[#00e5ff]" :
        item.category === "hostel" ? "bg-[#f59e0b]" :
        item.category === "lab" ? "bg-[#a855f7]" :
        item.category === "tech" ? "bg-[#3b82f6]" : "bg-[#00e5ff]";

      const itemImg = item.image || (PRESET_PHOTOS[item.category] || PRESET_PHOTOS.stationery)[0];

      itemCard.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="relative shrink-0 cursor-zoom-in feed-img-container" title="Click to inspect photo">
            <img src="${itemImg}" alt="${item.title}" class="w-10 h-10 rounded-md object-cover border border-slate-700 hover:border-cyan-400 bg-slate-950 transition" />
            <span class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-950 ${categoryDotClass}"></span>
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-bold text-slate-200 truncate ${isSelected ? 'text-cyan-300' : ''}">${item.title}</h4>
            <div class="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 mt-0.5 flex-wrap">
              <span class="px-1.5 py-0.2 rounded font-bold ${target.distance <= 500 ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : (target.proximityTier?.bgClass || 'bg-cyan-950 text-cyan-300')}">📍 ${target.distanceFormatted}</span>
              ${target.distance <= 500 ? '<span class="text-[9px] font-bold text-emerald-400">🟢 &lt;500m</span>' : ''}
              <span class="text-slate-300 font-semibold">• ${target.walkingTime}</span>
              <span class="text-slate-500 hidden sm:inline">• ${item.landmark || 'Campus'}</span>
            </div>
            <div class="text-[10px] text-slate-400 truncate mt-0.5 font-mono">
              Seller: <strong class="text-slate-300">${item.seller?.name || item.seller_name || 'Campus Student'}</strong> <span class="text-amber-400">(${(item.seller?.rating || 4.9).toFixed(1)} ★)</span>
            </div>
          </div>
        </div>
        
        <div class="text-right shrink-0 font-mono">
          <div class="text-xs font-bold text-emerald-400">₹${item.price}</div>
          <div class="text-[10px] font-bold ${
            target.algorithmScore >= 80 ? 'text-emerald-400' : target.algorithmScore >= 60 ? 'text-cyan-400' : 'text-amber-400'
          }">SCORE: ${target.algorithmScore}</div>
        </div>
      `;

      const imgTrigger = itemCard.querySelector(".feed-img-container");
      if (imgTrigger) {
        imgTrigger.addEventListener("click", (e) => {
          e.stopPropagation();
          if (window.openPhotoLightbox) {
            const safeImg = item.image || (PRESET_PHOTOS[item.category] || PRESET_PHOTOS.stationery)[0];
            window.openPhotoLightbox(safeImg, item.title, item.condition || "Authentic Photo");
          }
        });
      }

      itemCard.addEventListener("click", () => {
        selectTarget(target);
      });

      list.appendChild(itemCard);
    });

    lucide.createIcons();
  }

  function highlightFeedItem(itemId) {
    const list = document.getElementById("radar-feed-list");
    const cards = list.querySelectorAll("[data-item-id]");
    cards.forEach((card) => {
      if (card.dataset.itemId === itemId) {
        card.className = card.className.replace(/bg-slate-900\/60|border-slate-800\/80/g, "");
        card.classList.add("bg-cyan-950/60", "border-cyan-400/80", "shadow-[0_0_12px_rgba(0,229,255,0.2)]");
      } else {
        card.classList.remove("bg-cyan-950/60", "border-cyan-400/80", "shadow-[0_0_12px_rgba(0,229,255,0.2)]");
      }
    });
  }

  /**
   * Render Catalog Grid View
   */
  function renderCatalogGrid() {
    const grid = document.getElementById("catalog-grid");
    grid.innerHTML = "";

    if (state.filteredItems.length === 0) {
      const campusName = state.activeCampus ? (state.activeCampus.shortName || state.activeCampus.name) : "Your Zone";
      const currentKm = ((state.maxRadiusMeters || 500) / 1000).toFixed(1);

      grid.innerHTML = `
        <div class="col-span-full py-12 px-4 text-center rounded-2xl bg-slate-900/60 border border-cyan-500/30 font-mono shadow-[0_0_30px_rgba(0,229,255,0.06)]">
          <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.25)]">
            <i data-lucide="crosshair" class="w-7 h-7 animate-pulse"></i>
          </div>
          <h3 class="text-base font-bold text-white mb-1">0 Products Listed Within ${currentKm} km of ${campusName}</h3>
          <p class="text-xs text-slate-400 max-w-md mx-auto mb-4 leading-relaxed">
            Only verified items within your selected campus perimeter are shown. Expand your radar range or broadcast the first item to seed your campus!
          </p>

          <!-- 1-Tap Radius Expansion Buttons -->
          <div class="flex flex-wrap items-center justify-center gap-2 mb-4">
            <button id="btn-grid-expand-2km" type="button" class="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer">
              <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>
              <span>Expand to 2.0 km</span>
            </button>
            <button id="btn-grid-expand-5km" type="button" class="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer">
              <i data-lucide="maximize" class="w-3.5 h-3.5"></i>
              <span>Expand to 5.0 km</span>
            </button>
          </div>

          <!-- Primary Actions -->
          <div class="flex flex-wrap items-center justify-center gap-2.5 pt-3 border-t border-slate-800/80">
            <button id="btn-grid-empty-broadcast" type="button" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow-[0_0_15px_rgba(0,255,157,0.35)]">
              <i data-lucide="plus-circle" class="w-4 h-4"></i> Post Item
            </button>
            <button id="btn-grid-empty-wanted" type="button" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-950 hover:bg-pink-900 border border-pink-500/50 text-pink-300 font-bold text-xs transition cursor-pointer">
              <i data-lucide="target" class="w-4 h-4"></i> Post Wanted Request
            </button>
            <button id="btn-grid-empty-waitlist" type="button" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-amber-300 font-bold text-xs transition cursor-pointer">
              <i data-lucide="bell-ring" class="w-4 h-4 text-amber-400"></i> Join Campus Waitlist
            </button>
          </div>
        </div>
      `;

      const gridExp2 = document.getElementById("btn-grid-expand-2km");
      if (gridExp2) gridExp2.onclick = () => setRadarRadius(2000);

      const gridExp5 = document.getElementById("btn-grid-expand-5km");
      if (gridExp5) gridExp5.onclick = () => setRadarRadius(5000);

      const emptyGridBroadcastBtn = document.getElementById("btn-grid-empty-broadcast");
      if (emptyGridBroadcastBtn) {
        emptyGridBroadcastBtn.onclick = () => {
          const openSellBtn = document.getElementById("btn-open-sell-modal");
          if (openSellBtn) openSellBtn.click();
        };
      }

      const emptyGridWantedBtn = document.getElementById("btn-grid-empty-wanted");
      if (emptyGridWantedBtn) {
        emptyGridWantedBtn.onclick = () => {
          const openSellBtn = document.getElementById("btn-open-sell-modal");
          if (openSellBtn) {
            openSellBtn.click();
            const wantedRadio = document.querySelector("input[name='sell-beacon-type'][value='wanted']");
            if (wantedRadio) {
              wantedRadio.checked = true;
              wantedRadio.dispatchEvent(new Event("change"));
            }
          }
        };
      }

      const emptyGridWaitlistBtn = document.getElementById("btn-grid-empty-waitlist");
      if (emptyGridWaitlistBtn) {
        emptyGridWaitlistBtn.onclick = () => {
          const waitlistModal = document.getElementById("modal-campus-waitlist");
          if (waitlistModal) {
            waitlistModal.classList.remove("hidden");
            const campusInput = document.getElementById("waitlist-campus-name");
            if (campusInput && state.activeCampus) {
              campusInput.value = state.activeCampus.name || "";
            }
          }
        };
      }

      lucide.createIcons();
      return;
    }

    state.filteredItems.forEach((target) => {
      const item = target.item;
      const origPrice = item.original_price || item.originalPrice;

      const card = document.createElement("div");
      card.className = "glass-panel glass-panel-hover p-4 flex flex-col justify-between relative overflow-hidden group";

      const itemImg = item.image || (PRESET_PHOTOS[item.category] || PRESET_PHOTOS.stationery)[0];

      card.innerHTML = `
        <div>
          <!-- Top Media & Badges -->
          <div class="relative w-full aspect-video rounded-lg overflow-hidden mb-3 bg-slate-950 border border-slate-800 cursor-zoom-in catalog-image-trigger group/img" title="Click to inspect photo in high resolution">
            <img 
              src="${itemImg}" 
              alt="${item.title}" 
              class="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
            <div class="absolute inset-0 bg-slate-950/30 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center">
              <span class="px-2 py-1 rounded bg-slate-950/80 border border-cyan-400/50 text-cyan-300 font-mono text-[10px] font-bold flex items-center gap-1 shadow-md">
                <i data-lucide="zoom-in" class="w-3.5 h-3.5"></i> Inspect
              </span>
            </div>
            <div class="absolute top-2 left-2 flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                item.beacon_type === 'wanted' ? 'bg-pink-950 text-pink-300 border border-pink-500/40' :
                item.category === 'stationery' ? 'badge-stationery' :
                item.category === 'books' ? 'badge-book' :
                item.category === 'hostel' ? 'badge-hostel' :
                item.category === 'lab' ? 'badge-lab' :
                item.category === 'tech' ? 'badge-tech' : 'badge-stationery'
              }">
                ${
                  item.beacon_type === 'wanted' ? '🚨 Wanted' :
                  item.category === 'stationery' ? '✏️ Stationery' :
                  item.category === 'books' ? '📖 Books' :
                  item.category === 'hostel' ? '🛏️ Hostel' :
                  item.category === 'lab' ? '🔬 Lab Gear' :
                  item.category === 'tech' ? '🔌 Tech' : '📦 Item'
                }
              </span>
            </div>
            <div class="absolute top-2 right-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950/80 border border-cyan-400/50 text-cyan-300">
                ⚡ ${target.algorithmScore} ALGO
              </span>
            </div>
            ${
              target.breakdown.discountPct > 0
                ? `<div class="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                    ${target.breakdown.discountPct}% OFF
                  </div>`
                : ""
            }
          </div>

          <!-- Title & Specs -->
          <h3 class="font-bold text-sm text-white mb-1.5 line-clamp-2 leading-snug">${item.title}</h3>
          
          <div class="flex items-center gap-2 text-[11px] font-mono text-slate-400 mb-2">
            <span class="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">${item.condition}</span>
            <span>•</span>
            <span class="text-cyan-400 flex items-center gap-1">
              <i data-lucide="navigation" class="w-3 h-3"></i>
              ${target.distanceFormatted}
            </span>
          </div>

          <p class="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
            ${item.description || "Available for campus pickup."}
          </p>
        </div>

        <!-- Footer Pricing & Signal Action -->
        <div class="pt-3 border-t border-slate-800/80">
          <div class="flex items-baseline justify-between mb-3">
            <div class="flex items-baseline gap-1.5 font-mono">
              <span class="text-lg font-bold text-emerald-400">₹${item.price}</span>
              ${origPrice ? `<span class="text-xs text-slate-500 line-through">₹${origPrice}</span>` : ''}
            </div>
            <div class="flex items-center gap-1 text-xs text-slate-400">
              <span class="text-[11px] truncate max-w-[100px]">${item.seller?.name || item.seller_name || 'Peer'}</span>
              <span class="text-amber-400 text-[10px]">★${(item.seller?.rating || 4.9).toFixed(1)}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button class="btn-grid-chat py-1.5 px-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-xs font-bold uppercase transition flex items-center justify-center gap-1">
              <i data-lucide="message-square" class="w-3.5 h-3.5"></i>
              <span>Signal</span>
            </button>
            <button class="btn-grid-scope py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs transition flex items-center justify-center gap-1">
              <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
              <span>Scope</span>
            </button>
          </div>
        </div>
      `;

      // Media Lightbox trigger
      const imgTrigger = card.querySelector(".catalog-image-trigger");
      if (imgTrigger) {
        imgTrigger.addEventListener("click", (e) => {
          e.stopPropagation();
          if (window.openPhotoLightbox) {
            const safeImg = item.image || (PRESET_PHOTOS[item.category] || PRESET_PHOTOS.stationery)[0];
            window.openPhotoLightbox(safeImg, item.title, item.condition || "Authentic Photo");
          }
        });
      }

      // Button listeners
      card.querySelector(".btn-grid-chat").addEventListener("click", () => {
        selectTarget(target);
        openChatModal(target);
      });

      card.querySelector(".btn-grid-scope").addEventListener("click", () => {
        selectTarget(target);
        switchView("radar");
      });

      grid.appendChild(card);
    });

    lucide.createIcons();
  }

  /**
   * Handle Tooltip positioning when hovering radar blips
   */
  function handleRadarHover(target) {
    const tooltip = document.getElementById("radar-blip-tooltip");
    if (!target) {
      tooltip.classList.add("hidden");
      return;
    }

    const coords = radarEngine.getScreenCoords(target);
    const item = target.item;

    document.getElementById("tip-title").textContent = item.title;
    document.getElementById("tip-price").textContent = `₹${item.price}`;
    document.getElementById("tip-distance").textContent = `📍 ${target.distanceFormatted} from your live GPS (${target.walkingTime || 'walk'})`;
    document.getElementById("tip-score-badge").textContent = `⚡ ${target.algorithmScore}`;

    const catBadge = document.getElementById("tip-category-badge");
    if (item.category === "stationery") {
      catBadge.className = "px-1.5 py-0.5 rounded text-[10px] font-bold badge-stationery";
      catBadge.textContent = "✏️ Stationery";
    } else {
      catBadge.className = "px-1.5 py-0.5 rounded text-[10px] font-bold badge-book";
      catBadge.textContent = "📖 Book";
    }

    const offsetX = coords.x > radarEngine.width / 2 ? -215 : 15;
    const offsetY = coords.y > radarEngine.height / 2 ? -80 : 15;

    tooltip.style.left = `${coords.x + offsetX}px`;
    tooltip.style.top = `${coords.y + offsetY}px`;
    tooltip.classList.remove("hidden");
  }

  /**
   * Setup UI Event Listeners
   */
  function setupEventListeners() {
    // 1. Radar Range Slider & 500m Zone Quick Filter
    const rangeSlider = document.getElementById("range-slider");
    const rangeDisplay = document.getElementById("range-value-display");
    const quick500Btn = document.getElementById("btn-quick-500m");

    if (quick500Btn) {
      quick500Btn.addEventListener("click", () => {
        state.maxRadiusMeters = 500;
        if (rangeSlider) rangeSlider.value = 500;
        if (rangeDisplay) {
          rangeDisplay.textContent = "500 m";
          rangeDisplay.className = "text-emerald-400 font-bold min-w-[46px] text-right";
        }
        if (radarEngine) radarEngine.setMaxRadius(500);
        recalculateAndRender();
        showToast("500M ZONE LOCKED", "Radar locked to 500m campus walking perimeter.");
      });
    }

    rangeSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      state.maxRadiusMeters = val;
      rangeDisplay.textContent = val >= 1000 ? `${(val / 1000).toFixed(1)} km` : `${val} m`;
      // Keep emerald color when locked to 500m zone, otherwise revert to normal cyan
      rangeDisplay.className = val === 500
        ? "text-emerald-400 font-bold min-w-[46px] text-right"
        : "text-cyan-400 font-bold min-w-[46px] text-right";
      if (radarEngine) {
        radarEngine.setMaxRadius(val);
      }
      recalculateAndRender();
    });

    // 2. Category Filter Pills
    const filterBtns = document.querySelectorAll(".filter-category-btn");
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        filterBtns.forEach((b) => {
          b.className = "filter-category-btn px-3 py-1.5 rounded-md text-slate-400 hover:text-slate-200 transition shrink-0";
        });
        const cat = btn.dataset.category;
        if (cat === "wanted") {
          btn.className = "filter-category-btn px-3 py-1.5 rounded-md text-pink-300 bg-pink-950/80 border border-pink-500/40 transition shrink-0";
        } else if (cat === "hostel") {
          btn.className = "filter-category-btn px-3 py-1.5 rounded-md text-amber-300 bg-amber-950/80 border border-amber-500/40 transition shrink-0";
        } else if (cat === "lab") {
          btn.className = "filter-category-btn px-3 py-1.5 rounded-md text-purple-300 bg-purple-950/80 border border-purple-500/40 transition shrink-0";
        } else if (cat === "tech") {
          btn.className = "filter-category-btn px-3 py-1.5 rounded-md text-blue-300 bg-blue-950/80 border border-blue-500/40 transition shrink-0";
        } else {
          btn.className = "filter-category-btn px-3 py-1.5 rounded-md text-cyan-400 bg-cyan-950/80 border border-cyan-500/30 transition shrink-0";
        }
        state.selectedCategory = cat;
        recalculateAndRender();
      });
    });

    // 3. Search Input
    const searchInput = document.getElementById("search-input");
    const searchClearBtn = document.getElementById("search-clear-btn");

    const campusSuggestBox = document.getElementById("search-campus-suggestion");
    const campusSuggestList = document.getElementById("search-campus-suggestion-list");
    let matchedCampusCandidates = [];

    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim();
      state.searchQuery = q;
      if (q.length > 0) {
        searchClearBtn.classList.remove("hidden");
      } else {
        searchClearBtn.classList.add("hidden");
      }

      // Check if user is typing an Indian college or campus
      if (window.IndianCampuses && q.length >= 2) {
        const matches = window.IndianCampuses.searchCampuses(q, 4);
        if (matches && matches.length > 0) {
          matchedCampusCandidates = matches;
          if (campusSuggestList) {
            campusSuggestList.innerHTML = "";
            matches.forEach((m) => {
              let distTag = "";
              if (typeof state.userLocation.lat === "number" && typeof state.userLocation.lng === "number") {
                const dist = calculateDistanceMeters(state.userLocation.lat, state.userLocation.lng, m.lat, m.lng);
                distTag = `<span class="text-[10px] text-slate-400 font-mono">${formatDistance(dist)}</span>`;
              }
              const row = document.createElement("div");
              row.className = "p-2 rounded-lg bg-slate-900/90 hover:bg-cyan-950/60 border border-slate-800 hover:border-cyan-500/60 transition flex items-center justify-between gap-2 cursor-pointer group";
              row.innerHTML = `
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0 border border-cyan-500/40 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-colors">
                    <i data-lucide="graduation-cap" class="w-4 h-4"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="font-bold text-white group-hover:text-cyan-200 truncate text-xs">${m.shortName || m.name}</div>
                    <div class="text-[10px] text-slate-400 truncate flex items-center gap-1.5">
                      <span>${m.city}, ${m.state}</span>
                      <span class="px-1 py-0.2 rounded bg-slate-800 text-[9px] text-cyan-400 border border-slate-700 uppercase">${m.category || 'CAMPUS'}</span>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  ${distTag}
                  <button type="button" class="px-2.5 py-1 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] shrink-0 shadow-[0_0_10px_rgba(0,229,255,0.3)] transition">
                    Lock
                  </button>
                </div>
              `;
              row.addEventListener("click", () => {
                selectCampus(m);
                if (campusSuggestBox) campusSuggestBox.classList.add("hidden");
                searchInput.value = "";
                state.searchQuery = "";
                searchClearBtn.classList.add("hidden");
                recalculateAndRender();
              });
              campusSuggestList.appendChild(row);
            });
            if (window.lucide) lucide.createIcons();
          }
          if (campusSuggestBox) campusSuggestBox.classList.remove("hidden");
        } else {
          matchedCampusCandidates = [];
          if (campusSuggestBox) campusSuggestBox.classList.add("hidden");
        }
      } else {
        matchedCampusCandidates = [];
        if (campusSuggestBox) campusSuggestBox.classList.add("hidden");
      }

      recalculateAndRender();
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && matchedCampusCandidates.length > 0 && campusSuggestBox && !campusSuggestBox.classList.contains("hidden")) {
        e.preventDefault();
        selectCampus(matchedCampusCandidates[0]);
        campusSuggestBox.classList.add("hidden");
        searchInput.value = "";
        state.searchQuery = "";
        searchClearBtn.classList.add("hidden");
        recalculateAndRender();
      }
    });

    // Close autocomplete when clicking outside
    document.addEventListener("click", (e) => {
      if (campusSuggestBox && !campusSuggestBox.contains(e.target) && e.target !== searchInput) {
        campusSuggestBox.classList.add("hidden");
      }
    });

    searchClearBtn.addEventListener("click", () => {
      searchInput.value = "";
      state.searchQuery = "";
      searchClearBtn.classList.add("hidden");
      if (campusSuggestBox) campusSuggestBox.classList.add("hidden");
      recalculateAndRender();
    });

    // 4. View Mode Switcher
    const radarBtn = document.getElementById("view-radar-btn");
    const mapBtn = document.getElementById("view-map-btn");
    const gridBtn = document.getElementById("view-grid-btn");

    if (radarBtn) radarBtn.addEventListener("click", () => switchView("radar"));
    if (mapBtn) mapBtn.addEventListener("click", () => switchView("map"));
    if (gridBtn) gridBtn.addEventListener("click", () => switchView("grid"));

    // 5. Grid Sort Selector
    const gridSort = document.getElementById("grid-sort-select");
    gridSort.addEventListener("change", (e) => {
      state.gridSortBy = e.target.value;
      sortItems();
      renderCatalogGrid();
    });

    // 6. Audio Sonar Toggle
    const audioBtn = document.getElementById("btn-audio-toggle");
    const audioIcon = document.getElementById("audio-icon");
    const audioText = document.getElementById("audio-text");

    audioBtn.addEventListener("click", () => {
      state.audioEnabled = !state.audioEnabled;
      if (radarEngine) {
        radarEngine.setAudioEnabled(state.audioEnabled);
      }
      if (state.audioEnabled) {
        audioIcon.setAttribute("data-lucide", "volume-2");
        audioText.textContent = "SONAR ON";
        audioBtn.classList.add("text-cyan-400", "border-cyan-500/40");
      } else {
        audioIcon.setAttribute("data-lucide", "volume-x");
        audioText.textContent = "SONAR OFF";
        audioBtn.classList.remove("text-cyan-400", "border-cyan-500/40");
      }
      lucide.createIcons();
    });

    // 7. Live GPS Surroundings Scanner Button
    const scanGpsBtn = document.getElementById("btn-scan-live-gps");
    if (scanGpsBtn) {
      scanGpsBtn.addEventListener("click", () => {
        activateLiveAreaScan();
      });
    }

    // 8. Pan-India Campus & Location Selectors
    const campusBtn = document.getElementById("btn-open-campus-search");
    if (campusBtn) {
      campusBtn.addEventListener("click", () => openCampusSearchModal());
    }

    const searchBarCampusBtn = document.getElementById("btn-search-bar-campus");
    if (searchBarCampusBtn) {
      searchBarCampusBtn.addEventListener("click", () => openCampusSearchModal());
    }

    const locSelect = document.getElementById("location-select");
    if (locSelect) {
      locSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val === "gps_real") {
          activateLiveAreaScan();
        } else if (val === "set_pin_location") {
          openCampusLocationPicker();
          locSelect.value = "gps_real";
        }
      });
    }

    const hudClick = document.getElementById("btn-hud-location-click");
    if (hudClick) {
      hudClick.addEventListener("click", () => {
        openCampusSearchModal();
      });
    }

    setupCampusSearchModal();

    // 8. Modals
    setupSellModal();
    setupPhotoLightbox();
    setupAlgorithmModal();
    setupChatModal();
    handshakeModal = setupHandshakeModal();
    setupMobileModal();
    setupGoogleAuthModal();
    setupMyBeaconsModal();
    updateMyBeaconsBadge();
    setupBountyBoardModal();
    updateBountyBadge();
    arCompassModalInstance = setupARCompassModal();

    // AR Live Finder Button in Spotlight Panel
    const arFinderBtn = document.getElementById("btn-open-ar-compass");
    if (arFinderBtn) {
      arFinderBtn.addEventListener("click", () => {
        if (!arCompassModalInstance) arCompassModalInstance = setupARCompassModal();
        let target = state.selectedTarget;
        if (!target && state.filteredItems.length > 0) {
          target = state.filteredItems[0];
          selectTarget(target);
        }
        if (target && arCompassModalInstance) {
          arCompassModalInstance.open(target);
        } else {
          showToast("NO TARGET ACQUIRED", "Please click on any radar beacon or item first.");
        }
      });
    }

    // 9. Reserve Item Button
    document.getElementById("btn-reserve-item").addEventListener("click", async () => {
      if (!state.selectedTarget) return;
      const itemId = state.selectedTarget.item.id;
      
      if (window.MarketAPI) {
        const res = await MarketAPI.toggleReserve(itemId);
        if (res.success) {
          state.selectedTarget.item.reserved_by = res.reserved_by;
          renderTargetSpotlight(state.selectedTarget);
          showToast("RESERVATION UPDATED", res.is_reserved ? "Item successfully reserved for you!" : "Reservation cancelled.");
        } else {
          alert(res.error || "Could not reserve item");
        }
      }
    });

    // 10. Floating Mobile Dual-View Switcher (HUD vs Feed List)
    const mobileToggleRadar = document.getElementById("mobile-toggle-radar");
    const mobileToggleFeed = document.getElementById("mobile-toggle-feed");
    const radarScopeCard = document.getElementById("radar-scope-card");
    const nearbyTargetsPanel = document.getElementById("selected-target-panel");

    if (mobileToggleRadar && mobileToggleFeed) {
      mobileToggleRadar.addEventListener("click", () => {
        mobileToggleRadar.className = "px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 flex items-center gap-1.5 transition cursor-pointer";
        mobileToggleFeed.className = "px-3.5 py-1.5 rounded-full text-xs font-mono font-bold text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition cursor-pointer";
        if (radarScopeCard) {
          radarScopeCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });

      mobileToggleFeed.addEventListener("click", () => {
        mobileToggleFeed.className = "px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 flex items-center gap-1.5 transition cursor-pointer";
        mobileToggleRadar.className = "px-3.5 py-1.5 rounded-full text-xs font-mono font-bold text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition cursor-pointer";
        const feedList = document.getElementById("radar-feed-list");
        if (feedList) {
          feedList.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (nearbyTargetsPanel) {
          nearbyTargetsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    // 11. Campus Waitlist Modal Form Handling
    const btnOpenWaitlist = document.getElementById("btn-campus-open-waitlist");
    const waitlistModal = document.getElementById("modal-campus-waitlist");
    const btnCloseWaitlist = document.getElementById("btn-close-campus-waitlist");
    const btnCancelWaitlist = document.getElementById("btn-cancel-campus-waitlist");
    const formWaitlist = document.getElementById("form-campus-waitlist");
    const waitlistMsg = document.getElementById("waitlist-status-msg");

    if (btnOpenWaitlist && waitlistModal) {
      btnOpenWaitlist.addEventListener("click", () => {
        const campusSearchInput = document.getElementById("campus-search-input");
        const waitlistCampusInput = document.getElementById("waitlist-campus-name");
        if (waitlistCampusInput) {
          waitlistCampusInput.value = campusSearchInput?.value?.trim() || "";
        }
        waitlistModal.classList.remove("hidden");
      });
    }

    const closeWaitlistModal = () => {
      if (waitlistModal) waitlistModal.classList.add("hidden");
      if (waitlistMsg) {
        waitlistMsg.classList.add("hidden");
        waitlistMsg.textContent = "";
      }
    };
    if (btnCloseWaitlist) btnCloseWaitlist.addEventListener("click", closeWaitlistModal);
    if (btnCancelWaitlist) btnCancelWaitlist.addEventListener("click", closeWaitlistModal);

    if (formWaitlist) {
      formWaitlist.addEventListener("submit", async (e) => {
        e.preventDefault();
        const campusName = document.getElementById("waitlist-campus-name")?.value?.trim();
        const email = document.getElementById("waitlist-email")?.value?.trim();
        const submitBtn = document.getElementById("btn-submit-campus-waitlist");

        if (!campusName || !email) return;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<span>⏳</span> <span>Joining...</span>`;
        }

        try {
          if (window.MarketAPI && typeof MarketAPI.submitCampusWaitlist === "function") {
            const res = await MarketAPI.submitCampusWaitlist(campusName, email);
            if (waitlistMsg) {
              waitlistMsg.className = "text-xs p-2.5 rounded-lg font-mono bg-emerald-950/80 border border-emerald-500/50 text-emerald-300";
              waitlistMsg.textContent = res.message || `Joined waitlist for ${campusName}!`;
              waitlistMsg.classList.remove("hidden");
            }
            showToast("WAITLIST CONFIRMED", `We will alert ${email} when ${campusName} goes live.`);
            setTimeout(closeWaitlistModal, 2000);
          } else {
            showToast("WAITLIST SAVED", `Saved waitlist entry for ${campusName}.`);
            closeWaitlistModal();
          }
        } catch (err) {
          if (waitlistMsg) {
            waitlistMsg.className = "text-xs p-2.5 rounded-lg font-mono bg-rose-950/80 border border-rose-500/50 text-rose-300";
            waitlistMsg.textContent = err.message || "Failed to submit waitlist. Please try again.";
            waitlistMsg.classList.remove("hidden");
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i data-lucide="send" class="w-3.5 h-3.5"></i> <span>Join Campus Waitlist</span>`;
            lucide.createIcons();
          }
        }
      });
    }

    // 12. Universal Email Institutional Domain Recognition
    const universalEmailInput = document.getElementById("input-universal-email");
    const emailDomainRecognizer = document.getElementById("email-domain-recognizer");
    if (universalEmailInput && emailDomainRecognizer) {
      universalEmailInput.addEventListener("input", (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (val.includes(".ac.in") || val.includes(".edu.in") || val.includes(".edu")) {
          emailDomainRecognizer.classList.remove("hidden");
        } else {
          emailDomainRecognizer.classList.add("hidden");
        }
      });
    }

    // 13. Real-time Communication Alerts & Header Inbox
    setupCommunicationAlerts();
  }

  function switchView(mode) {
    state.currentView = mode;
    const radarContainer = document.getElementById("radar-mode-container");
    const gridContainer = document.getElementById("grid-mode-container");
    const radarScopeCard = document.getElementById("radar-scope-card");
    const mapScopeCard = document.getElementById("map-scope-card");
    const radarBtn = document.getElementById("view-radar-btn");
    const mapBtn = document.getElementById("view-map-btn");
    const gridBtn = document.getElementById("view-grid-btn");

    const activeBtnClass = "px-3 py-1.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 transition";
    const inactiveBtnClass = "px-3 py-1.5 rounded-md text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition";

    if (mode === "radar") {
      if (radarContainer) radarContainer.classList.remove("hidden");
      if (gridContainer) gridContainer.classList.add("hidden");
      if (radarScopeCard) radarScopeCard.classList.remove("hidden");
      if (mapScopeCard) mapScopeCard.classList.add("hidden");
      if (radarBtn) radarBtn.className = activeBtnClass;
      if (mapBtn) mapBtn.className = inactiveBtnClass;
      if (gridBtn) gridBtn.className = inactiveBtnClass;
      if (radarEngine) {
        radarEngine.initCanvas();
      }
    } else if (mode === "map") {
      if (radarContainer) radarContainer.classList.remove("hidden");
      if (gridContainer) gridContainer.classList.add("hidden");
      if (radarScopeCard) radarScopeCard.classList.add("hidden");
      if (mapScopeCard) mapScopeCard.classList.remove("hidden");
      if (radarBtn) radarBtn.className = inactiveBtnClass;
      if (mapBtn) mapBtn.className = activeBtnClass;
      if (gridBtn) gridBtn.className = inactiveBtnClass;
      initCampusMap();
      renderCampusMapPins();
    } else { // "grid"
      if (radarContainer) radarContainer.classList.add("hidden");
      if (gridContainer) gridContainer.classList.remove("hidden");
      if (radarBtn) radarBtn.className = inactiveBtnClass;
      if (mapBtn) mapBtn.className = inactiveBtnClass;
      if (gridBtn) gridBtn.className = activeBtnClass;
      renderCatalogGrid();
    }
  }

  /**
   * Open Official Interactive Google Maps Modal
   * Loads public Google Maps embed iframe + provides 1-tap walking directions intent (No API Key Required)
   */
  function openGoogleMapsModal(destLat, destLng, landmarkName) {
    if (!destLat || !destLng) {
      showToast("LOCATION MISSING", "Coordinates not available for this item.");
      return;
    }

    const modal = document.getElementById("modal-google-maps-embed");
    const iframe = document.getElementById("gmaps-embed-iframe");
    const loader = document.getElementById("gmaps-iframe-loader");
    const subtitle = document.getElementById("gmaps-modal-subtitle");
    const coordsEl = document.getElementById("gmaps-modal-coords");
    const landmarkEl = document.getElementById("gmaps-modal-landmark");
    const copyBtn = document.getElementById("btn-gmaps-copy-coords");
    const launchBtn = document.getElementById("btn-gmaps-launch-app");
    const closeBtn = document.getElementById("btn-close-gmaps-modal");

    const cleanLat = Number(destLat).toFixed(5);
    const cleanLng = Number(destLng).toFixed(5);
    const cleanLandmark = landmarkName || "Campus Pickup Spot";

    if (!modal || !iframe) {
      // Direct fallback to Google Maps directions
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${cleanLat},${cleanLng}&travelmode=walking`, "_blank");
      return;
    }

    if (subtitle) subtitle.textContent = cleanLandmark;
    if (coordsEl) coordsEl.textContent = `${cleanLat}, ${cleanLng}`;
    if (landmarkEl) landmarkEl.textContent = cleanLandmark;

    if (loader) {
      loader.classList.remove("opacity-0", "hidden");
    }

    // Official Google Maps public embed (100% free, full interactive map with pins, zero API key)
    iframe.src = `https://maps.google.com/maps?q=${cleanLat},${cleanLng}&hl=en&z=16&output=embed`;

    iframe.onload = () => {
      if (loader) {
        loader.classList.add("opacity-0");
        setTimeout(() => loader.classList.add("hidden"), 300);
      }
    };

    let navUrl = `https://www.google.com/maps/dir/?api=1&destination=${cleanLat},${cleanLng}&travelmode=walking`;
    if (state.userLocation && state.userLocation.lat && state.userLocation.lng) {
      navUrl += `&origin=${state.userLocation.lat},${state.userLocation.lng}`;
    }

    if (launchBtn) {
      launchBtn.onclick = () => {
        window.open(navUrl, "_blank");
        showToast("GOOGLE MAPS", `Launching turn-by-turn navigation to ${cleanLandmark}...`);
      };
    }

    if (copyBtn) {
      copyBtn.onclick = () => {
        const text = `${cleanLat}, ${cleanLng}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            showToast("COORDINATES COPIED", text);
          }).catch(() => {
            showToast("COORDINATES", text);
          });
        } else {
          showToast("COORDINATES", text);
        }
      };
    }

    if (!googleMapsModalInitialized) {
      googleMapsModalInitialized = true;
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          modal.classList.add("hidden");
          iframe.src = "about:blank";
        });
      }
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.add("hidden");
          iframe.src = "about:blank";
        }
      });
    }

    modal.classList.remove("hidden");
    lucide.createIcons();
  }

  /**
   * Universal Google Maps Walking Directions launcher
   * Opens official Google Maps modal viewer and turn-by-turn navigation
   */
  function openGoogleMapsDirections(destLat, destLng, landmarkName) {
    openGoogleMapsModal(destLat, destLng, landmarkName);
  }

  /**
   * Switch Google Map Tile Layer (Streets vs Satellite)
   */
  function setCampusMapLayer(type) {
    if (!campusMap || typeof L === "undefined") return;
    if (campusCurrentTileLayer) {
      campusMap.removeLayer(campusCurrentTileLayer);
    }
    campusActiveLayerType = type;
    const cfg = GOOGLE_TILE_CONFIG[type] || GOOGLE_TILE_CONFIG.streets;
    campusCurrentTileLayer = L.tileLayer(cfg.url, cfg.options).addTo(campusMap);

    const streetsBtn = document.getElementById("btn-map-layer-streets");
    const satBtn = document.getElementById("btn-map-layer-satellite");
    if (streetsBtn && satBtn) {
      if (type === "streets") {
        streetsBtn.className = "px-2 py-1 rounded bg-cyan-500 text-slate-950 font-bold transition flex items-center gap-1 cursor-pointer";
        satBtn.className = "px-2 py-1 rounded text-slate-400 hover:text-slate-200 transition flex items-center gap-1 cursor-pointer";
      } else {
        satBtn.className = "px-2 py-1 rounded bg-cyan-500 text-slate-950 font-bold transition flex items-center gap-1 cursor-pointer";
        streetsBtn.className = "px-2 py-1 rounded text-slate-400 hover:text-slate-200 transition flex items-center gap-1 cursor-pointer";
      }
    }
  }

  /**
   * Initialize Leaflet Interactive Campus Google Map
   */
  function initCampusMap() {
    if (typeof L === "undefined") return;
    if (campusMap) {
      setTimeout(() => campusMap.invalidateSize(), 100);
      return;
    }

    const mapElem = document.getElementById("campus-leaflet-map");
    if (!mapElem) return;

    const lat = state.userLocation.lat || state.selectedPickupCoords?.lat || 20.5937;
    const lng = state.userLocation.lng || state.selectedPickupCoords?.lng || 78.9629;
    const initialZoom = (state.userLocation.lat && state.userLocation.lng) ? 16 : 5;

    campusMap = L.map("campus-leaflet-map", {
      zoomControl: true,
      attributionControl: false
    }).setView([lat, lng], initialZoom);

    // Initial Google Map Tile Layer (Streets)
    setCampusMapLayer(campusActiveLayerType || "streets");

    // Add User pulsing beacon marker
    const userIcon = L.divIcon({
      className: "user-map-beacon",
      html: `<div class="user-map-beacon-ring"></div><div class="user-map-beacon-dot"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    campusUserMarker = L.marker([lat, lng], { icon: userIcon }).addTo(campusMap);
    campusUserMarker.bindPopup(`<strong class="text-cyan-400 font-mono text-xs">📍 YOU ARE HERE</strong><br><span class="text-[11px] text-slate-400 font-mono">Pulsing Radar Ground Zero</span>`);

    // Google Layer switcher buttons
    const streetsBtn = document.getElementById("btn-map-layer-streets");
    const satBtn = document.getElementById("btn-map-layer-satellite");
    if (streetsBtn) {
      streetsBtn.addEventListener("click", () => setCampusMapLayer("streets"));
    }
    if (satBtn) {
      satBtn.addEventListener("click", () => setCampusMapLayer("satellite"));
    }

    // Center me button
    const centerBtn = document.getElementById("btn-map-center-me");
    if (centerBtn) {
      centerBtn.addEventListener("click", () => {
        if (state.userLocation && campusMap) {
          campusMap.flyTo([state.userLocation.lat, state.userLocation.lng], 16, { animate: true, duration: 0.8 });
        }
      });
    }

    // Fit all button
    const fitBtn = document.getElementById("btn-map-fit-all");
    if (fitBtn) {
      fitBtn.addEventListener("click", () => {
        fitCampusMapBounds();
      });
    }

    setTimeout(() => campusMap.invalidateSize(), 150);
  }

  function fitCampusMapBounds() {
    if (!campusMap) return;
    const points = [[state.userLocation.lat, state.userLocation.lng]];
    for (const t of state.evaluatedItems) {
      if (t.item && t.item.lat && t.item.lng) {
        points.push([t.item.lat, t.item.lng]);
      }
    }
    if (points.length > 1) {
      campusMap.fitBounds(points, { padding: [30, 30], maxZoom: 17 });
    }
  }

  function renderCampusMapPins() {
    if (!campusMap || typeof L === "undefined") return;

    if (campusUserMarker && state.userLocation) {
      campusUserMarker.setLatLng([state.userLocation.lat, state.userLocation.lng]);
    }

    for (const m of campusMapMarkers) {
      campusMap.removeLayer(m);
    }
    campusMapMarkers = [];

    const badgeElem = document.getElementById("map-pin-count-badge");
    if (badgeElem) {
      badgeElem.textContent = `${state.filteredItems.length} SELLERS`;
    }

    state.filteredItems.forEach((target) => {
      const item = target.item;
      if (!item.lat || !item.lng) return;

      const isWanted = item.beacon_type === "wanted";
      const isBook = item.category === "books";
      const pinClass = isWanted ? "pin-wanted" : isBook ? "pin-books" : "pin-stationery";
      const pinEmoji = isWanted ? "🚨" : isBook ? "📖" : "✏️";

      const pinIcon = L.divIcon({
        className: "item-map-pin",
        html: `
          <div class="item-map-pin-inner ${pinClass}" title="${item.title}">
            <span>${pinEmoji}</span>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const marker = L.marker([item.lat, item.lng], { icon: pinIcon }).addTo(campusMap);

      const popupHtml = `
        <div class="font-mono text-xs">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-[10px] font-bold uppercase text-cyan-400">${item.category}</span>
            <span class="text-emerald-400 font-bold">₹${item.price}</span>
          </div>
          <h4 class="font-bold text-white text-xs mb-1 line-clamp-1">${item.title}</h4>
          <div class="text-slate-400 text-[10px] mb-2">📍 ${item.landmark || "Campus"} • ${target.distanceFormatted}</div>
          <div class="flex items-center gap-1.5">
            <button class="map-popup-select-btn px-2 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[10px] uppercase transition cursor-pointer" data-id="${item.id}">
              Lock Target
            </button>
            <button class="map-popup-nav-btn px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-cyan-400/40 text-cyan-300 text-[10px] flex items-center gap-1 transition cursor-pointer" data-lat="${item.lat}" data-lng="${item.lng}" data-landmark="${item.landmark}">
              🗺️ Directions
            </button>
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml);

      marker.on("click", () => {
        selectTarget(target);
        drawWalkingRouteToTarget(target);
      });

      marker.on("popupopen", (e) => {
        const popupNode = e.popup.getElement();
        if (!popupNode) return;
        const selectBtn = popupNode.querySelector(".map-popup-select-btn");
        const navBtn = popupNode.querySelector(".map-popup-nav-btn");
        if (selectBtn) {
          selectBtn.onclick = () => selectTarget(target);
        }
        if (navBtn) {
          navBtn.onclick = () => openGoogleMapsDirections(item.lat, item.lng, item.landmark);
        }
      });

      campusMapMarkers.push(marker);
    });

    if (state.selectedTarget) {
      drawWalkingRouteToTarget(state.selectedTarget);
    }
  }

  function drawWalkingRouteToTarget(target) {
    if (!campusMap || !target || !target.item) return;
    const item = target.item;
    if (!item.lat || !item.lng) return;

    if (campusPathLine) {
      campusMap.removeLayer(campusPathLine);
      campusPathLine = null;
    }

    const latlngs = [
      [state.userLocation.lat, state.userLocation.lng],
      [item.lat, item.lng]
    ];

    campusPathLine = L.polyline(latlngs, {
      color: "#00e5ff",
      weight: 3,
      dashArray: "6, 8",
      opacity: 0.85
    }).addTo(campusMap);

    campusPathLine.bindTooltip(`📍 Buyer ➔ Seller: ${target.distanceFormatted} (${target.walkingTime})`, {
      permanent: true,
      direction: "center",
      className: "bg-slate-950 text-cyan-300 font-mono text-[10px] border border-cyan-500/50 rounded px-1.5 py-0.5"
    });
  }

  /**
   * Automatic Real-Time Live GPS Location Tracking
   * Continuously tracks buyer position across campus and recalculates geodesic distance to sellers
   */
  let lastGpsRenderLat = null;
  let lastGpsRenderLng = null;
  let lastGpsRenderTime = 0;

  function initLiveLocationTracking() {
    if (!("geolocation" in navigator)) {
      console.warn("Geolocation API not supported by this browser.");
      return;
    }

    const handleGpsSuccess = (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = Math.round(pos.coords.accuracy || 8);

      // Check if browser returned an ISP Gateway estimate (accuracy > 1500m or known Goa gateway range with coarse accuracy)
      const isGoaRange = (lat >= 14.8 && lat <= 16.0 && lng >= 73.4 && lng <= 74.6);
      const isCoarseNetwork = accuracy > 1500 || (isGoaRange && accuracy > 100);

      // If user previously set a manual campus pin, preserve it against coarse network overrides
      if (state.userLocation && state.userLocation.isManual && isCoarseNetwork) {
        console.log("[GPS] Preserving custom campus pin against coarse ISP geolocation.");
        return;
      }

      if (isCoarseNetwork) {
        console.warn(`[GPS] Detected coarse ISP network location (${lat.toFixed(4)}, ${lng.toFixed(4)} ±${accuracy}m). Not using Goa.`);
        const hudLoc = document.getElementById("hud-location-text");
        if (hudLoc && !state.userLocation.isManual) {
          if (state.activeCampus) {
            hudLoc.innerHTML = `🏫 <span class="text-cyan-300 font-bold">${state.activeCampus.shortName || state.activeCampus.name}</span>`;
            hudLoc.onclick = () => openCampusSearchModal();
          } else {
            hudLoc.innerHTML = `🏫 <span class="text-cyan-300 font-bold animate-pulse">SEARCH YOUR COLLAGE HERE....</span>`;
            hudLoc.onclick = () => openCampusSearchModal();
          }
        }
        return;
      }

      state.userLocation = {
        lat,
        lng,
        accuracy,
        name: `📍 Live GPS (±${accuracy}m)`,
        isLiveGPS: true,
        isManual: false
      };

      // Cache verified real physical coordinates
      try {
        localStorage.setItem("radarmarket_last_known_gps", JSON.stringify({
          lat,
          lng,
          accuracy,
          timestamp: Date.now(),
          isManual: false
        }));
      } catch (e) {}

      // Keep seller coordinates automatically synced to live GPS unless they explicitly picked a custom pin
      if (!state.selectedPickupCoords || !state.selectedPickupCoords.isCustom) {
        state.selectedPickupCoords = {
          lat,
          lng,
          accuracy,
          landmark: state.selectedPickupCoords?.landmark || "Current Live Location",
          isCustom: false,
          isLiveGPS: true
        };
        const coordsDisplay = document.getElementById("sell-coords-display");
        if (coordsDisplay) {
          coordsDisplay.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
        const gpsAccuracyBadge = document.getElementById("sell-gps-accuracy-badge");
        if (gpsAccuracyBadge) {
          gpsAccuracyBadge.textContent = `±${accuracy}m Live GPS`;
          gpsAccuracyBadge.className = "text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40";
          gpsAccuracyBadge.classList.remove("hidden");
        }
      }

      // Update HUD location text with blinking green radar beacon
      const hudLoc = document.getElementById("hud-location-text");
      if (hudLoc) {
        hudLoc.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1"></span>Live GPS (±${accuracy}m)`;
        hudLoc.className = "text-emerald-300 font-mono text-[11px] font-bold cursor-pointer";
        hudLoc.onclick = () => openCampusLocationPicker();
      }

      // Update location dropdown option if visible
      const locSelect = document.getElementById("location-select");
      if (locSelect) {
        const opt = locSelect.querySelector("option[value='gps_real']");
        if (opt) opt.textContent = `📍 Live GPS Fix (±${accuracy}m)`;
        locSelect.value = "gps_real";
      }

      // If user marker exists on Leaflet map, update its coordinates
      if (campusUserMarker && campusMap) {
        campusUserMarker.setLatLng([lat, lng]);
      }

      // GPS Deadband & Jitter Filter: prevent DOM thrashing and scroll jumps during micro-movements
      const now = Date.now();
      let shouldRerender = true;
      if (lastGpsRenderLat !== null && lastGpsRenderLng !== null) {
        const deltaM = calculateDistanceMeters(lastGpsRenderLat, lastGpsRenderLng, lat, lng);
        const elapsedMs = now - lastGpsRenderTime;
        // Suppress full DOM re-sort if movement is < 4 meters and less than 8 seconds have passed
        if (deltaM < 4 && elapsedMs < 8000) {
          shouldRerender = false;
        }
      }

      if (shouldRerender) {
        lastGpsRenderLat = lat;
        lastGpsRenderLng = lng;
        lastGpsRenderTime = now;
        // Recalculate DSP-VI algorithms and distances to all items
        recalculateAndRender();
      }
    };

    const handleGpsError = (err) => {
      console.warn("GPS satellite fix pending or unavailable:", err.message);
      const hudLoc = document.getElementById("hud-location-text");
      if (hudLoc && !state.userLocation.isLiveGPS && !state.userLocation.isManual) {
        if (state.activeCampus) {
          hudLoc.innerHTML = `🏫 <span class="text-cyan-300 font-bold">${state.activeCampus.shortName || state.activeCampus.name}</span>`;
        } else {
          hudLoc.innerHTML = `🏫 <span class="text-cyan-300 font-bold animate-pulse">SEARCH YOUR COLLAGE HERE....</span>`;
        }
        hudLoc.onclick = () => openCampusSearchModal();
      }
    };

    // 1. Immediate high-accuracy GPS fix with fresh satellite request (maximumAge: 0)
    navigator.geolocation.getCurrentPosition(handleGpsSuccess, handleGpsError, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    });

    // 2. Continuous real-time position tracking as the buyer walks
    if (state.liveGpsWatchId) {
      navigator.geolocation.clearWatch(state.liveGpsWatchId);
    }
    try {
      state.liveGpsWatchId = navigator.geolocation.watchPosition(
        handleGpsSuccess,
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } catch (e) {}
  }

  /**
   * High-Tech Live GPS Area Scanner with Adaptive Proximity Anchor
   * Acquires browser GPS, clusters nearby campus listings realistically, and runs 360 sonar sweep.
   */
  let isScanningArea = false;
  function activateLiveAreaScan() {
    if (isScanningArea) return;

    if (!("geolocation" in navigator)) {
      showToast("GPS UNSUPPORTED", "Your browser does not support HTML5 Geolocation.");
      return;
    }

    isScanningArea = true;
    const scanBtn = document.getElementById("btn-scan-live-gps");
    const scanText = document.getElementById("text-scan-gps");
    const scanIcon = document.getElementById("icon-scan-gps");
    const scanBanner = document.getElementById("sonar-scan-banner");
    const bannerText = document.getElementById("sonar-scan-banner-text");
    const bannerAccuracy = document.getElementById("sonar-scan-accuracy");
    const sweepStatus = document.getElementById("sonar-sweep-status");

    if (scanText) scanText.textContent = "ACQUIRING SATELLITES...";
    if (scanIcon) scanIcon.classList.add("animate-spin");
    if (scanBanner) {
      scanBanner.classList.remove("hidden");
      if (bannerText) bannerText.textContent = "ACQUIRING HIGH-PRECISION GPS FIX...";
      if (bannerAccuracy) bannerAccuracy.textContent = "SEARCHING...";
    }
    if (sweepStatus) {
      sweepStatus.textContent = "ACQUIRING GPS FIX";
      sweepStatus.className = "text-amber-400 font-bold uppercase";
    }

    // Trigger fast radar rotation
    if (radarEngine) radarEngine.triggerActiveSonarSweep();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 8);

        state.userLocation = {
          lat,
          lng,
          name: `📍 Live GPS (±${accuracy}m)`
        };

        if (bannerText) bannerText.textContent = "TRIANGULATING CAMPUS SELLERS IN PROXIMITY...";
        if (bannerAccuracy) bannerAccuracy.textContent = `±${accuracy}m ACCURACY`;

        // Set sort order to distance (nearest sellers first)
        state.radarSortBy = "distance";

        // Recalculate all distances and render
        recalculateAndRender();

        // Check if any active items exist
        if (state.filteredItems.length === 0) {
          if (bannerText) {
            bannerText.textContent = "SCAN COMPLETE: NO ACTIVE BEACONS IN SECTOR";
          }
          if (sweepStatus) {
            sweepStatus.textContent = "SCAN COMPLETE";
            sweepStatus.className = "text-emerald-400 font-bold uppercase";
          }
          showToast(
            "AREA SCAN COMPLETE",
            "Radar calibrated to your live GPS! No items posted in this sector yet. Click '+ Sell' to broadcast the first beacon!"
          );
        } else {
          // Automatically spotlight the nearest real seller
          const nearestTarget = state.filteredItems[0];
          if (nearestTarget) {
            selectTarget(nearestTarget);
          }

          if (bannerText) {
            bannerText.textContent = `RADAR LOCK: ${state.filteredItems.length} ACTIVE SELLERS IN RANGE`;
          }
          if (sweepStatus) {
            sweepStatus.textContent = "SONAR LOCKED";
            sweepStatus.className = "text-emerald-400 font-bold uppercase";
          }

          const closestDist = nearestTarget ? nearestTarget.distanceFormatted : "nearby";
          const closestWalk = nearestTarget ? nearestTarget.walkingTime : "walking distance";
          showToast(
            "AREA SCAN COMPLETE",
            `Found ${state.filteredItems.length} active sellers around your position! Nearest: ${closestDist} (${closestWalk}).`
          );
        }

        // Reset UI after 3 seconds
        setTimeout(() => {
          isScanningArea = false;
          if (scanText) scanText.textContent = "🛰️ SCAN SURROUNDINGS";
          if (scanIcon) scanIcon.classList.remove("animate-spin");
          if (scanBanner) scanBanner.classList.add("hidden");
          if (sweepStatus) {
            sweepStatus.textContent = "SONAR SWEEP ACTIVE";
            sweepStatus.className = "text-emerald-400 font-bold uppercase";
          }
        }, 3200);
      },
      (err) => {
        console.warn("GPS Scan error:", err);
        isScanningArea = false;
        if (scanText) scanText.textContent = "🛰️ SCAN SURROUNDINGS";
        if (scanIcon) scanIcon.classList.remove("animate-spin");
        if (scanBanner) scanBanner.classList.add("hidden");
        if (sweepStatus) {
          sweepStatus.textContent = "SONAR SWEEP ACTIVE";
          sweepStatus.className = "text-emerald-400 font-bold uppercase";
        }

        showToast(
          "GPS POSITIONING NOTICE",
          err.message || "Could not retrieve GPS fix. Staying on Campus Quad preset."
        );
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
    );
  }

  /**
   * Client-side canvas image compressor (<70KB for fast multi-device sync)
   * Handles both file uploads and live camera canvas snapshots.
   */
  function compressImageFile(input, callback, onError) {
    if (!input) {
      if (onError) onError(new Error("No image data provided."));
      return;
    }

    // Helper to process loaded image data URL
    function processDataUrl(dataUrl, originalSizeBytes) {
      const img = new Image();
      img.onerror = (err) => {
        if (onError) onError(err);
      };
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 800;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", 0.75);

        // Approximate byte size from base64 string
        const base64Content = compressed.split(",")[1] || "";
        const compressedSizeBytes = Math.round((base64Content.length * 3) / 4);

        const stats = {
          originalKb: Math.round(originalSizeBytes / 1024),
          compressedKb: Math.max(1, Math.round(compressedSizeBytes / 1024)),
          reductionPct: originalSizeBytes > 0 ? Math.max(0, Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100)) : 0,
          width,
          height
        };

        callback(compressed, stats);
      };
      img.src = dataUrl;
    }

    if (typeof input === "string" && input.startsWith("data:image/")) {
      const rawContent = input.split(",")[1] || "";
      const rawBytes = Math.round((rawContent.length * 3) / 4);
      processDataUrl(input, rawBytes);
    } else if (input instanceof Blob || input instanceof File) {
      const originalSizeBytes = input.size;
      const reader = new FileReader();
      reader.onerror = (err) => {
        if (onError) onError(err);
      };
      reader.onload = (e) => {
        processDataUrl(e.target.result, originalSizeBytes);
      };
      reader.readAsDataURL(input);
    } else {
      if (onError) onError(new Error("Unsupported image format."));
    }
  }

  /**
   * Sound synthesizer for tactical barcode scanning lock
   */
  function playScannerSound(isSuccess = true) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (isSuccess) {
        // Futuristic two-tone scanner lock: 880Hz -> 1760Hz
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1760, now + 0.07);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else {
        // Low error buzz
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      // AudioContext not allowed or muted
    }
  }

  /**
   * Setup Real-Time ISBN Barcode Scanner & Textbook Metadata Auto-Filler
   */
  function setupIsbnScanner() {
    let html5QrScanner = null;
    let isScannerRunning = false;
    let isResolving = false;
    let isTorchOn = false;

    const triggerScanBtn = document.getElementById("btn-trigger-barcode-scan");
    const triggerScanText = document.getElementById("btn-trigger-barcode-text");
    const triggerPhotoBtn = document.getElementById("btn-trigger-barcode-photo");
    const snapFromManualBtn = document.getElementById("btn-snap-photo-from-manual");
    const snapFromCamBtn = document.getElementById("btn-snap-photo-from-cam");
    const barcodeFileInput = document.getElementById("barcode-file-input");
    const barcodeGalleryInput = document.getElementById("barcode-gallery-input");
    const triggerGalleryBtn = document.getElementById("btn-trigger-barcode-gallery");

    const toggleManualBtn = document.getElementById("btn-toggle-manual-isbn");
    const closeScannerBtn = document.getElementById("btn-close-scanner");
    const closeManualBtn = document.getElementById("btn-close-manual-isbn");
    const switchToManualFromCamBtn = document.getElementById("btn-switch-to-manual-from-cam");
    const toggleTorchBtn = document.getElementById("btn-toggle-torch");
    const cameraSelect = document.getElementById("scanner-camera-select");

    const viewportPanel = document.getElementById("scanner-viewport-panel");
    const manualPanel = document.getElementById("manual-isbn-panel");
    const statusText = document.getElementById("scanner-status-text");
    const viewportBox = document.getElementById("scanner-viewport-box");

    const manualInput = document.getElementById("manual-isbn-input");
    const manualFetchBtn = document.getElementById("btn-manual-isbn-fetch");
    const manualFetchText = document.getElementById("btn-manual-isbn-text");
    const quickChips = document.querySelectorAll(".btn-quick-isbn");

    const scannedCard = document.getElementById("scanned-book-card");
    const scannedCover = document.getElementById("scanned-book-cover");
    const scannedTitle = document.getElementById("scanned-book-title");
    const scannedAuthor = document.getElementById("scanned-book-author");
    const scannedMeta = document.getElementById("scanned-book-meta");
    const rescanBtn = document.getElementById("btn-rescan-book");

    const form = document.getElementById("sell-item-form");

    // Check if browser allows live video stream (Requires HTTPS or localhost)
    function hasLiveCameraSupport() {
      return !!(
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function" &&
        (window.isSecureContext ||
          window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1")
      );
    }

    // Adapt button text on mobile HTTP origins
    if (!hasLiveCameraSupport() && triggerScanText) {
      triggerScanText.textContent = "SNAP BARCODE";
    }

    // Start Barcode Scanner (Live Video Stream)
    async function startScanner(deviceId = null) {
      if (typeof Html5Qrcode === "undefined") {
        showToast("SCANNER INITIALIZING", "Optical scanner library loading. Please enter ISBN manually.");
        openManualPanel();
        return;
      }

      // If on mobile HTTP without HTTPS, live video is blocked by browser security policy.
      // Redirect seamlessly to native camera photo snap!
      if (!hasLiveCameraSupport()) {
        showToast("OPENING PHONE CAMERA", "Mobile browsers require HTTPS for live video. Opening camera to snap barcode...");
        if (barcodeFileInput) {
          barcodeFileInput.click();
        } else {
          openManualPanel();
        }
        return;
      }

      if (isScannerRunning) {
        await stopScanner();
      }

      viewportPanel.classList.remove("hidden");
      manualPanel.classList.add("hidden");
      if (statusText) statusText.textContent = "ALIGN EAN-13 BARCODE HERE";
      if (statusText) statusText.className = "text-[10px] text-cyan-300 font-mono tracking-wider bg-slate-950/85 px-2 py-0.5 rounded border border-cyan-500/40 text-center shadow";

      try {
        html5QrScanner = new Html5Qrcode("scanner-qr-reader", { verbose: false });

        // Enumerate cameras
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            cameraSelect.innerHTML = "";
            let backCamId = null;
            cameras.forEach((cam) => {
              const opt = document.createElement("option");
              opt.value = cam.id;
              const isBack = cam.label.toLowerCase().includes("back") || cam.label.toLowerCase().includes("environment") || cam.label.toLowerCase().includes("rear");
              opt.textContent = cam.label || `Camera ${cam.id.substring(0, 4)}`;
              if (isBack && !backCamId) backCamId = cam.id;
              cameraSelect.appendChild(opt);
            });
            if (deviceId) {
              cameraSelect.value = deviceId;
            } else if (backCamId) {
              cameraSelect.value = backCamId;
            }
          }
        } catch (e) {
          // Camera list fallback
        }

        const selectedCamera = deviceId || (cameraSelect.value ? cameraSelect.value : { facingMode: "environment" });

        const config = {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            return {
              width: Math.min(viewfinderWidth - 20, 280),
              height: Math.min(viewfinderHeight - 20, 160)
            };
          },
          aspectRatio: 1.333,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39
          ]
        };

        await html5QrScanner.start(
          selectedCamera,
          config,
          onScanSuccess,
          () => {} // frame tick
        );

        isScannerRunning = true;

        // Check torch capability
        try {
          const capabilities = html5QrScanner.getRunningTrackCapabilities();
          if (capabilities && capabilities.torch) {
            toggleTorchBtn.classList.remove("hidden");
          } else {
            toggleTorchBtn.classList.add("hidden");
          }
        } catch (e) {
          toggleTorchBtn.classList.add("hidden");
        }

      } catch (err) {
        console.error("Failed to start barcode scanner:", err);
        await stopScanner();
        if (!hasLiveCameraSupport()) {
          showToast("CAMERA SWITCHED TO SNAP", "Mobile browsers require HTTPS for live video. Opening camera to snap barcode...");
          if (barcodeFileInput) barcodeFileInput.click();
        } else {
          showToast("CAMERA ACCESS NOTICE", "Could not start camera. Try snapping a photo or typing ISBN.");
          openManualPanel();
        }
      }
    }

    // Stop Barcode Scanner cleanly
    async function stopScanner() {
      if (html5QrScanner && isScannerRunning) {
        try {
          if (isTorchOn) {
            await html5QrScanner.applyVideoConstraints({ advanced: [{ torch: false }] }).catch(() => {});
            isTorchOn = false;
          }
          await html5QrScanner.stop();
        } catch (e) {}
        try {
          html5QrScanner.clear();
        } catch (e) {}
      }
      isScannerRunning = false;
      html5QrScanner = null;
      viewportPanel.classList.add("hidden");
    }

    function openManualPanel() {
      manualPanel.classList.remove("hidden");
      viewportPanel.classList.add("hidden");
      if (manualInput) manualInput.focus();
    }

    function closeManualPanel() {
      manualPanel.classList.add("hidden");
    }

    // Barcode detected by camera
    async function onScanSuccess(decodedText) {
      if (isResolving) return;

      playScannerSound(true);

      if (viewportBox) {
        viewportBox.classList.add("scanner-lock-flash");
        setTimeout(() => viewportBox.classList.remove("scanner-lock-flash"), 700);
      }

      if (statusText) {
        statusText.textContent = `LOCKED: ${decodedText}`;
        statusText.className = "text-[10px] text-emerald-400 font-mono tracking-wider bg-slate-950/90 px-2.5 py-0.5 rounded border border-emerald-400 text-center font-bold shadow-[0_0_15px_rgba(0,255,157,0.5)]";
      }

      // Freeze frame and stop camera hardware
      await stopScanner();

      // Look up metadata
      await resolveAndPopulate(decodedText);
    }

    /**
     * Multi-Engine, Multi-Orientation Optical Barcode Decoder for Smartphone Photos.
     * Overcomes smartphone portrait/landscape camera orientations, huge mega-pixel files,
     * shadows, glossy glare, and downsampling limits.
     * Uses Quagga2 + Html5Qrcode + native BarcodeDetector across 0°, 90°, 270° angles.
     */
    async function decodeBarcodeFromImageFile(file) {
      // 0. Load image from File
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Unable to read image file"));
        };
        image.src = url;
      });

      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;
      if (!origW || !origH) throw new Error("Could not decode image dimensions.");

      // Ensure dedicated high-resolution offscreen reader element exists for Html5Qrcode
      let offscreenEl = document.getElementById("scanner-offscreen-reader");
      if (!offscreenEl) {
        offscreenEl = document.createElement("div");
        offscreenEl.id = "scanner-offscreen-reader";
        offscreenEl.style.cssText = "position: fixed; top: -9999px; left: -9999px; width: 1400px; height: 1400px; opacity: 0.001; pointer-events: none; z-index: -9999;";
        document.body.appendChild(offscreenEl);
      }

      // Initialize offscreen Html5Qrcode instance
      let offscreenHtml5 = null;
      if (typeof Html5Qrcode !== "undefined") {
        try {
          offscreenHtml5 = new Html5Qrcode("scanner-offscreen-reader", { verbose: false });
        } catch (e) {
          console.warn("Offscreen Html5Qrcode init:", e);
        }
      }

      // Prepare scaled dimensions (max 1400px for optimal barcode striping)
      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(origW, origH));
      const targetW = Math.round(origW * scale);
      const targetH = Math.round(origH * scale);

      // Helper to generate rotated & filtered canvases
      function createRenderedCanvas(sourceImg, sx, sy, sw, sh, angle, applyContrast = false) {
        const cvs = document.createElement("canvas");
        const ctx = cvs.getContext("2d");
        const isRotated = angle === 90 || angle === 270;
        cvs.width = isRotated ? sh : sw;
        cvs.height = isRotated ? sw : sh;

        if (applyContrast) {
          ctx.filter = "contrast(1.3) brightness(1.05)";
        }

        ctx.save();
        if (angle === 90) {
          ctx.translate(sh, 0);
          ctx.rotate(Math.PI / 2);
        } else if (angle === 180) {
          ctx.translate(sw, sh);
          ctx.rotate(Math.PI);
        } else if (angle === 270) {
          ctx.translate(0, sw);
          ctx.rotate(-Math.PI / 2);
        }
        ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, sw, sh);
        ctx.restore();
        return cvs;
      }

      const candidateCanvases = [];

      // 1. Full Image candidates: 0°, 90°, 270°
      for (const angle of [0, 90, 270]) {
        candidateCanvases.push({
          desc: `Full_${angle}deg`,
          canvas: createRenderedCanvas(img, 0, 0, targetW, targetH, angle)
        });
      }

      // 2. Center 65% Crop candidates (optimal for smartphone photos centered near barcode)
      const cropW = Math.round(targetW * 0.65);
      const cropH = Math.round(targetH * 0.65);
      const cropX = Math.round((targetW - cropW) / 2);
      const cropY = Math.round((targetH - cropH) / 2);

      for (const angle of [0, 90, 270]) {
        candidateCanvases.push({
          desc: `CenterCrop_${angle}deg`,
          canvas: createRenderedCanvas(img, cropX, cropY, cropW, cropH, angle)
        });
      }

      // 3. Contrast-enhanced candidates
      candidateCanvases.push({
        desc: "Full_0deg_Contrast",
        canvas: createRenderedCanvas(img, 0, 0, targetW, targetH, 0, true)
      });
      candidateCanvases.push({
        desc: "Crop_90deg_Contrast",
        canvas: createRenderedCanvas(img, cropX, cropY, cropW, cropH, 90, true)
      });

      const readers = ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader", "code_128_reader", "code_39_reader"];

      // Helper to turn canvas into File for Html5Qrcode
      function canvasToFile(cvs) {
        return new Promise((resolve) => {
          cvs.toBlob((blob) => {
            resolve(new File([blob], "scan_pass.jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.92);
        });
      }

      // Helper to run Quagga decodeSingle with a promise and timeout
      function runQuagga(dataUrl, canvasSize, locate = false) {
        return new Promise((resolve) => {
          if (typeof Quagga === "undefined" || !Quagga.decodeSingle) return resolve(null);
          let resolved = false;
          const timer = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }, 2500);

          try {
            Quagga.decodeSingle({
              src: dataUrl,
              numOfWorkers: 0,
              inputStream: {
                size: canvasSize,
                type: "ImageStream",
                sequence: false
              },
              locator: {
                patchSize: "medium",
                halfSample: false
              },
              decoder: { readers: readers },
              locate: locate
            }, (result) => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                if (result && result.codeResult && result.codeResult.code) {
                  resolve(result.codeResult.code);
                } else {
                  resolve(null);
                }
              }
            });
          } catch (e) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(null);
            }
          }
        });
      }

      // Execute multi-engine optical pass
      for (const item of candidateCanvases) {
        const cvs = item.canvas;
        const maxSide = Math.max(cvs.width, cvs.height);
        const dataUrl = cvs.toDataURL("image/jpeg", 0.92);

        // Pass A: Quagga direct orientation decode
        const qCode = await runQuagga(dataUrl, maxSide, false);
        if (qCode) {
          console.log(`[Barcode Scanner] Detected via Quagga (${item.desc}):`, qCode);
          return qCode;
        }

        // Pass B: Html5Qrcode / ZXing on unhidden 1400px container
        if (offscreenHtml5) {
          try {
            const scanFile = await canvasToFile(cvs);
            const hCode = await offscreenHtml5.scanFile(scanFile, false);
            if (hCode) {
              console.log(`[Barcode Scanner] Detected via Html5Qrcode (${item.desc}):`, hCode);
              return hCode;
            }
          } catch (e) {}
        }

        // Pass C: Native browser BarcodeDetector if available
        if ("BarcodeDetector" in window) {
          try {
            const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
            const barcodes = await detector.detect(cvs);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              console.log(`[Barcode Scanner] Detected via BarcodeDetector (${item.desc}):`, barcodes[0].rawValue);
              return barcodes[0].rawValue;
            }
          } catch (e) {}
        }

        // Pass D: Quagga with locator
        const qLocCode = await runQuagga(dataUrl, maxSide, true);
        if (qLocCode) {
          console.log(`[Barcode Scanner] Detected via Quagga-Loc (${item.desc}):`, qLocCode);
          return qLocCode;
        }
      }

      throw new Error("Could not detect barcode lines. Aim closer and ensure the barcode is flat and in-focus, or type the ISBN digits.");
    }

    // Resolve book metadata and populate listing form
    async function resolveAndPopulate(isbnRaw) {
      if (isResolving) return;
      isResolving = true;

      const cleanIsbn = isbnRaw.replace(/[^0-9X]/gi, "").toUpperCase();
      if (manualFetchBtn) {
        manualFetchBtn.disabled = true;
        manualFetchText.textContent = "LOOKING UP...";
      }

      showToast("SCANNING BOOK CATALOG", `Resolving metadata for ISBN ${cleanIsbn}...`);

      try {
        let book = null;
        if (window.MarketAPI && window.MarketAPI.lookupIsbn) {
          book = await MarketAPI.lookupIsbn(cleanIsbn).catch(() => null);
        }

        // Direct fallback if API helper didn't return
        if (!book || !book.title) {
          try {
            const directRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`);
            if (directRes.ok) {
              const data = await directRes.json();
              const key = `ISBN:${cleanIsbn}`;
              if (data && data[key]) {
                const b = data[key];
                book = {
                  isbn: cleanIsbn,
                  title: b.title || "",
                  authors: (b.authors || []).map(a => a.name).join(", "),
                  publishers: (b.publishers || []).map(p => p.name).join(", "),
                  publish_date: b.publish_date || "",
                  cover_url: (b.cover || {}).large || `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`,
                  suggested_subcategory: "Textbook",
                  source: "OpenLibrary"
                };
              }
            }
          } catch (e) {}
        }

        // If the barcode was acquired, but this specific edition is not in OpenLibrary:
        // Do NOT reject! Celebrate the barcode lock, pre-fill description & ISBN, and let student type the title!
        if (!book || !book.title) {
          playScannerSound(true);

          const bookRadio = form.querySelector("input[name='sell-category'][value='books']");
          if (bookRadio) {
            bookRadio.checked = true;
            bookRadio.dispatchEvent(new Event("change"));
          }

          if (manualInput) manualInput.value = cleanIsbn;
          const descField = document.getElementById("sell-desc");
          if (descField && !descField.value) {
            descField.value = `[ISBN: ${cleanIsbn}] Genuine textbook copy with complete pages.`;
          }

          closeManualPanel();
          await stopScanner();

          showToast(
            `BARCODE LOCKED: ${cleanIsbn}`,
            "Barcode registered! This edition is not in OpenLibrary yet. Please type the title to finish listing."
          );

          const titleField = document.getElementById("sell-title");
          if (titleField) {
            titleField.focus();
            titleField.classList.add("border-emerald-400");
            setTimeout(() => titleField.classList.remove("border-emerald-400"), 1500);
          }

          if (window.lucide) lucide.createIcons();
          return;
        }

        // Auto-select "Second-Hand Book" radio
        const bookRadio = form.querySelector("input[name='sell-category'][value='books']");
        if (bookRadio) {
          bookRadio.checked = true;
          bookRadio.dispatchEvent(new Event("change"));
        }

        // Auto-fill Title
        const titleField = document.getElementById("sell-title");
        if (titleField) {
          const fullTitle = book.authors ? `${book.title} - ${book.authors}` : book.title;
          titleField.value = fullTitle;
          titleField.classList.add("border-emerald-400");
          setTimeout(() => titleField.classList.remove("border-emerald-400"), 1200);
        }

        // Auto-fill Subcategory
        const subcatField = document.getElementById("sell-subcategory");
        if (subcatField) {
          subcatField.value = book.suggested_subcategory || (book.subjects && book.subjects[0]) || "Textbook";
        }

        // Auto-fill Description
        const descField = document.getElementById("sell-desc");
        if (descField) {
          const notes = [
            `[ISBN: ${book.isbn}]`,
            book.publishers ? `Publisher: ${book.publishers}` : null,
            book.publish_date ? `Year: ${book.publish_date}` : null,
            book.number_of_pages ? `Pages: ${book.number_of_pages}` : null,
            "Complete pages with clean binding, essential for coursework."
          ].filter(Boolean).join(". ");
          descField.value = notes;
        }

        // Auto-fill Image URL & Thumbnail
        if (book.cover_url) {
          const imgField = document.getElementById("sell-image");
          if (imgField) imgField.value = book.cover_url;

          const previewBox = document.getElementById("image-preview-box");
          const previewThumb = document.getElementById("image-preview-thumb");
          if (previewBox && previewThumb) {
            previewThumb.src = book.cover_url;
            previewBox.classList.remove("hidden");
          }
        }

        // Display Scanned Book Preview Card
        if (scannedCard) {
          if (scannedCover) {
            scannedCover.src = book.cover_url || "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80";
          }
          if (scannedTitle) scannedTitle.textContent = book.title;
          if (scannedAuthor) scannedAuthor.textContent = book.authors ? `By ${book.authors}` : "Author unlisted";
          if (scannedMeta) scannedMeta.textContent = `${book.publishers || "Academic Press"} • ${book.publish_date || "Textbook"} • ISBN: ${book.isbn}`;
          scannedCard.classList.remove("hidden");
        }

        // Close manual & camera viewports
        closeManualPanel();
        await stopScanner();

        showToast("BOOK DATA ACQUIRED", `"${book.title}" auto-populated into your beacon!`);
        if (window.lucide) lucide.createIcons();

      } catch (err) {
        console.error("ISBN Resolution error:", err);
        playScannerSound(false);
        showToast("BOOK LOOKUP FAILED", err.message || "Could not resolve book. Please enter details manually.");
        openManualPanel();
      } finally {
        isResolving = false;
        if (manualFetchBtn) {
          manualFetchBtn.disabled = false;
          manualFetchText.textContent = "FETCH DATA";
        }
      }
    }

    // Event listeners
    const handlePhotoSnapTrigger = () => {
      stopScanner();
      if (barcodeFileInput) {
        barcodeFileInput.click();
      }
    };

    if (triggerPhotoBtn) triggerPhotoBtn.addEventListener("click", handlePhotoSnapTrigger);
    if (snapFromManualBtn) snapFromManualBtn.addEventListener("click", handlePhotoSnapTrigger);
    if (snapFromCamBtn) snapFromCamBtn.addEventListener("click", handlePhotoSnapTrigger);

    const handleGalleryUploadTrigger = () => {
      stopScanner();
      if (barcodeGalleryInput) {
        barcodeGalleryInput.click();
      }
    };
    if (triggerGalleryBtn) triggerGalleryBtn.addEventListener("click", handleGalleryUploadTrigger);

    // Common file handler for photo snap (camera) or gallery upload
    async function handleBarcodeFileSelected(file) {
      if (!file) return;

      showToast("ANALYZING BARCODE PHOTO", "Multi-pass optical scanner checking angles and contrast...");
      
      try {
        const decodedText = await decodeBarcodeFromImageFile(file);
        playScannerSound(true);
        await resolveAndPopulate(decodedText);
      } catch (scanErr) {
        console.warn("Barcode photo scan error:", scanErr);
        playScannerSound(false);
        showToast(
          "BARCODE NOT DETECTED",
          scanErr.message || "Could not detect barcode lines. Aim closer and ensure the barcode is flat and in-focus, or type the ISBN digits."
        );
        openManualPanel();
      } finally {
        if (barcodeFileInput) barcodeFileInput.value = "";
        if (barcodeGalleryInput) barcodeGalleryInput.value = "";
      }
    }

    if (barcodeFileInput) {
      barcodeFileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        handleBarcodeFileSelected(file);
      });
    }

    if (barcodeGalleryInput) {
      barcodeGalleryInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        handleBarcodeFileSelected(file);
      });
    }

    if (triggerScanBtn) {
      triggerScanBtn.addEventListener("click", () => {
        if (hasLiveCameraSupport()) {
          if (isScannerRunning) {
            stopScanner();
          } else {
            startScanner();
          }
        } else {
          // Mobile HTTP: direct to native camera snap
          if (barcodeFileInput) {
            barcodeFileInput.click();
          } else {
            openManualPanel();
          }
        }
      });
    }

    if (toggleManualBtn) {
      toggleManualBtn.addEventListener("click", () => {
        if (manualPanel.classList.contains("hidden")) {
          stopScanner();
          openManualPanel();
        } else {
          closeManualPanel();
        }
      });
    }

    if (closeScannerBtn) {
      closeScannerBtn.addEventListener("click", stopScanner);
    }

    if (closeManualBtn) {
      closeManualBtn.addEventListener("click", closeManualPanel);
    }

    if (switchToManualFromCamBtn) {
      switchToManualFromCamBtn.addEventListener("click", () => {
        stopScanner();
        openManualPanel();
      });
    }

    if (cameraSelect) {
      cameraSelect.addEventListener("change", (e) => {
        if (e.target.value) {
          startScanner(e.target.value);
        }
      });
    }

    if (toggleTorchBtn) {
      toggleTorchBtn.addEventListener("click", async () => {
        if (!html5QrScanner || !isScannerRunning) return;
        try {
          isTorchOn = !isTorchOn;
          await html5QrScanner.applyVideoConstraints({
            advanced: [{ torch: isTorchOn }]
          });
          toggleTorchBtn.classList.toggle("bg-amber-500/30", isTorchOn);
          toggleTorchBtn.classList.toggle("border-amber-400", isTorchOn);
        } catch (e) {
          console.warn("Flash toggle failed:", e);
        }
      });
    }

    if (manualFetchBtn && manualInput) {
      const handleManualFetch = () => {
        const val = manualInput.value.trim();
        if (!val) {
          showToast("INPUT REQUIRED", "Please enter an ISBN (e.g. 9780262033848)");
          manualInput.focus();
          return;
        }
        resolveAndPopulate(val);
      };

      manualFetchBtn.addEventListener("click", handleManualFetch);
      manualInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleManualFetch();
        }
      });
    }

    // Quick demo chips
    quickChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const isbn = chip.getAttribute("data-isbn");
        if (isbn && manualInput) {
          manualInput.value = isbn;
          resolveAndPopulate(isbn);
        }
      });
    });

    if (rescanBtn) {
      rescanBtn.addEventListener("click", () => {
        if (scannedCard) scannedCard.classList.add("hidden");
        startScanner();
      });
    }

    return {
      startScanner,
      stopScanner,
      reset: () => {
        stopScanner();
        closeManualPanel();
        if (scannedCard) scannedCard.classList.add("hidden");
      }
    };
  }

  /**
   * Sound synthesizer for optical camera shutter snap
   */
  function playCameraShutterSound() {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {}
  }

  /**
   * Real-Time In-App Live Camera Viewfinder with Hardware Shutter
   */
  let liveCameraStream = null;
  let currentCameraFacing = "environment"; // "environment" (rear) or "user" (front)
  let onCameraCaptureCallback = null;

  function setupLiveCameraModal() {
    const modal = document.getElementById("modal-live-camera");
    const video = document.getElementById("live-camera-video");
    const loading = document.getElementById("live-camera-loading");
    const shutterBtn = document.getElementById("btn-camera-shutter");
    const closeBtn = document.getElementById("btn-close-live-camera");
    const flipBtn = document.getElementById("btn-flip-camera");
    const galleryFallbackBtn = document.getElementById("btn-camera-open-gallery");
    const galleryInput = document.getElementById("sell-gallery-input");

    async function startLiveCamera() {
      stopLiveCamera();
      if (loading) loading.classList.remove("hidden");
      if (modal) modal.classList.remove("hidden");
      if (window.lucide) lucide.createIcons();

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Live WebRTC video not supported.");
        }

        const constraints = {
          video: {
            facingMode: { ideal: currentCameraFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };

        liveCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (video) {
          video.srcObject = liveCameraStream;
          video.onloadedmetadata = () => {
            video.play();
            if (loading) loading.classList.add("hidden");
          };
        }
      } catch (err) {
        console.warn("Live camera stream error:", err);
        stopLiveCamera();
        if (modal) modal.classList.add("hidden");

        // Fallback gracefully to native camera file picker
        showToast("CAMERA PERMISSION NOTICE", "Opening device camera directly...");
        const cameraFallback = document.getElementById("sell-camera-input");
        if (cameraFallback) cameraFallback.click();
      }
    }

    function stopLiveCamera() {
      if (liveCameraStream) {
        liveCameraStream.getTracks().forEach((track) => track.stop());
        liveCameraStream = null;
      }
      if (video) {
        video.srcObject = null;
      }
    }

    function captureLiveFrame() {
      if (!video || !video.videoWidth) {
        showToast("CAMERA NOTICE", "Camera feed is activating. Please tap shutter again.");
        return;
      }

      playCameraShutterSound();
      if ("vibrate" in navigator) {
        try { navigator.vibrate(50); } catch (e) {}
      }

      // Render live video frame directly onto canvas
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");

      // Flip back if mirrored on front camera
      if (currentCameraFacing === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const capturedBase64 = canvas.toDataURL("image/jpeg", 0.85);

      // Stop camera stream & close modal
      stopLiveCamera();
      if (modal) modal.classList.add("hidden");

      if (onCameraCaptureCallback) {
        onCameraCaptureCallback(capturedBase64);
      }
    }

    if (shutterBtn) {
      shutterBtn.addEventListener("click", captureLiveFrame);
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        stopLiveCamera();
        if (modal) modal.classList.add("hidden");
      });
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          stopLiveCamera();
          modal.classList.add("hidden");
        }
      });
    }

    if (flipBtn) {
      flipBtn.addEventListener("click", () => {
        currentCameraFacing = currentCameraFacing === "environment" ? "user" : "environment";
        startLiveCamera();
      });
    }

    if (galleryFallbackBtn && galleryInput) {
      galleryFallbackBtn.addEventListener("click", () => {
        stopLiveCamera();
        if (modal) modal.classList.add("hidden");
        galleryInput.click();
      });
    }

    return {
      open: (callback) => {
        onCameraCaptureCallback = callback;
        startLiveCamera();
      },
      close: () => {
        stopLiveCamera();
        if (modal) modal.classList.add("hidden");
      }
    };
  }

  /**
   * Setup AR Camera Compass & Live Direction Finder HUD Modal
   */
  let arCompassModalInstance = null;

  function setupARCompassModal() {
    const modal = document.getElementById("modal-ar-compass");
    const video = document.getElementById("ar-camera-video");
    const closeBtn = document.getElementById("btn-close-ar-compass");
    const calibrateBtn = document.getElementById("btn-ar-calibrate");
    const compassTape = document.getElementById("ar-compass-tape");
    const targetPin = document.getElementById("ar-target-tape-pin");
    const reticleContainer = document.getElementById("ar-reticle-container");
    const reticleTitle = document.getElementById("ar-reticle-title");
    const reticleDistance = document.getElementById("ar-reticle-distance");
    const reticleStatus = document.getElementById("ar-reticle-status");
    const arrowLeft = document.getElementById("ar-arrow-left");
    const arrowLeftDeg = document.getElementById("ar-arrow-left-deg");
    const arrowRight = document.getElementById("ar-arrow-right");
    const arrowRightDeg = document.getElementById("ar-arrow-right-deg");
    const hudTitle = document.getElementById("ar-hud-title");
    const hudLandmark = document.getElementById("ar-hud-landmark");
    const hudPrice = document.getElementById("ar-hud-price");
    const hudAzimuth = document.getElementById("ar-hud-azimuth");
    const hudDistance = document.getElementById("ar-hud-distance");
    const hudWalk = document.getElementById("ar-hud-walk");
    const openMapsBtn = document.getElementById("btn-ar-open-maps");
    const openChatBtn = document.getElementById("btn-ar-open-chat");
    const manualContainer = document.getElementById("ar-manual-heading-container");
    const manualSlider = document.getElementById("ar-manual-heading-slider");
    const manualVal = document.getElementById("ar-manual-heading-val");

    if (!modal) return null;

    let activeStream = null;
    let currentTarget = null;
    let currentHeading = 0; // degrees (0 = N, 90 = E, 180 = S, 270 = W)
    let targetBearing = 0;
    let isLocked = false;
    let manualMode = false;
    let orientationBound = false;

    // Generate 360 degree compass ribbon ticks: 0° to 360° + repeat to 720° for continuous scroll
    function initCompassRibbon() {
      if (!compassTape || compassTape.children.length > 0) return;
      const cardinals = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
      let html = "";
      for (let cycle = 0; cycle < 2; cycle++) {
        for (let deg = 0; deg < 360; deg += 15) {
          const isCardinal = cardinals[deg] !== undefined;
          const label = isCardinal ? cardinals[deg] : `${deg}°`;
          html += `<div class="ar-compass-tick ${isCardinal ? 'cardinal' : ''}"><span>${label}</span></div>`;
        }
      }
      compassTape.innerHTML = html;
    }

    initCompassRibbon();

    function updateCompassDisplay() {
      if (!currentTarget) return;

      // 1. Calculate relative angle between device heading and target bearing
      // relativeDiff: negative = target is to the left, positive = target is to the right (-180 to +180)
      let diff = (targetBearing - currentHeading + 540) % 360 - 180;
      const absDiff = Math.abs(diff);

      // 2. Update Horizontal Compass Tape
      if (compassTape) {
        const pxPerDeg = 40 / 15;
        const normalizedHeading = (currentHeading % 360 + 360) % 360;
        const offset = normalizedHeading * pxPerDeg;
        compassTape.style.transform = `translateX(-${offset}px)`;
      }

      // 3. Update Target Pin on Compass Tape
      if (targetPin) {
        targetPin.classList.remove("hidden");
        const pxPerDeg = 40 / 15;
        const pinOffsetPx = diff * pxPerDeg;
        const maxOffset = 190;
        const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, pinOffsetPx));
        targetPin.style.left = `calc(50% + ${clampedOffset}px)`;
      }

      // 4. Camera horizontal Field Of View is roughly 60° (±30° from center)
      const fov = 60;
      const halfFov = fov / 2;

      if (absDiff <= halfFov) {
        // Target is INSIDE camera viewport
        if (arrowLeft) arrowLeft.classList.add("hidden");
        if (arrowRight) arrowRight.classList.add("hidden");

        if (reticleContainer) {
          reticleContainer.classList.remove("hidden");
          reticleContainer.style.opacity = "1";
          const screenPercent = (diff / halfFov) * 42; // max ±42vw offset from center
          reticleContainer.style.transform = `translate(calc(-50% + ${screenPercent}vw), -50%)`;

          // Check if tightly locked (within ±6 degrees)
          if (absDiff <= 6) {
            reticleContainer.classList.add("ar-reticle-locked");
            if (reticleStatus) reticleStatus.textContent = "LOCKED ON TARGET";
            if (!isLocked) {
              isLocked = true;
              playHandshakeChime();
              if ("vibrate" in navigator) {
                try { navigator.vibrate([40, 30, 40]); } catch (e) {}
              }
            }
          } else {
            reticleContainer.classList.remove("ar-reticle-locked");
            if (reticleStatus) reticleStatus.textContent = "ALIGNING...";
            isLocked = false;
          }
        }
      } else {
        // Target is OUTSIDE camera viewport -> show turn direction arrows
        isLocked = false;
        if (reticleContainer) {
          reticleContainer.classList.remove("ar-reticle-locked");
          reticleContainer.style.opacity = "0.2";
          reticleContainer.style.transform = `translate(${diff < 0 ? "-44vw" : "44vw"}, -50%)`;
        }

        if (diff < 0) {
          // Turn Left
          if (arrowLeft) {
            arrowLeft.classList.remove("hidden");
            if (arrowLeftDeg) arrowLeftDeg.textContent = `${Math.round(absDiff)}°`;
          }
          if (arrowRight) arrowRight.classList.add("hidden");
        } else {
          // Turn Right
          if (arrowRight) {
            arrowRight.classList.remove("hidden");
            if (arrowRightDeg) arrowRightDeg.textContent = `${Math.round(absDiff)}°`;
          }
          if (arrowLeft) arrowLeft.classList.add("hidden");
        }
      }
    }

    function handleOrientation(e) {
      if (manualMode) return;
      let heading = null;

      // iOS Safari provides webkitCompassHeading directly (0 = North)
      if (typeof e.webkitCompassHeading !== "undefined") {
        heading = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        // Android / Chrome provides alpha (0 to 360, counter-clockwise)
        heading = (360 - e.alpha) % 360;
      }

      if (heading !== null && !isNaN(heading)) {
        currentHeading = heading;
        updateCompassDisplay();
      }
    }

    async function startAR() {
      // 1. Start live rear camera
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          activeStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
          if (video) {
            video.srcObject = activeStream;
            video.play().catch(() => {});
          }
        }
      } catch (err) {
        console.warn("AR Camera unavailable:", err);
      }

      // 2. Request DeviceOrientation permission for iOS 13+
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm === "granted") {
            window.addEventListener("deviceorientation", handleOrientation, true);
            orientationBound = true;
          }
        } catch (e) {
          console.warn("Orientation permission prompt error:", e);
        }
      } else if (window.DeviceOrientationEvent) {
        window.addEventListener("deviceorientation", handleOrientation, true);
        orientationBound = true;
      }

      // If no sensor updates within 1s or desktop, show manual heading slider automatically
      setTimeout(() => {
        if (!orientationBound || manualMode) {
          if (manualContainer) manualContainer.classList.remove("hidden");
        }
      }, 1000);
    }

    function stopAR() {
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
        activeStream = null;
      }
      if (video) {
        video.srcObject = null;
      }
      if (orientationBound) {
        window.removeEventListener("deviceorientation", handleOrientation, true);
        orientationBound = false;
      }
      isLocked = false;
      currentTarget = null;
    }

    // Manual slider listener
    if (manualSlider) {
      manualSlider.addEventListener("input", (e) => {
        currentHeading = parseFloat(e.target.value) || 0;
        if (manualVal) manualVal.textContent = `${Math.round(currentHeading)}°`;
        updateCompassDisplay();
      });
    }

    if (calibrateBtn) {
      calibrateBtn.addEventListener("click", () => {
        manualMode = !manualMode;
        if (manualContainer) {
          manualContainer.classList.toggle("hidden", !manualMode);
        }
        calibrateBtn.classList.toggle("border-cyan-400", manualMode);
        showToast("AR SENSOR MODE", manualMode ? "Manual drag heading active" : "Device compass sensors active");
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        stopAR();
        modal.classList.add("hidden");
      });
    }

    if (openMapsBtn) {
      openMapsBtn.addEventListener("click", () => {
        if (currentTarget) {
          const item = currentTarget.item;
          openGoogleMapsDirections(item.lat, item.lng, item.landmark);
        }
      });
    }

    if (openChatBtn) {
      openChatBtn.addEventListener("click", () => {
        if (currentTarget) {
          const target = currentTarget;
          stopAR();
          modal.classList.add("hidden");
          setTimeout(() => openChatModal(target), 200);
        }
      });
    }

    return {
      open: (target) => {
        if (!target) return;
        currentTarget = target;
        const item = target.item;

        // Compute bearing and distance relative to current userLocation
        targetBearing = target.bearing || RadarAlgorithm.calculateBearingDegrees(
          state.userLocation.lat,
          state.userLocation.lng,
          item.lat,
          item.lng
        );

        const distM = calculateDistanceMeters(
          state.userLocation.lat,
          state.userLocation.lng,
          item.lat,
          item.lng
        );
        const distStr = formatDistance(distM);
        const walkStr = estimateWalkingTime(distM);

        if (reticleTitle) reticleTitle.textContent = item.title;
        if (reticleDistance) reticleDistance.textContent = distStr;
        if (hudTitle) hudTitle.textContent = item.title;
        if (hudLandmark) hudLandmark.textContent = item.landmark || "Campus";
        if (hudPrice) hudPrice.textContent = `₹${item.price}`;
        if (hudAzimuth) hudAzimuth.textContent = `BEARING: ${Math.round(targetBearing)}°`;
        if (hudDistance) hudDistance.textContent = distStr;
        if (hudWalk) hudWalk.textContent = `(${walkStr})`;

        modal.classList.remove("hidden");
        lucide.createIcons();
        startAR();
        updateCompassDisplay();
      },
      close: () => {
        stopAR();
        modal.classList.add("hidden");
      }
    };
  }

  /**
   * Setup Interactive Campus Map Pinpoint Picker Modal (Reticle & Pin Drop)
   */
  let pinpointCallback = null;
  let currentPinCoords = {
    lat: state.userLocation.lat || null,
    lng: state.userLocation.lng || null,
    landmark: "Current Spot"
  };

  function setupPinpointPickerModal() {
    const modal = document.getElementById("modal-pinpoint-picker");
    const closeBtn = document.getElementById("btn-close-pinpoint-picker");
    const confirmBtn = document.getElementById("btn-pinpoint-confirm");
    const centerMeBtn = document.getElementById("btn-pinpoint-center-me");
    const gmapsBtn = document.getElementById("btn-pinpoint-view-google-maps");
    const landmarkInput = document.getElementById("pinpoint-landmark-input");
    const coordsText = document.getElementById("pinpoint-coords-text");
    const distText = document.getElementById("pinpoint-distance-text");

    if (!modal) return null;

    function updatePinpointUI() {
      if (coordsText) {
        coordsText.textContent = `${currentPinCoords.lat.toFixed(5)}, ${currentPinCoords.lng.toFixed(5)}`;
      }
      const distM = calculateDistanceMeters(
        state.userLocation.lat,
        state.userLocation.lng,
        currentPinCoords.lat,
        currentPinCoords.lng
      );
      const walk = estimateWalkingTime(distM);
      if (distText) {
        distText.textContent = `${formatDistance(distM)} • ${walk}`;
      }
    }

    function setPinpointMapLayer(type) {
      if (!pinpointMap || typeof L === "undefined") return;
      if (pinpointCurrentTileLayer) {
        pinpointMap.removeLayer(pinpointCurrentTileLayer);
      }
      pinpointActiveLayerType = type;
      const cfg = GOOGLE_TILE_CONFIG[type] || GOOGLE_TILE_CONFIG.streets;
      pinpointCurrentTileLayer = L.tileLayer(cfg.url, cfg.options).addTo(pinpointMap);

      const streetsBtn = document.getElementById("btn-pinpoint-layer-streets");
      const satBtn = document.getElementById("btn-pinpoint-layer-satellite");
      if (streetsBtn && satBtn) {
        if (type === "streets") {
          streetsBtn.className = "px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold transition flex items-center gap-1 cursor-pointer";
          satBtn.className = "px-2 py-0.5 rounded text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer";
        } else {
          satBtn.className = "px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold transition flex items-center gap-1 cursor-pointer";
          streetsBtn.className = "px-2 py-0.5 rounded text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer";
        }
      }
    }

    function initPinpointMap() {
      if (pinpointMap) {
        setTimeout(() => pinpointMap.invalidateSize(), 150);
        return;
      }
      if (typeof L === "undefined") return;

      const mapElem = document.getElementById("pinpoint-map-viewport");
      if (!mapElem) return;

      pinpointMap = L.map("pinpoint-map-viewport", {
        zoomControl: true,
        attributionControl: false
      }).setView([currentPinCoords.lat, currentPinCoords.lng], 16);

      // Official Google Maps Tile Layer
      setPinpointMapLayer(pinpointActiveLayerType || "streets");

      // Wire Google Map Layer buttons in Pinpoint modal
      const streetsBtn = document.getElementById("btn-pinpoint-layer-streets");
      const satBtn = document.getElementById("btn-pinpoint-layer-satellite");
      if (streetsBtn) {
        streetsBtn.addEventListener("click", () => setPinpointMapLayer("streets"));
      }
      if (satBtn) {
        satBtn.addEventListener("click", () => setPinpointMapLayer("satellite"));
      }

      const reticleIcon = L.divIcon({
        className: "reticle-map-marker",
        html: ``,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      pinpointMarker = L.marker([currentPinCoords.lat, currentPinCoords.lng], {
        icon: reticleIcon,
        draggable: true
      }).addTo(pinpointMap);

      let reverseGeoTimer = null;
      function reverseGeocodeCoords(lat, lng) {
        if (reverseGeoTimer) clearTimeout(reverseGeoTimer);
        reverseGeoTimer = setTimeout(async () => {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
              headers: { "Accept-Language": "en" }
            });
            const data = await res.json();
            if (data && data.display_name && landmarkInput) {
              const nameParts = data.display_name.split(",");
              const readable = nameParts.slice(0, 2).join(",").trim();
              if (readable && (!landmarkInput.value || landmarkInput.value === "Current Spot" || landmarkInput.value.startsWith("Pin drop"))) {
                landmarkInput.value = readable;
                currentPinCoords.landmark = readable;
              }
            }
          } catch (e) {}
        }, 500);
      }

      pinpointMarker.on("drag", (e) => {
        const pos = e.target.getLatLng();
        currentPinCoords.lat = pos.lat;
        currentPinCoords.lng = pos.lng;
        updatePinpointUI();
      });

      pinpointMarker.on("dragend", (e) => {
        const pos = e.target.getLatLng();
        reverseGeocodeCoords(pos.lat, pos.lng);
      });

      pinpointMap.on("click", (e) => {
        pinpointMarker.setLatLng(e.latlng);
        currentPinCoords.lat = e.latlng.lat;
        currentPinCoords.lng = e.latlng.lng;
        updatePinpointUI();
        reverseGeocodeCoords(e.latlng.lat, e.latlng.lng);
      });

      setTimeout(() => pinpointMap.invalidateSize(), 200);
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
      });
    }

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    if (centerMeBtn) {
      centerMeBtn.addEventListener("click", () => {
        if (state.userLocation && pinpointMap && pinpointMarker) {
          currentPinCoords.lat = state.userLocation.lat;
          currentPinCoords.lng = state.userLocation.lng;
          pinpointMarker.setLatLng([currentPinCoords.lat, currentPinCoords.lng]);
          pinpointMap.panTo([currentPinCoords.lat, currentPinCoords.lng]);
          updatePinpointUI();
        }
      });
    }

    if (gmapsBtn) {
      gmapsBtn.addEventListener("click", () => {
        openGoogleMapsModal(
          currentPinCoords.lat,
          currentPinCoords.lng,
          currentPinCoords.landmark || (landmarkInput ? landmarkInput.value.trim() : "") || "Pickup Spot"
        );
      });
    }

    const searchInput = document.getElementById("pinpoint-search-input");
    const searchBtn = document.getElementById("btn-pinpoint-search");

    async function executeSearch() {
      const q = searchInput ? searchInput.value.trim() : "";
      if (!q) return;
      if (searchBtn) searchBtn.textContent = "...";
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, {
          headers: { "Accept-Language": "en" }
        });
        const results = await resp.json();
        if (results && results.length > 0) {
          const resLat = parseFloat(results[0].lat);
          const resLng = parseFloat(results[0].lon);
          const displayName = results[0].display_name.split(",")[0];
          currentPinCoords.lat = resLat;
          currentPinCoords.lng = resLng;
          currentPinCoords.landmark = displayName;
          if (landmarkInput) landmarkInput.value = displayName;
          if (pinpointMarker && pinpointMap) {
            pinpointMarker.setLatLng([resLat, resLng]);
            pinpointMap.setView([resLat, resLng], 16);
          }
          updatePinpointUI();
          showToast("CAMPUS LOCATED", `Moved map to: ${displayName}`);
        } else {
          showToast("NOT FOUND", "Location not found. Try entering your city or college name.");
        }
      } catch (err) {
        showToast("SEARCH ERROR", "Could not connect to geocoding search.");
      } finally {
        if (searchBtn) searchBtn.textContent = "Search";
      }
    }

    if (searchBtn) searchBtn.addEventListener("click", executeSearch);
    if (searchInput) {
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          executeSearch();
        }
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        if (landmarkInput && landmarkInput.value.trim()) {
          currentPinCoords.landmark = landmarkInput.value.trim();
        }
        state.selectedPickupCoords = { ...currentPinCoords, isCustom: true };
        if (pinpointCallback) {
          pinpointCallback(currentPinCoords);
        }
        modal.classList.add("hidden");
        showToast("LOCATION LOCKED", `Coordinates: ${currentPinCoords.lat.toFixed(4)}, ${currentPinCoords.lng.toFixed(4)}`);
      });
    }

    return {
      open: (initialCoords, onConfirm) => {
        pinpointCallback = onConfirm;
        const activeLat = (typeof initialCoords?.lat === "number") ? initialCoords.lat : (typeof state.userLocation.lat === "number" ? state.userLocation.lat : 20.5937);
        const activeLng = (typeof initialCoords?.lng === "number") ? initialCoords.lng : (typeof state.userLocation.lng === "number" ? state.userLocation.lng : 78.9629);
        currentPinCoords = {
          lat: activeLat,
          lng: activeLng,
          landmark: initialCoords?.landmark || ""
        };

        if (landmarkInput) {
          landmarkInput.value = currentPinCoords.landmark;
        }

        modal.classList.remove("hidden");
        initPinpointMap();

        if (pinpointMarker && pinpointMap) {
          pinpointMarker.setLatLng([currentPinCoords.lat, currentPinCoords.lng]);
          pinpointMap.setView([currentPinCoords.lat, currentPinCoords.lng], 16);
        }
        updatePinpointUI();
        lucide.createIcons();
      }
    };
  }

  function openCampusLocationPicker() {
    if (!pinpointPicker) pinpointPicker = setupPinpointPickerModal();
    if (!pinpointPicker) return;
    pinpointPicker.open(
      {
        lat: state.userLocation.lat,
        lng: state.userLocation.lng,
        landmark: state.userLocation.name ? state.userLocation.name.replace(/^📍\s*/, "") : "My Campus"
      },
      (selected) => {
        state.userLocation = {
          lat: selected.lat,
          lng: selected.lng,
          accuracy: 5,
          name: `📍 ${selected.landmark || "Custom Campus Spot"}`,
          isLiveGPS: true,
          isManual: true
        };
        state.selectedPickupCoords = {
          lat: selected.lat,
          lng: selected.lng,
          accuracy: 5,
          landmark: selected.landmark || "Campus Spot",
          isCustom: true,
          isLiveGPS: true
        };
        try {
          localStorage.setItem("radarmarket_last_known_gps", JSON.stringify({
            lat: selected.lat,
            lng: selected.lng,
            accuracy: 5,
            landmark: selected.landmark,
            timestamp: Date.now(),
            isManual: true
          }));
        } catch (e) {}

        const hudLoc = document.getElementById("hud-location-text");
        if (hudLoc) {
          hudLoc.textContent = state.userLocation.name;
          hudLoc.className = "text-cyan-300 font-mono text-[11px] font-bold cursor-pointer";
        }
        if (campusMap && campusUserMarker) {
          campusUserMarker.setLatLng([selected.lat, selected.lng]);
          campusMap.flyTo([selected.lat, selected.lng], 16);
        }
        recalculateAndRender();
        showToast("CAMPUS LOCATION LOCKED", `Set to: ${selected.landmark || "Custom Point"}`);
      }
    );
  }

  /**
   * Pan-India College & University Campus Search & Directory Subsystem
   */
  let campusSearchModalInitialized = false;
  let currentCampusCategory = "all";
  let campusSearchDebounceTimer = null;

  function setupCampusSearchModal() {
    if (campusSearchModalInitialized) return;
    campusSearchModalInitialized = true;

    const modal = document.getElementById("modal-campus-search");
    const closeBtn = document.getElementById("btn-close-campus-search");
    const searchInput = document.getElementById("campus-search-input");
    const clearBtn = document.getElementById("btn-clear-campus-search");
    const liveGpsBtn = document.getElementById("btn-campus-use-live-gps");
    const autoDetectBtn = document.getElementById("btn-campus-auto-detect");
    const pinpointLink = document.getElementById("btn-campus-open-pinpoint");
    const filterPills = document.querySelectorAll(".campus-filter-pill");

    if (closeBtn && modal) {
      closeBtn.addEventListener("click", closeCampusSearchModal);
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeCampusSearchModal();
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const val = e.target.value;
        if (clearBtn) {
          clearBtn.classList.toggle("hidden", !val);
        }
        if (campusSearchDebounceTimer) clearTimeout(campusSearchDebounceTimer);
        campusSearchDebounceTimer = setTimeout(() => {
          renderCampusList(val, currentCampusCategory);
        }, 150);
      });

      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          searchInput.value = "";
          clearBtn.classList.add("hidden");
          renderCampusList("", currentCampusCategory);
          searchInput.focus();
        });
      }
    }

    filterPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        filterPills.forEach((p) => {
          p.classList.remove("active", "bg-cyan-950", "text-cyan-300", "border-cyan-500/40");
          p.classList.add("bg-slate-900", "text-slate-300", "border-slate-800");
        });
        pill.classList.add("active", "bg-cyan-950", "text-cyan-300", "border-cyan-500/40");
        pill.classList.remove("bg-slate-900", "text-slate-300", "border-slate-800");

        currentCampusCategory = pill.dataset.category || "all";
        const query = searchInput ? searchInput.value.trim() : "";
        renderCampusList(query, currentCampusCategory);
      });
    });

    if (autoDetectBtn) {
      autoDetectBtn.addEventListener("click", () => {
        if (!("geolocation" in navigator)) {
          showToast("GPS UNAVAILABLE", "HTML5 Geolocation is not supported by your browser.");
          return;
        }

        const originalHtml = autoDetectBtn.innerHTML;
        autoDetectBtn.disabled = true;
        autoDetectBtn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 text-cyan-400 animate-spin"></i><span>Detecting...</span>`;
        if (window.lucide) lucide.createIcons();

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            autoDetectBtn.disabled = false;
            autoDetectBtn.innerHTML = originalHtml;
            if (window.lucide) lucide.createIcons();

            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = Math.round(pos.coords.accuracy || 10);

            // Update user live coordinates
            state.userLocation = {
              lat,
              lng,
              accuracy,
              name: `📍 GPS Fix (±${accuracy}m)`,
              isLiveGPS: true,
              isManual: false
            };

            // Find closest Indian campuses
            let nearestList = [];
            if (window.IndianCampuses && typeof window.IndianCampuses.findNearestCampuses === "function") {
              nearestList = window.IndianCampuses.findNearestCampuses(lat, lng, 3);
            }

            if (nearestList && nearestList.length > 0) {
              const bestMatch = nearestList[0];
              // If within 25km of a known college campus, auto-lock it!
              if (bestMatch.distanceMeters <= 25000) {
                selectCampus(bestMatch);
                showToast("📍 CAMPUS AUTO-DETECTED", `Locked to ${bestMatch.shortName || bestMatch.name} (${formatDistance(bestMatch.distanceMeters)} away)!`);
                return;
              }
            }

            // Re-render campus list sorted by proximity to user
            renderCampusList("", currentCampusCategory);
            showToast("🛰️ SATELLITE GPS ACTIVE", `Colleges ranked by proximity to your current location (±${accuracy}m).`);
          },
          (err) => {
            autoDetectBtn.disabled = false;
            autoDetectBtn.innerHTML = originalHtml;
            if (window.lucide) lucide.createIcons();
            showToast("GPS TIMEOUT", "Could not acquire satellite fix. Please enable location permissions.");
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
    }

    if (liveGpsBtn) {
      liveGpsBtn.addEventListener("click", () => {
        closeCampusSearchModal();
        activateLiveAreaScan();
        showToast("🛰️ LIVE GPS ENGAGED", "Scanning current coordinates via device satellite GPS...");
      });
    }

    if (pinpointLink) {
      pinpointLink.addEventListener("click", () => {
        closeCampusSearchModal();
        openCampusLocationPicker();
      });
    }

    // Restore previously chosen campus from localStorage if present
    try {
      const savedCampus = localStorage.getItem("radarmarket_active_campus");
      if (savedCampus) {
        const parsed = JSON.parse(savedCampus);
        state.activeCampus = parsed;
        updateCampusUI(parsed);
      }
    } catch (e) {}
  }

  function openCampusSearchModal() {
    const modal = document.getElementById("modal-campus-search");
    if (!modal) return;
    setupCampusSearchModal();
    modal.classList.remove("hidden");
    const searchInput = document.getElementById("campus-search-input");
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }
    const query = searchInput ? searchInput.value.trim() : "";
    renderCampusList(query, currentCampusCategory);
    if (window.lucide) lucide.createIcons();
  }

  function closeCampusSearchModal() {
    const modal = document.getElementById("modal-campus-search");
    if (!modal) return;
    modal.classList.add("hidden");
  }

  async function renderCampusList(query = "", category = "all") {
    const container = document.getElementById("campus-results-container");
    const statusText = document.getElementById("campus-search-status");
    if (!container) return;

    container.innerHTML = "";

    let campuses = [];
    if (window.IndianCampuses) {
      if (query) {
        campuses = window.IndianCampuses.searchCampuses(query, 30);
      } else {
        campuses = window.IndianCampuses.getCampusesByCategory(category, 30);
      }
    }

    const hasUserGps = typeof state.userLocation?.lat === "number" && !isNaN(state.userLocation.lat) &&
                       typeof state.userLocation?.lng === "number" && !isNaN(state.userLocation.lng);
    const fallbackLat = hasUserGps ? state.userLocation.lat : 28.6139;
    const fallbackLng = hasUserGps ? state.userLocation.lng : 77.2090;

    // When query is empty and user coordinates exist, rank institutes by closest proximity
    if (!query && hasUserGps && campuses.length > 0) {
      campuses.sort((a, b) => {
        const dA = calculateDistanceMeters(state.userLocation.lat, state.userLocation.lng, a.lat, a.lng);
        const dB = calculateDistanceMeters(state.userLocation.lat, state.userLocation.lng, b.lat, b.lng);
        return dA - dB;
      });
    }

    // If query is provided, show instant local results, but also run live OSM geocoding if query >= 3 chars
    if (query && query.length >= 3) {
      const qClean = query.trim();

      // If local matches are few or zero, or user is looking for a specific regional college
      if (campuses.length < 5 && window.IndianCampuses && typeof window.IndianCampuses.searchLiveIndianColleges === "function") {
        if (statusText) statusText.innerHTML = `Searching pan-India directory & live OSM maps for <span class="text-cyan-300">"${qClean}"</span>...`;
        
        // Render initial local matches if any
        campuses.forEach((c) => {
          container.appendChild(renderCampusCard(c));
        });

        // Add a live loading indicator at the bottom
        const loader = document.createElement("div");
        loader.id = "campus-live-loader";
        loader.className = "py-4 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2";
        loader.innerHTML = `<i data-lucide="loader" class="w-4 h-4 text-cyan-400 animate-spin"></i><span>Scanning all universities & colleges across India...</span>`;
        container.appendChild(loader);
        if (window.lucide) lucide.createIcons();

        try {
          const liveResults = await window.IndianCampuses.searchLiveIndianColleges(qClean);
          const activeLoader = document.getElementById("campus-live-loader");
          if (activeLoader) activeLoader.remove();

          if (liveResults && liveResults.length > 0) {
            // Deduplicate against existing displayed campuses
            const existingIds = new Set(campuses.map(c => c.id || c.name.toLowerCase()));
            liveResults.forEach(lc => {
              if (!existingIds.has(lc.id) && !existingIds.has(lc.name.toLowerCase())) {
                existingIds.add(lc.id);
                campuses.push(lc);
                container.appendChild(renderCampusCard(lc));
              }
            });
          }
        } catch (err) {
          console.warn("[CampusLiveSearch] Error:", err);
          const activeLoader = document.getElementById("campus-live-loader");
          if (activeLoader) activeLoader.remove();
        }
      }
    }

    // If still empty after local + live search
    if (campuses.length === 0) {
      container.innerHTML = `
        <div class="py-8 text-center text-slate-400 font-mono text-xs">
          <i data-lucide="map-pin-off" class="w-8 h-8 text-slate-600 mx-auto mb-2"></i>
          <p class="text-slate-200 font-bold mb-1">No exact match found for "${query}"</p>
          <p class="text-slate-400 text-[11px] mb-4">You can set "${query}" directly as your custom campus or use the pinpoint reticle.</p>
          <div class="flex flex-col sm:flex-row gap-2 justify-center items-center">
            <button type="button" id="btn-set-custom-campus" class="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-[0_0_15px_rgba(0,229,255,0.3)]">
              <i data-lucide="graduation-cap" class="w-4 h-4"></i> Set "${query}" as My Campus
            </button>
            <button type="button" id="btn-fallback-pinpoint" class="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition border border-slate-700">
              <i data-lucide="crosshair" class="w-4 h-4 text-cyan-400"></i> Custom Pinpoint Map
            </button>
          </div>
        </div>
      `;
      const setCustomBtn = document.getElementById("btn-set-custom-campus");
      if (setCustomBtn) {
        setCustomBtn.addEventListener("click", () => {
          selectCampus({
            id: `custom_${Date.now()}`,
            name: query.trim(),
            shortName: query.trim(),
            city: "Custom Location",
            state: "India",
            category: "CUSTOM",
            lat: fallbackLat,
            lng: fallbackLng
          });
        });
      }
      const fallbackBtn = document.getElementById("btn-fallback-pinpoint");
      if (fallbackBtn) {
        fallbackBtn.addEventListener("click", () => {
          closeCampusSearchModal();
          openCampusLocationPicker();
        });
      }
      if (statusText) statusText.textContent = `0 results found for "${query}"`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // When there ARE results, render any cards that haven't been rendered yet
    if (container.children.length === 0) {
      if (!query && hasUserGps) {
        const topPill = document.createElement("div");
        topPill.className = "mb-2 p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-between text-xs font-mono";
        topPill.innerHTML = `
          <div class="flex items-center gap-2 text-cyan-300 min-w-0">
            <i data-lucide="compass" class="w-4 h-4 text-cyan-400 shrink-0"></i>
            <span class="truncate">Ranked by proximity to your device GPS</span>
          </div>
          <span class="text-[10px] text-emerald-400 font-bold shrink-0 ml-2">⚡ GPS PROXIMITY</span>
        `;
        container.appendChild(topPill);
      }

      campuses.forEach((c) => {
        const card = renderCampusCard(c);
        container.appendChild(card);
      });
    }

    // Always append a universal 1-tap card at the very bottom when a search query is active
    if (query && query.trim().length >= 2) {
      const customCard = document.createElement("div");
      customCard.className = "mt-3 p-3 rounded-xl border border-dashed border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-950/40 transition-all flex items-center justify-between gap-3 cursor-pointer group";
      customCard.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-slate-950 flex items-center justify-center font-bold text-sm shrink-0 border border-cyan-500/30 transition-colors">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <h4 class="font-bold text-xs text-cyan-300 truncate">Not seeing your exact department or branch?</h4>
            <p class="text-[11px] text-slate-400 truncate">Set <span class="text-cyan-200 font-semibold">"${query.trim()}"</span> as your current radar base</p>
          </div>
        </div>
        <button type="button" class="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 group-hover:bg-cyan-500 group-hover:text-slate-950 font-mono text-xs font-bold transition shrink-0 border border-cyan-500/40">
          SET CUSTOM
        </button>
      `;
      customCard.addEventListener("click", () => {
        selectCampus({
          id: `custom_${Date.now()}`,
          name: query.trim(),
          shortName: query.trim(),
          city: "Custom Campus",
          state: "India",
          category: "CUSTOM",
          lat: fallbackLat,
          lng: fallbackLng
        });
      });
      container.appendChild(customCard);
    }

    if (statusText) {
      statusText.textContent = query 
        ? `Found ${campuses.length} colleges matching "${query}"`
        : `Showing ${campuses.length} Indian colleges & universities`;
    }

    if (window.lucide) lucide.createIcons();
  }

  function renderCampusCard(campus) {
    const isSelected = state.activeCampus && (state.activeCampus.id === campus.id || (state.activeCampus.name === campus.name));
    let distTag = "";
    if (typeof state.userLocation.lat === "number" && typeof state.userLocation.lng === "number") {
      const d = calculateDistanceMeters(state.userLocation.lat, state.userLocation.lng, campus.lat, campus.lng);
      distTag = `<span class="text-[10px] text-slate-400 font-mono shrink-0">${formatDistance(d)}</span>`;
    }

    const card = document.createElement("div");
    card.className = `p-3 rounded-xl border ${isSelected ? "border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(0,229,255,0.15)]" : "border-slate-800/80 bg-slate-900/80 hover:bg-slate-850 hover:border-slate-700"} transition-all flex items-center justify-between gap-3 cursor-pointer group`;
    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-xl ${isSelected ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-cyan-400 group-hover:bg-cyan-500/20 group-hover:text-cyan-300"} flex items-center justify-center font-bold text-sm shrink-0 border border-slate-700/50 transition-colors">
          <i data-lucide="graduation-cap" class="w-4 h-4"></i>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-xs text-slate-100 truncate group-hover:text-cyan-300 transition-colors">${campus.shortName || campus.name}</h4>
            <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-850 text-cyan-400 border border-slate-700 shrink-0 uppercase">${campus.category || 'CAMPUS'}</span>
          </div>
          <p class="text-[11px] text-slate-400 truncate">${campus.city ? campus.city + ', ' : ''}${campus.state || 'India'}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${distTag}
        <button type="button" class="px-2.5 py-1.5 rounded-lg ${isSelected ? "bg-cyan-500 text-slate-950 font-bold" : "bg-slate-800 group-hover:bg-cyan-500 group-hover:text-slate-950 text-slate-200"} text-xs font-mono transition cursor-pointer">
          ${isSelected ? "ACTIVE" : "SELECT"}
        </button>
      </div>
    `;

    card.addEventListener("click", () => {
      selectCampus(campus);
    });

    return card;
  }

  function selectCampus(campus) {
    if (!campus) return;

    state.activeCampus = campus;
    state.userLocation = {
      lat: campus.lat,
      lng: campus.lng,
      accuracy: 10,
      name: `🏫 ${campus.shortName || campus.name}`,
      isLiveGPS: false,
      isManual: true,
      campusId: campus.id
    };

    state.selectedPickupCoords = {
      lat: campus.lat,
      lng: campus.lng,
      accuracy: 10,
      landmark: campus.shortName || campus.name,
      isCustom: true,
      isLiveGPS: false
    };

    // Save active campus to localStorage for persistence across reloads
    try {
      localStorage.setItem("radarmarket_active_campus", JSON.stringify(campus));
      localStorage.setItem("radarmarket_last_known_gps", JSON.stringify({
        lat: campus.lat,
        lng: campus.lng,
        accuracy: 10,
        landmark: campus.shortName || campus.name,
        timestamp: Date.now(),
        isManual: true,
        campusId: campus.id
      }));
    } catch (e) {}

    // Update Header and Search Bar campus displays
    updateCampusUI(campus);

    // Update Seller form coordinates display if present
    const coordsDisplay = document.getElementById("sell-coords-display");
    if (coordsDisplay) {
      coordsDisplay.textContent = `${campus.lat.toFixed(5)}, ${campus.lng.toFixed(5)}`;
    }
    const gpsAccuracyBadge = document.getElementById("sell-gps-accuracy-badge");
    if (gpsAccuracyBadge) {
      gpsAccuracyBadge.textContent = `🏫 ${campus.city || "Campus Spot"}`;
      gpsAccuracyBadge.className = "text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/40";
      gpsAccuracyBadge.classList.remove("hidden");
    }

    // Reset radar perimeter to campus walking quad (500m default, expandable to 2000m)
    state.maxRadiusMeters = 500;
    const rangeSlider = document.getElementById("range-slider");
    if (rangeSlider) {
      rangeSlider.value = 500;
      rangeSlider.min = "500";
      rangeSlider.max = "2000";
      rangeSlider.step = "100";
    }
    const rangeDisplay = document.getElementById("range-value-display");
    if (rangeDisplay) {
      rangeDisplay.textContent = "500 m";
      rangeDisplay.className = "text-emerald-400 font-bold min-w-[46px] text-right";
    }
    if (radarEngine) {
      radarEngine.setMaxRadius(500);
    }

    // Update map marker if open
    if (campusUserMarker && campusMap) {
      campusUserMarker.setLatLng([campus.lat, campus.lng]);
      campusMap.setView([campus.lat, campus.lng], 15);
    }

    // Recompute DSP distances and re-render radar
    recalculateAndRender();

    // Trigger radar sonar sweep
    if (radarEngine && typeof radarEngine.triggerActiveSonarSweep === "function") {
      radarEngine.triggerActiveSonarSweep();
    }

    showToast(
      "CAMPUS LOCKED",
      `Radar centered on ${campus.shortName || campus.name} (${campus.city || 'India'})!`
    );

    closeCampusSearchModal();
  }

  function updateCampusUI(campus) {
    const currentDisplay = document.getElementById("current-campus-display");
    if (currentDisplay) {
      currentDisplay.textContent = campus ? (campus.shortName || campus.name) : "SEARCH YOUR COLLAGE HERE....";
      currentDisplay.title = campus ? `${campus.name} (${campus.city}, ${campus.state})` : "SEARCH YOUR COLLAGE HERE....";
    }

    const searchBarName = document.getElementById("search-bar-campus-name");
    if (searchBarName) {
      searchBarName.textContent = campus ? (campus.shortName || campus.name) : "Search College";
    }

    const hudLoc = document.getElementById("hud-location-text");
    if (hudLoc) {
      if (campus) {
        hudLoc.innerHTML = `🏫 <span class="text-cyan-300 font-bold">${campus.shortName || campus.name}</span>`;
        hudLoc.className = "text-cyan-300 font-mono text-[11px] font-bold cursor-pointer truncate max-w-[200px]";
      } else {
        hudLoc.innerHTML = `🏫 <span class="text-cyan-300 font-bold animate-pulse">SEARCH YOUR COLLAGE HERE....</span>`;
        hudLoc.className = "text-cyan-300 font-mono text-[11px] font-bold cursor-pointer truncate max-w-[240px]";
      }
      hudLoc.onclick = () => openCampusSearchModal();
    }
  }

  /**
   * Setup Broadcast Beacon (Sell Modal with Camera Upload & Wanted Request support)
   */
  function setupSellModal() {
    const modal = document.getElementById("modal-sell");
    const openBtn = document.getElementById("btn-open-sell-modal");
    const closeBtn = document.getElementById("btn-close-sell-modal");
    const form = document.getElementById("sell-item-form");

    let uploadedPhotoBase64 = null;

    // Initialize ISBN Scanner Subsystem
    const isbnScanner = setupIsbnScanner();

    // Initialize Interactive Pinpoint Picker Subsystem
    if (!pinpointPicker) pinpointPicker = setupPinpointPickerModal();

    // Camera & Gallery File Input Hooks
    const cameraInput = document.getElementById("sell-camera-input");
    const galleryInput = document.getElementById("sell-gallery-input");
    const triggerCameraBtn = document.getElementById("btn-trigger-camera");
    const triggerGalleryBtn = document.getElementById("btn-trigger-gallery");
    const photoActions = document.getElementById("photo-upload-actions");
    const spinner = document.getElementById("image-compressing-spinner");
    const previewBox = document.getElementById("image-preview-box");
    const previewThumb = document.getElementById("image-preview-thumb");
    const compressionBadge = document.getElementById("image-compression-badge");
    const retakeBtn = document.getElementById("btn-retake-photo");
    const removePhotoBtn = document.getElementById("btn-remove-photo");

    function processSelectedImage(file) {
      if (!file) return;
      if (spinner) spinner.classList.remove("hidden");
      if (photoActions) photoActions.classList.add("opacity-50", "pointer-events-none");

      compressImageFile(
        file,
        (base64, stats) => {
          uploadedPhotoBase64 = base64;
          if (previewThumb) previewThumb.src = base64;
          if (compressionBadge) {
            compressionBadge.textContent = `${stats.compressedKb} KB (${stats.reductionPct}% smaller)`;
          }
          if (previewBox) previewBox.classList.remove("hidden");
          if (spinner) spinner.classList.add("hidden");
          if (photoActions) {
            photoActions.classList.remove("opacity-50", "pointer-events-none");
            photoActions.classList.add("hidden");
          }
          lucide.createIcons();
          showToast("PHOTO OPTIMIZED", `Item photo compressed to ${stats.compressedKb} KB (${stats.reductionPct}% smaller). Ready to broadcast!`);
        },
        (err) => {
          if (spinner) spinner.classList.add("hidden");
          if (photoActions) photoActions.classList.remove("opacity-50", "pointer-events-none");
          showToast("IMAGE ERROR", err.message || "Failed to process photo.");
        }
      );
    }

    function clearUploadedPhoto() {
      uploadedPhotoBase64 = null;
      if (cameraInput) cameraInput.value = "";
      if (galleryInput) galleryInput.value = "";
      if (previewThumb) previewThumb.src = "";
      if (previewBox) previewBox.classList.add("hidden");
      if (spinner) spinner.classList.add("hidden");
      if (photoActions) {
        photoActions.classList.remove("opacity-50", "pointer-events-none", "hidden");
      }
    }

    const liveCamera = setupLiveCameraModal();

    if (triggerCameraBtn) {
      triggerCameraBtn.addEventListener("click", () => {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          liveCamera.open((rawBase64) => {
            processSelectedImage(rawBase64);
          });
        } else if (cameraInput) {
          cameraInput.click();
        }
      });
    }

    if (cameraInput) {
      cameraInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        processSelectedImage(file);
      });
    }

    if (triggerGalleryBtn && galleryInput) {
      triggerGalleryBtn.addEventListener("click", () => galleryInput.click());
      galleryInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        processSelectedImage(file);
      });
    }

    if (retakeBtn) {
      retakeBtn.addEventListener("click", () => {
        clearUploadedPhoto();
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          liveCamera.open((rawBase64) => {
            processSelectedImage(rawBase64);
          });
        } else if (cameraInput) {
          cameraInput.click();
        }
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener("click", () => {
        clearUploadedPhoto();
      });
    }

    // Beacon Type Tab Switcher (Sell vs Wanted)
    const typeRadios = form.querySelectorAll("input[name='sell-beacon-type']");
    const titleLabel = document.getElementById("title-label");
    const priceLabel = document.getElementById("price-label");
    const submitBtnText = document.getElementById("btn-submit-beacon-text");
    const titleInput = document.getElementById("sell-title");

    typeRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.value === "wanted") {
          titleLabel.textContent = "What are you looking for? *";
          titleInput.placeholder = "e.g. Casio fx-991CW or HC Verma Physics Vol 1";
          priceLabel.textContent = "Max Budget (₹) *";
          submitBtnText.textContent = "BROADCAST WANTED REQUEST BEACON";
        } else {
          titleLabel.textContent = "Item Title / Model / Author *";
          titleInput.placeholder = "e.g. Casio Scientific Calculator or Kreyszig Engineering Math";
          priceLabel.textContent = "Asking Price (₹) *";
          submitBtnText.textContent = "ACTIVATE RADAR BEACON";
        }
      });
    });

    // Exact GPS & Pinpoint Location Controls
    const gpsExactBtn = document.getElementById("btn-sell-gps-exact");
    const pickPinBtn = document.getElementById("btn-sell-pick-pin");
    const previewMapsBtn = document.getElementById("btn-sell-preview-maps");
    const coordsDisplay = document.getElementById("sell-coords-display");
    const gpsAccuracyBadge = document.getElementById("sell-gps-accuracy-badge");
    const landmarkInput = document.getElementById("sell-landmark");
    const sellPingGpsBtn = document.getElementById("btn-sell-ping-gps");
    const sellLiveGpsTelemetry = document.getElementById("sell-live-gps-telemetry");

    function updateSellCoordsUI() {
      const lat = (state.selectedPickupCoords && state.selectedPickupCoords.lat) || state.userLocation.lat;
      const lng = (state.selectedPickupCoords && state.selectedPickupCoords.lng) || state.userLocation.lng;
      if (coordsDisplay) {
        coordsDisplay.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
      if (gpsAccuracyBadge) {
        if (state.selectedPickupCoords?.isCustom) {
          gpsAccuracyBadge.textContent = "📍 Custom Pin Picked";
          gpsAccuracyBadge.className = "text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/40";
          gpsAccuracyBadge.classList.remove("hidden");
        } else if (state.userLocation.isLiveGPS) {
          gpsAccuracyBadge.textContent = `±${state.userLocation.accuracy || 10}m Live GPS`;
          gpsAccuracyBadge.className = "text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40";
          gpsAccuracyBadge.classList.remove("hidden");
        } else {
          gpsAccuracyBadge.textContent = "Acquiring Live GPS...";
          gpsAccuracyBadge.className = "text-[10px] font-mono font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40 animate-pulse";
          gpsAccuracyBadge.classList.remove("hidden");
        }
      }
      if (sellLiveGpsTelemetry) {
        if (state.selectedPickupCoords?.isCustom) {
          sellLiveGpsTelemetry.textContent = `📍 Custom Map Pin: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          sellLiveGpsTelemetry.className = "text-cyan-300 font-bold";
        } else if (state.userLocation.isLiveGPS) {
          sellLiveGpsTelemetry.textContent = `📍 Locked to Live GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${state.userLocation.accuracy || 8}m fix)`;
          sellLiveGpsTelemetry.className = "text-emerald-300 font-bold";
        } else {
          sellLiveGpsTelemetry.textContent = "⚠️ Acquiring Satellites... (Tap REFRESH GPS)";
          sellLiveGpsTelemetry.className = "text-amber-400 font-bold animate-pulse";
        }
      }
    }

    updateSellCoordsUI();

    if (sellPingGpsBtn) {
      sellPingGpsBtn.addEventListener("click", () => {
        if (gpsExactBtn) gpsExactBtn.click();
      });
    }

    if (gpsExactBtn) {
      gpsExactBtn.addEventListener("click", () => {
        if (!("geolocation" in navigator)) {
          showToast("GPS ERROR", "Geolocation is not supported by your device.");
          return;
        }

        const spanText = gpsExactBtn.querySelector("span");
        if (spanText) spanText.textContent = "ACQUIRING GPS...";
        gpsExactBtn.classList.add("animate-pulse");

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            gpsExactBtn.classList.remove("animate-pulse");
            if (spanText) spanText.textContent = "📍 USE EXACT GPS";
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const acc = Math.round(pos.coords.accuracy || 8);

            state.selectedPickupCoords = {
              lat,
              lng,
              accuracy: acc,
              landmark: (landmarkInput ? landmarkInput.value.trim() : "") || `Live Spot (GPS ±${acc}m)`,
              isCustom: false,
              isLiveGPS: true
            };

            state.userLocation = {
              lat,
              lng,
              accuracy: acc,
              name: `📍 Live GPS (±${acc}m)`,
              isLiveGPS: true
            };

            try {
              localStorage.setItem("radarmarket_last_known_gps", JSON.stringify({ lat, lng, accuracy: acc, timestamp: Date.now() }));
            } catch (e) {}

            if (landmarkInput && !landmarkInput.value.trim()) {
              landmarkInput.value = `Live Spot (GPS ±${acc}m)`;
            }
            updateSellCoordsUI();
            showToast("GPS FIX ACQUIRED", `Pinned exact location: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${acc}m accuracy).`);
          },
          (err) => {
            gpsExactBtn.classList.remove("animate-pulse");
            if (spanText) spanText.textContent = "📍 USE EXACT GPS";
            showToast("GPS TIMEOUT", "Unable to acquire high-accuracy GPS. Please tap 'MARK ON MAP'.");
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
    }

    if (pickPinBtn && pinpointPicker) {
      pickPinBtn.addEventListener("click", () => {
        pinpointPicker.open(
          {
            lat: state.selectedPickupCoords?.lat || state.userLocation.lat,
            lng: state.selectedPickupCoords?.lng || state.userLocation.lng,
            landmark: landmarkInput ? landmarkInput.value.trim() : ""
          },
          (selected) => {
            state.selectedPickupCoords = { ...selected, isCustom: true };
            if (landmarkInput && selected.landmark) {
              landmarkInput.value = selected.landmark;
            }
            updateSellCoordsUI();
          }
        );
      });
    }

    if (previewMapsBtn) {
      previewMapsBtn.addEventListener("click", () => {
        const lat = state.selectedPickupCoords?.lat || state.userLocation.lat;
        const lng = state.selectedPickupCoords?.lng || state.userLocation.lng;
        const landmark = (landmarkInput ? landmarkInput.value.trim() : "") || state.selectedPickupCoords?.landmark || "Pickup Spot";
        openGoogleMapsModal(lat, lng, landmark);
      });
    }

    const presetChips = modal.querySelectorAll(".btn-landmark-preset");
    presetChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const landmark = chip.dataset.landmark;
        if (landmarkInput) landmarkInput.value = landmark;
        // Preserve actual device live GPS coordinates! Only update the meeting spot name
        if (state.selectedPickupCoords) {
          state.selectedPickupCoords.landmark = landmark;
        }
        updateSellCoordsUI();
        showToast("LANDMARK SET", `Meeting spot set to: ${landmark}`);
      });
    });

    openBtn.addEventListener("click", () => {
      modal.classList.remove("hidden");
      // If user hasn't explicitly picked a custom pin on the map, sync to current user location
      if (!state.selectedPickupCoords || !state.selectedPickupCoords.isCustom) {
        state.selectedPickupCoords = {
          lat: state.userLocation.lat,
          lng: state.userLocation.lng,
          accuracy: state.userLocation.accuracy || 10,
          landmark: state.selectedPickupCoords?.landmark || (state.userLocation.isLiveGPS ? "Live GPS Location" : "Campus Location"),
          isCustom: false,
          isLiveGPS: !!state.userLocation.isLiveGPS
        };
      }
      updateSellCoordsUI();

      // Proactively acquire live GPS immediately if not yet locked
      if (!state.userLocation.isLiveGPS && ("geolocation" in navigator)) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = Math.round(pos.coords.accuracy || 8);
            state.userLocation = {
              lat,
              lng,
              accuracy,
              name: `📍 Live GPS (±${accuracy}m)`,
              isLiveGPS: true
            };
            try {
              localStorage.setItem("radarmarket_last_known_gps", JSON.stringify({ lat, lng, accuracy, timestamp: Date.now() }));
            } catch (e) {}
            if (!state.selectedPickupCoords || !state.selectedPickupCoords.isCustom) {
              state.selectedPickupCoords = {
                lat,
                lng,
                accuracy,
                landmark: "Live GPS Location",
                isCustom: false,
                isLiveGPS: true
              };
            }
            updateSellCoordsUI();
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    });
    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
      clearUploadedPhoto();
      liveCamera.close();
      if (isbnScanner) isbnScanner.reset();
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        clearUploadedPhoto();
        liveCamera.close();
        if (isbnScanner) isbnScanner.reset();
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const category = form.querySelector("input[name='sell-category']:checked").value;
      const beaconType = form.querySelector("input[name='sell-beacon-type']:checked")?.value || "sell";
      const defaultSubcat = 
        category === "books" ? "Textbook" :
        category === "hostel" ? "Hostel Essential" :
        category === "lab" ? "Lab Gear" :
        category === "tech" ? "Tech Gadget" : "Stationery";
      const subCategory = document.getElementById("sell-subcategory").value.trim() || defaultSubcat;
      const condition = document.getElementById("sell-condition").value;
      const price = parseFloat(document.getElementById("sell-price").value);
      const origPriceVal = document.getElementById("sell-orig-price").value;
      const originalPrice = origPriceVal ? parseFloat(origPriceVal) : Math.round(price * 1.6);
      const upiId = document.getElementById("sell-upi-id") ? document.getElementById("sell-upi-id").value.trim() : "";
      const landmark = document.getElementById("sell-landmark").value.trim();
      const description = document.getElementById("sell-desc").value.trim();
      
      let image = uploadedPhotoBase64 || document.getElementById("sell-image").value.trim();

      if (!image) {
        const presets = PRESET_PHOTOS[category] || PRESET_PHOTOS.stationery;
        image = presets[Math.floor(Math.random() * presets.length)];
      }

      // Ensure we acquire live GPS coordinates before broadcasting if not yet locked
      if (!state.userLocation.isLiveGPS && (!state.selectedPickupCoords || !state.selectedPickupCoords.isCustom) && ("geolocation" in navigator)) {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;
              const acc = Math.round(pos.coords.accuracy || 8);
              state.userLocation = {
                lat,
                lng,
                accuracy: acc,
                name: `📍 Live GPS (±${acc}m)`,
                isLiveGPS: true
              };
              try {
                localStorage.setItem("radarmarket_last_known_gps", JSON.stringify({ lat, lng, accuracy: acc, timestamp: Date.now() }));
              } catch (e) {}
              state.selectedPickupCoords = {
                lat,
                lng,
                accuracy: acc,
                landmark: state.selectedPickupCoords?.landmark || "Live Location",
                isCustom: false,
                isLiveGPS: true
              };
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 2500 }
          );
        });
      }

      // Determine final coordinates:
      // ALWAYS prioritize verified device live GPS coordinates!
      let finalLat, finalLng;
      if (state.userLocation && state.userLocation.isLiveGPS && typeof state.userLocation.lat === "number") {
        finalLat = state.userLocation.lat;
        finalLng = state.userLocation.lng;
      } else if (state.selectedPickupCoords && typeof state.selectedPickupCoords.lat === "number") {
        finalLat = state.selectedPickupCoords.lat;
        finalLng = state.selectedPickupCoords.lng;
      } else if (state.userLocation && typeof state.userLocation.lat === "number") {
        finalLat = state.userLocation.lat;
        finalLng = state.userLocation.lng;
      } else {
        showToast("GPS REQUIRED", "Acquiring satellites... Please tap 'USE EXACT GPS' or allow location.");
        return;
      }

      const itemPayload = {
        title,
        category,
        sub_category: subCategory,
        subCategory,
        price,
        original_price: originalPrice,
        originalPrice,
        condition,
        condition_score: condition === "Like New" ? 0.95 : condition === "Good" ? 0.85 : 0.7,
        conditionScore: condition === "Like New" ? 0.95 : condition === "Good" ? 0.85 : 0.7,
        lat: finalLat,
        lng: finalLng,
        landmark,
        description,
        image,
        beacon_type: beaconType,
        upi_id: upiId,
        tags: [category, condition.toLowerCase(), beaconType, ...title.toLowerCase().split(" ")].slice(0, 6)
      };

      let newItem = null;
      if (window.MarketAPI) {
        newItem = await MarketAPI.createItem(itemPayload);
      } else {
        newItem = MarketData.addNewListing(itemPayload);
      }

      // Reset & close
      form.reset();
      if (isbnScanner) isbnScanner.reset();
      clearUploadedPhoto();
      modal.classList.add("hidden");

      // Refresh market and select new item
      await refreshMarket();
      updateMyBeaconsBadge();

      if (newItem) {
        const newTarget = state.filteredItems.find((t) => t.item.id === newItem.id);
        if (newTarget) {
          selectTarget(newTarget);
        }
      }

      const alertMsg = beaconType === "wanted" 
        ? `Wanted Request for "${title}" is pulsing on all nearby radars!` 
        : `"${title}" is now active on all nearby radargrams!`;
      showToast(beaconType === "wanted" ? "WANTED BEACON ACTIVE" : "BEACON BROADCASTED", alertMsg);

      if (radarEngine && state.audioEnabled) {
        radarEngine.playSonarPing(beaconType === "wanted" ? 1400 : 1200, 0.1);
      }
    });
  }

  /**
   * Setup Fullscreen Photo Lightbox Modal (Inspect Condition & Editions)
   */
  function setupPhotoLightbox() {
    const modal = document.getElementById("modal-photo-lightbox");
    const closeBtn = document.getElementById("btn-close-lightbox");
    const lightboxImg = document.getElementById("lightbox-image");
    const lightboxTitle = document.getElementById("lightbox-title");
    const lightboxCondition = document.getElementById("lightbox-condition");

    function openPhotoLightbox(src, title, conditionText) {
      if (!modal || !lightboxImg || !src) return;
      lightboxImg.src = src;
      if (lightboxTitle) lightboxTitle.textContent = title || "Item Photo";
      if (lightboxCondition) lightboxCondition.textContent = conditionText || "Authentic Photo";
      modal.classList.remove("hidden");
      if (window.lucide) lucide.createIcons();
    }

    function closePhotoLightbox() {
      if (!modal) return;
      modal.classList.add("hidden");
      if (lightboxImg) lightboxImg.src = "";
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closePhotoLightbox);
    }
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closePhotoLightbox();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
        closePhotoLightbox();
      }
    });

    // Wire up target spotlight image container
    const targetImageContainer = document.getElementById("target-image-container");
    if (targetImageContainer) {
      targetImageContainer.addEventListener("click", () => {
        if (state.selectedTarget && state.selectedTarget.item) {
          const item = state.selectedTarget.item;
          const imgSrc = item.image || (PRESET_PHOTOS[item.category] || PRESET_PHOTOS.stationery)[0];
          openPhotoLightbox(imgSrc, item.title, item.condition || "Authentic Photo");
        }
      });
    }

    window.openPhotoLightbox = openPhotoLightbox;
    window.closePhotoLightbox = closePhotoLightbox;
  }

  /**
   * Setup Mobile Pairing Modal
   */
  async function setupMobileModal() {
    const modal = document.getElementById("modal-mobile-connect");
    const openBtn = document.getElementById("btn-open-mobile-modal");
    const closeBtn = document.getElementById("btn-close-mobile-modal");
    const qrImg = document.getElementById("mobile-qr-image");
    const lanUrlSpan = document.getElementById("mobile-lan-url");
    const copyBtn = document.getElementById("btn-copy-lan-url");
    const copyText = document.getElementById("copy-btn-text");

    const connectHint = document.getElementById("mobile-connect-hint");

    openBtn.addEventListener("click", async () => {
      let shareUrl = window.location.origin;
      let isPublic = !window.location.hostname.includes("localhost") && !window.location.hostname.includes("127.0.0.1") && !window.location.hostname.startsWith("10.") && !window.location.hostname.startsWith("192.168.");
      
      if (window.MarketAPI) {
        try {
          const net = await MarketAPI.getNetworkInfo();
          if (net) {
            shareUrl = net.public_url || (isPublic ? window.location.origin : (net.lan_url || net.active_url || window.location.origin));
            if (net.public_url) isPublic = true;
          }
        } catch (e) {}
      }

      lanUrlSpan.textContent = shareUrl;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}&bgcolor=0d1522&color=00e5ff`;
      
      if (connectHint) {
        if (isPublic || shareUrl.startsWith("https://")) {
          connectHint.innerHTML = `<span class="text-emerald-400 font-bold">✓ Global HTTPS Active:</span> Accessible worldwide on any 4G/5G phone or Wi-Fi network!`;
        } else {
          connectHint.textContent = "Same Wi-Fi network required for direct phone connection.";
        }
      }

      modal.classList.remove("hidden");
    });

    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    copyBtn.addEventListener("click", () => {
      const url = lanUrlSpan.textContent;
      navigator.clipboard.writeText(url).then(() => {
        copyText.textContent = "Copied!";
        setTimeout(() => (copyText.textContent = "Copy"), 2000);
      });
    });
  }

  /**
   * Update Google Auth Modal UI based on authentication status
   */
  function updateAuthModalUI(user) {
    const signedInView = document.getElementById("auth-view-signed-in");
    const guestView = document.getElementById("auth-view-guest");
    if (!signedInView || !guestView) return;

    const isAuth = !!(user && (user.google_id || user.auth_provider === "google"));
    const isCampus = !!(user && user.is_campus_verified);

    if (isAuth) {
      signedInView.classList.remove("hidden");
      guestView.classList.add("hidden");

      const avatar = document.getElementById("auth-signedin-avatar");
      const name = document.getElementById("auth-signedin-name");
      const email = document.getElementById("auth-signedin-email");
      const campusTag = document.getElementById("auth-badge-campus-tag");
      const bonusText = document.getElementById("auth-signedin-trust-bonus");
      const nicknameInput = document.getElementById("input-google-nickname");

      if (avatar) avatar.src = user.avatar || user.picture || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80";
      if (name) name.textContent = user.nickname || "Google Student";
      if (email) email.textContent = user.email || "Verified Google Account";
      if (nicknameInput) nicknameInput.value = user.nickname || "";

      if (campusTag) {
        if (isCampus) {
          campusTag.classList.remove("hidden");
        } else {
          campusTag.classList.add("hidden");
        }
      }

      if (bonusText) {
        bonusText.textContent = isCampus ? "Trust Index Boost: +30 Points (Campus Verified)" : "Trust Index Boost: +20 Points (Google Verified)";
      }
    } else {
      signedInView.classList.add("hidden");
      guestView.classList.remove("hidden");

      const guestInput = document.getElementById("input-guest-nickname");
      if (guestInput && user) {
        guestInput.value = user.nickname || "";
      }
    }
  }

  /**
   * Setup Google Authentication & Campus Identity Modal
   */
  function setupGoogleAuthModal() {
    const modal = document.getElementById("modal-google-auth");
    const openBtn = document.getElementById("btn-open-google-auth");
    const openBtnFromSell = document.getElementById("btn-sell-switch-google");
    const closeBtn = document.getElementById("btn-close-google-auth-modal");
    const signoutBtn = document.getElementById("btn-google-signout");
    const myBeaconsBtn = document.getElementById("btn-auth-my-beacons");
    const clientIdInput = document.getElementById("input-google-client-id");
    const saveClientIdBtn = document.getElementById("btn-save-google-client-id");
    const universalForm = document.getElementById("form-universal-email-login");
    const universalEmailInput = document.getElementById("input-universal-email");
    const universalNameInput = document.getElementById("input-universal-name");
    const universalSubmitBtn = document.getElementById("btn-submit-universal-email");
    const domainChips = modal.querySelectorAll(".btn-domain-chip");
    const gisStatusFeedback = document.getElementById("gis-status-feedback");
    const gisPromptText = document.getElementById("btn-trigger-gis-text");

    if (!modal) return;

    // Load saved client ID into input
    if (clientIdInput && window.MarketAPI) {
      clientIdInput.value = MarketAPI.getGoogleClientId();
    }

    const openModal = () => {
      if (window.MarketAPI) {
        const user = MarketAPI.getCurrentUser();
        updateAuthModalUI(user);
        initGoogleIdentityServices();

        const isAuth = !!(user && (user.google_id || user.auth_provider === "google"));
        if (!isAuth && universalEmailInput) {
          setTimeout(() => {
            universalEmailInput.focus();
          }, 100);
        }
      }
      modal.classList.remove("hidden");
      if (window.lucide) lucide.createIcons();
    };

    if (openBtn) openBtn.addEventListener("click", openModal);
    if (openBtnFromSell) openBtnFromSell.addEventListener("click", openModal);

    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    // 1. Universal Instant Email & Google ID Sign-In Handler
    if (universalForm && universalEmailInput) {
      universalForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = universalEmailInput.value.trim();
        const name = universalNameInput ? universalNameInput.value.trim() : "";
        if (!email || !email.includes("@")) {
          showToast("INVALID EMAIL", "Please enter a valid email address.");
          universalEmailInput.focus();
          return;
        }

        if (universalSubmitBtn) {
          universalSubmitBtn.disabled = true;
          universalSubmitBtn.innerHTML = `<span class="inline-block w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span><span>Signing in...</span>`;
        }

        try {
          if (window.MarketAPI) {
            await MarketAPI.loginWithEmail({ email, name });
            modal.classList.add("hidden");
            const user = MarketAPI.getCurrentUser();
            const badgeType = user?.is_campus_verified ? "CAMPUS VERIFIED (+30 Trust)" : "VERIFIED (+20 Trust)";
            showToast("SIGNED IN SUCCESSFULLY", `Welcome, ${user?.nickname || email}! ${badgeType} activated.`);
            refreshMarket();
          }
        } catch (err) {
          showToast("SIGN-IN ERROR", err.message || "Failed to sign in with email.");
        } finally {
          if (universalSubmitBtn) {
            universalSubmitBtn.disabled = false;
            universalSubmitBtn.innerHTML = `<i data-lucide="check-circle-2" class="w-4 h-4"></i><span>Sign In & Verify Account</span>`;
            if (window.lucide) lucide.createIcons();
          }
        }
      });
    }

    // Quick Domain Autofill Chips
    if (domainChips && universalEmailInput) {
      domainChips.forEach((chip) => {
        chip.addEventListener("click", () => {
          const domain = chip.getAttribute("data-domain") || "@gmail.com";
          const current = universalEmailInput.value.trim();
          if (!current) {
            universalEmailInput.value = domain;
            universalEmailInput.setSelectionRange(0, 0);
          } else if (current.includes("@")) {
            const prefix = current.split("@")[0];
            universalEmailInput.value = prefix + domain;
          } else {
            universalEmailInput.value = current + domain;
          }
          universalEmailInput.focus();
        });
      });
    }

    // Initialize Google Identity Services (GIS)
    function initGoogleIdentityServices() {
      if (typeof google === "undefined" || !google.accounts || !google.accounts.id) return;
      const clientId = window.MarketAPI ? MarketAPI.getGoogleClientId() : "";
      if (!clientId) return;

      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (response && response.credential) {
              try {
                await MarketAPI.loginWithGoogle(response.credential);
                modal.classList.add("hidden");
                showToast("GOOGLE VERIFIED", `Signed in successfully as ${MarketAPI.getCurrentUser()?.nickname}!`);
                refreshMarket();
              } catch (err) {
                showToast("AUTH ERROR", err.message || "Google token verification failed.");
              }
            }
          }
        });

        const btnContainer = document.getElementById("google-signin-btn-container");
        if (btnContainer) {
          btnContainer.innerHTML = "";
          google.accounts.id.renderButton(btnContainer, {
            theme: "filled_blue",
            size: "large",
            shape: "pill",
            text: "signin_with",
            width: 250
          });
        }
      } catch (e) {
        console.warn("GIS initialization notice:", e.message);
      }
    }

    // Trigger Google Account Chooser (OAuth2 Popup + One-Tap with explicit fallback)
    if (triggerGisBtn) {
      triggerGisBtn.addEventListener("click", () => {
        const clientId = window.MarketAPI ? MarketAPI.getGoogleClientId() : "";
        if (!clientId) {
          showToast("ENTER EMAIL", "Enter your Gmail address in the email field above to sign in in 1 click!");
          if (universalEmailInput) universalEmailInput.focus();
          return;
        }

        if (gisStatusFeedback) gisStatusFeedback.classList.add("hidden");
        if (gisPromptText) gisPromptText.textContent = "Connecting to Google...";

        let popupTriggered = false;

        // Try Google OAuth2 Token Client (Opens official Google Account Chooser popup window)
        try {
          if (typeof google !== "undefined" && google.accounts && google.accounts.oauth2) {
            const tokenClient = google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: "email profile openid",
              callback: async (tokenResponse) => {
                if (gisPromptText) gisPromptText.textContent = "Open Google Account Chooser";
                if (tokenResponse && tokenResponse.access_token) {
                  try {
                    const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                      headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                    });
                    const info = await infoRes.json();
                    if (info && info.email) {
                      await MarketAPI.loginWithEmail({
                        email: info.email,
                        name: info.name || info.given_name,
                        picture: info.picture,
                        google_id: info.sub
                      });
                      modal.classList.add("hidden");
                      showToast("GOOGLE VERIFIED", `Welcome, ${info.name || info.email}!`);
                      refreshMarket();
                      return;
                    }
                  } catch (fetchErr) {
                    console.warn("Google userinfo error:", fetchErr);
                  }
                }
              },
              error_callback: (err) => {
                console.warn("Google OAuth2 popup error:", err);
                if (gisPromptText) gisPromptText.textContent = "Open Google Account Chooser";
                if (gisStatusFeedback) {
                  gisStatusFeedback.textContent = "Google Popup was blocked by browser. Please type your Email ID above and tap Sign In!";
                  gisStatusFeedback.classList.remove("hidden");
                }
                if (universalEmailInput) {
                  universalEmailInput.focus();
                  if (!universalEmailInput.value) universalEmailInput.value = "@gmail.com";
                }
              }
            });

            tokenClient.requestAccessToken({ prompt: "select_account" });
            popupTriggered = true;
          }
        } catch (e) {
          console.warn("OAuth2 client exception:", e.message);
        }

        // Also try GIS prompt if popup wasn't initialized
        if (!popupTriggered && typeof google !== "undefined" && google.accounts && google.accounts.id) {
          try {
            google.accounts.id.prompt((notification) => {
              if (gisPromptText) gisPromptText.textContent = "Open Google Account Chooser";
              if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                if (gisStatusFeedback) {
                  gisStatusFeedback.textContent = "Google 1-Tap was restricted by browser. Enter your Gmail / Email ID above to sign in instantly!";
                  gisStatusFeedback.classList.remove("hidden");
                }
                if (universalEmailInput) universalEmailInput.focus();
              }
            });
          } catch (e) {
            console.warn("GIS prompt exception:", e.message);
          }
        } else if (!popupTriggered) {
          if (gisPromptText) gisPromptText.textContent = "Open Google Account Chooser";
          if (gisStatusFeedback) {
            gisStatusFeedback.textContent = "Google Services blocked by browser security. Enter your Email ID above to sign in in 1 click!";
            gisStatusFeedback.classList.remove("hidden");
          }
          if (universalEmailInput) universalEmailInput.focus();
        }

        // Reset button text after 3s if no callback fired
        setTimeout(() => {
          if (gisPromptText && gisPromptText.textContent === "Connecting to Google...") {
            gisPromptText.textContent = "Open Google Account Chooser";
          }
        }, 3000);
      });
    }

    // Save Custom Google Cloud Client ID
    if (saveClientIdBtn && clientIdInput) {
      saveClientIdBtn.addEventListener("click", () => {
        const id = clientIdInput.value.trim();
        if (window.MarketAPI) {
          MarketAPI.setGoogleClientId(id);
          showToast("CLIENT ID SAVED", "Custom Google Client ID updated. Initializing Google Identity...");
          initGoogleIdentityServices();
        }
      });
    }

    // Instant 1-Click Campus Test Accounts
    const demoBtns = modal.querySelectorAll(".btn-demo-login");
    demoBtns.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-email");
        const name = btn.getAttribute("data-name");
        const picture = btn.getAttribute("data-picture");
        if (window.MarketAPI) {
          await MarketAPI.loginWithEmail({ email, name, picture });
          modal.classList.add("hidden");
          const user = MarketAPI.getCurrentUser();
          showToast("CAMPUS IDENTITY VERIFIED", `Welcome, ${user?.nickname}! +30 Trust score granted.`);
          refreshMarket();
        }
      });
    });

    // Sign Out
    if (signoutBtn) {
      signoutBtn.addEventListener("click", async () => {
        if (window.MarketAPI) {
          await MarketAPI.logoutGoogle();
          modal.classList.add("hidden");
          showToast("SIGNED OUT", "You are now browsing in Guest mode.");
          refreshMarket();
        }
      });
    }

    // My Beacons from Auth Modal
    if (myBeaconsBtn) {
      myBeaconsBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
        const beaconsModal = document.getElementById("modal-my-beacons");
        if (beaconsModal) {
          beaconsModal.classList.remove("hidden");
          renderMyBeacons();
        }
      });
    }

    // Edit Google display nickname
    if (editGoogleNicknameForm) {
      editGoogleNicknameForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("input-google-nickname");
        const newName = input ? input.value.trim() : "";
        if (!newName) return;
        if (window.MarketAPI) {
          await MarketAPI.updateProfile(newName);
          modal.classList.add("hidden");
          showToast("NICKNAME UPDATED", `Trading as "${newName}".`);
        }
      });
    }

    // Edit Guest nickname
    if (guestNicknameForm) {
      guestNicknameForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("input-guest-nickname");
        const newName = input ? input.value.trim() : "";
        if (!newName) return;
        if (window.MarketAPI) {
          await MarketAPI.updateProfile(newName);
          modal.classList.add("hidden");
          showToast("GUEST IDENTITY UPDATED", `Trading as "${newName}".`);
        }
      });
    }

    // Try initial GIS init
    setTimeout(initGoogleIdentityServices, 1000);
  }

  /**
   * Setup Algorithm Inspector Modal
   */
  function setupAlgorithmModal() {
    const modal = document.getElementById("modal-algorithm");
    const closeBtn = document.getElementById("btn-close-algo-modal");
    const okBtn = document.getElementById("btn-close-algo-modal-ok");
    const inspectBtn = document.getElementById("btn-inspect-algo");
    const quickExplainBtn = document.getElementById("btn-explain-algorithm-quick");

    const openModal = () => {
      if (!state.selectedTarget) return;
      const t = state.selectedTarget;

      document.getElementById("algo-score-final").textContent = `${t.algorithmScore} / 100`;
      document.getElementById("algo-rssi").textContent = `${t.rssi} dBm`;
      document.getElementById("algo-tier").textContent = t.signalClass;

      const b = t.breakdown;
      document.getElementById("algo-factor-prox").textContent = `${b.proximityScore} / 100`;
      document.getElementById("algo-bar-prox").style.width = `${b.proximityScore}%`;

      document.getElementById("algo-factor-value").textContent = `${b.valueScore} / 100`;
      document.getElementById("algo-bar-value").style.width = `${b.valueScore}%`;

      document.getElementById("algo-factor-trust").textContent = `${b.trustScore} / 100`;
      document.getElementById("algo-bar-trust").style.width = `${b.trustScore}%`;

      document.getElementById("algo-factor-fresh").textContent = `${b.freshnessScore} / 100`;
      document.getElementById("algo-bar-fresh").style.width = `${b.freshnessScore}%`;

      modal.classList.remove("hidden");
    };

    inspectBtn.addEventListener("click", openModal);
    quickExplainBtn.addEventListener("click", openModal);

    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    okBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }

  /**
   * Setup Direct Signal Chat Modal (Real P2P Multi-Device Chat)
   */
  function setupChatModal() {
    const modal = document.getElementById("modal-chat");
    const closeBtn = document.getElementById("btn-close-chat-modal");
    const signalBtn = document.getElementById("btn-signal-seller");
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const chips = modal.querySelectorAll(".quick-chip");

    // Safe Campus Hubs selector
    const safeHubSelect = document.getElementById("chat-safe-hub-select");
    if (safeHubSelect) {
      safeHubSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val) {
          sendChatMessage(`📍 Proposed Safe Meetup: ${val}`);
          safeHubSelect.value = "";
        }
      });
    }

    // Share Exact Meetup Point button
    const sharePinBtn = document.getElementById("btn-chat-share-pin");
    if (sharePinBtn) {
      sharePinBtn.addEventListener("click", () => {
        if (!pinpointPicker) pinpointPicker = setupPinpointPickerModal();
        if (!pinpointPicker) return;
        pinpointPicker.open(
          {
            lat: state.userLocation.lat,
            lng: state.userLocation.lng,
            landmark: "Proposed Campus Meetup Spot"
          },
          (spot) => {
            const spotName = spot.landmark || "Custom Meetup Point";
            sendChatMessage(`[MEETUP_POINT:${spot.lat.toFixed(5)},${spot.lng.toFixed(5)},${spotName}]`);
          }
        );
      });
    }

    // UPI Payment QR sheet
    const upiPayBtn = document.getElementById("btn-open-upi-pay");
    const upiSheet = document.getElementById("chat-upi-sheet");
    const closeUpiBtn = document.getElementById("btn-close-upi-sheet");
    const upiAmount = document.getElementById("chat-upi-amount");
    const upiIdDisplay = document.getElementById("chat-upi-id-display");
    const upiQrImg = document.getElementById("chat-upi-qr-img");

    if (upiPayBtn && upiSheet) {
      upiPayBtn.addEventListener("click", () => {
        let target = state.selectedTarget;
        if (!target && state.activeChatId) {
          target = state.evaluatedItems.find(t => t.item.id === state.activeChatId);
        }
        if (!target) return;
        const item = target.item;
        const upiId = item.upi_id || "campus-trade@okhdfcbank";
        const sellerName = item.seller?.name || item.seller_name || "Campus Seller";
        const effectivePrice = state.activeChatAgreedPrice || item.agreed_price || item.price;
        const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(sellerName)}&am=${effectivePrice}&tn=${encodeURIComponent(item.title)}`;

        if (upiAmount) {
          if (effectivePrice < item.price) {
            upiAmount.innerHTML = `<span class="line-through text-slate-500 text-xs mr-1">₹${item.price}</span>₹${effectivePrice} <span class="text-[9px] text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-500/40 font-bold">BARGAIN DEAL</span>`;
          } else {
            upiAmount.textContent = `₹${effectivePrice}`;
          }
        }
        if (upiIdDisplay) upiIdDisplay.textContent = upiId;
        if (upiQrImg) {
          upiQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiUrl)}&bgcolor=0d1522&color=00ff9d`;
        }
        upiSheet.classList.remove("hidden");
      });

      if (closeUpiBtn) {
        closeUpiBtn.addEventListener("click", () => {
          upiSheet.classList.add("hidden");
        });
      }
    }

    // Secure Handshake button in Chat Toolbar
    const handshakeBtn = document.getElementById("btn-chat-handshake");
    if (handshakeBtn) {
      handshakeBtn.addEventListener("click", () => {
        if (!handshakeModal) handshakeModal = setupHandshakeModal();
        let target = state.selectedTarget;
        if (!target && state.activeChatId) {
          target = state.evaluatedItems.find(t => t.item.id === state.activeChatId);
        }
        if (target && handshakeModal) {
          handshakeModal.open(target);
        } else {
          showToast("NO ITEM SELECTED", "Please select an active item to verify handshake.");
        }
      });
    }

    // Make an Offer button & quick chip in Chat Toolbar
    const makeOfferBtn = document.getElementById("btn-chat-make-offer");
    const chipOfferBtn = document.getElementById("btn-chip-make-offer");
    const handleMakeOfferClick = () => {
      if (!makeOfferModal) makeOfferModal = setupMakeOfferModal();
      let target = state.selectedTarget;
      if (!target && state.activeChatId) {
        target = state.evaluatedItems.find(t => t.item.id === state.activeChatId);
      }
      if (target && makeOfferModal) {
        makeOfferModal.open(target.item);
      } else {
        showToast("NO ITEM SELECTED", "Please select an active item to make an offer.");
      }
    };
    if (makeOfferBtn) makeOfferBtn.addEventListener("click", handleMakeOfferClick);
    if (chipOfferBtn) chipOfferBtn.addEventListener("click", handleMakeOfferClick);

    // AR Live Direction button in Chat Toolbar
    const arGuideBtn = document.getElementById("btn-chat-ar-direction");
    if (arGuideBtn) {
      arGuideBtn.addEventListener("click", () => {
        if (!arCompassModalInstance) arCompassModalInstance = setupARCompassModal();
        let target = state.selectedTarget;
        if (!target && state.activeChatId) {
          target = state.evaluatedItems.find(t => t.item.id === state.activeChatId);
        }
        if (target && arCompassModalInstance) {
          arCompassModalInstance.open(target);
        } else {
          showToast("NO TARGET FOUND", "Could not acquire target coordinates for AR Finder.");
        }
      });
    }

    signalBtn.addEventListener("click", () => {
      if (state.selectedTarget) {
        openChatModal(state.selectedTarget);
      }
    });

    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
      if (upiSheet) upiSheet.classList.add("hidden");
      state.activeChatId = null;
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (upiSheet) upiSheet.classList.add("hidden");
        state.activeChatId = null;
      }
    });

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        sendChatMessage(chip.textContent.trim());
      });
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      sendChatMessage(text);
      input.value = "";
    });
  }

  /**
   * Secure Handshake Meetup Audio Chime (Dual-tone Harmonic Ascending Arpeggio)
   */
  function playHandshakeChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } catch (e) {}
  }

  /**
   * Celebration Confetti Burst Effect
   */
  function triggerHandshakeConfetti() {
    const colors = ["#00ff9d", "#00e5ff", "#ffd700", "#ff007f", "#ffffff"];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement("div");
      p.className = "fixed pointer-events-none z-[9999]";
      const size = Math.random() * 8 + 4;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      p.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";

      const startX = window.innerWidth / 2;
      const startY = window.innerHeight / 2;
      p.style.left = `${startX}px`;
      p.style.top = `${startY}px`;

      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 200 + 70;
      const destX = Math.cos(angle) * velocity;
      const destY = Math.sin(angle) * velocity - 60;

      p.style.transition = "transform 0.9s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.9s ease-out";
      p.style.transform = "translate(0, 0) scale(1)";
      document.body.appendChild(p);

      requestAnimationFrame(() => {
        p.style.transform = `translate(${destX}px, ${destY}px) scale(0.4) rotate(${Math.random() * 360}deg)`;
        p.style.opacity = "0";
      });

      setTimeout(() => p.remove(), 1000);
    }
  }

  /**
   * Setup Secure Handshake Meetup Verification Modal (P2P OTP Verification)
   */
  let activeHandshakeTarget = null;
  let activeHandshakeCode = null;
  let selectedFeedbackTag = "Smooth & fast!";

  function setupHandshakeModal() {
    const modal = document.getElementById("modal-handshake");
    const closeBtn = document.getElementById("btn-close-handshake");
    const doneBtn = document.getElementById("btn-close-handshake-success");
    const submitBtn = document.getElementById("btn-submit-handshake");
    const sellerView = document.getElementById("handshake-seller-view");
    const buyerView = document.getElementById("handshake-buyer-view");
    const successView = document.getElementById("handshake-success-view");
    const titleElem = document.getElementById("handshake-item-title");
    const qrImg = document.getElementById("handshake-qr-img");

    if (!modal) return null;

    const pinInputs = [
      document.getElementById("input-pin-0"),
      document.getElementById("input-pin-1"),
      document.getElementById("input-pin-2"),
      document.getElementById("input-pin-3")
    ];

    const tagBtns = modal.querySelectorAll(".btn-handshake-tag");
    tagBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        tagBtns.forEach((b) => {
          b.className = "btn-handshake-tag px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition cursor-pointer";
        });
        btn.className = "btn-handshake-tag px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold border border-emerald-400 transition cursor-pointer";
        selectedFeedbackTag = btn.dataset.tag;
      });
    });

    // 4-box PIN auto-advance and backspace logic
    pinInputs.forEach((inp, idx) => {
      if (!inp) return;
      inp.addEventListener("input", (e) => {
        const val = e.target.value.replace(/\D/g, "");
        e.target.value = val ? val.slice(-1) : "";
        if (val && idx < 3) {
          pinInputs[idx + 1].focus();
        }
      });

      inp.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !e.target.value && idx > 0) {
          pinInputs[idx - 1].focus();
        }
        if (e.key === "Enter" && submitBtn) {
          submitBtn.click();
        }
      });
    });

    function showHandshakeCelebration() {
      if (sellerView) sellerView.classList.add("hidden");
      if (buyerView) buyerView.classList.add("hidden");
      if (successView) successView.classList.remove("hidden");
      playHandshakeChime();
      triggerHandshakeConfetti();
      showToast("HANDSHAKE COMPLETE", "Item marked as SOLD. +50 Trust Boost earned!");
      lucide.createIcons();
    }

    // Submit PIN verification handler
    if (submitBtn) {
      submitBtn.addEventListener("click", async () => {
        if (!activeHandshakeTarget) return;
        const code = pinInputs.map((i) => i.value).join("");
        if (code.length < 4) {
          showToast("INCOMPLETE PIN", "Please enter all 4 digits shown on the seller's phone.");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "VERIFYING HANDSHAKE...";

        const result = await MarketAPI.verifyHandshake(
          activeHandshakeTarget.item.id,
          code,
          5,
          selectedFeedbackTag
        );

        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 stroke-[2.5]"></i><span>Confirm Handover & Complete Trade</span>`;
        lucide.createIcons();

        if (result && result.success) {
          showHandshakeCelebration();
          refreshMarket();
        } else {
          showToast("INVALID PIN", result.error || "The entered PIN does not match the seller's code.");
          pinInputs.forEach((i) => {
            i.classList.add("border-rose-500", "animate-pulse");
            setTimeout(() => i.classList.remove("border-rose-500", "animate-pulse"), 1500);
          });
        }
      });
    }

    // Listen for real-time handshake completed event across devices
    if (window.MarketAPI && MarketAPI.on) {
      MarketAPI.on("handshakeCompleted", (payload) => {
        if (activeHandshakeTarget && payload.item_id === activeHandshakeTarget.item.id) {
          showHandshakeCelebration();
          refreshMarket();
        }
      });
    }

    const closeAll = () => {
      modal.classList.add("hidden");
      activeHandshakeTarget = null;
      pinInputs.forEach((i) => {
        if (i) i.value = "";
      });
    };

    if (closeBtn) closeBtn.addEventListener("click", closeAll);
    if (doneBtn) doneBtn.addEventListener("click", closeAll);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAll();
    });

    return {
      open: async (target) => {
        activeHandshakeTarget = target;
        const item = target.item;
        if (titleElem) titleElem.textContent = item.title;

        // Reset views
        if (sellerView) sellerView.classList.add("hidden");
        if (buyerView) buyerView.classList.add("hidden");
        if (successView) successView.classList.add("hidden");
        pinInputs.forEach((i) => {
          if (i) i.value = "";
        });

        modal.classList.remove("hidden");
        lucide.createIcons();

        const status = await MarketAPI.getHandshakeStatus(item.id);
        if (status.is_completed) {
          showHandshakeCelebration();
          return;
        }

        if (status.role === "seller" && status.code) {
          // Seller View: show the 4 digits and QR
          activeHandshakeCode = status.code;
          const digits = String(status.code).split("");
          digits.forEach((d, idx) => {
            const el = document.getElementById(`pin-digit-${idx}`);
            if (el) el.textContent = d;
          });

          if (qrImg) {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(status.code)}&bgcolor=020617&color=00ff9d`;
          }

          if (sellerView) sellerView.classList.remove("hidden");
        } else {
          // Buyer View: enter the 4 digits
          if (buyerView) buyerView.classList.remove("hidden");
          setTimeout(() => {
            if (pinInputs[0]) pinInputs[0].focus();
          }, 200);
        }
      }
    };
  }

  /**
   * Setup Make an Offer Modal (Quick Discount Chips + Custom Keypad)
   */
  function setupMakeOfferModal() {
    const modal = document.getElementById("modal-make-offer");
    const closeBtn = document.getElementById("btn-close-offer-modal");
    const titleElem = document.getElementById("offer-modal-item-title");
    const origPriceElem = document.getElementById("offer-modal-original-price");
    const amountInput = document.getElementById("input-offer-amount");
    const savingsPreview = document.getElementById("offer-savings-preview");
    const savingsAmount = document.getElementById("offer-savings-amount");
    const submitBtn = document.getElementById("btn-submit-offer");
    const chipBtns = modal ? modal.querySelectorAll(".btn-offer-chip") : [];

    if (!modal) return null;

    let currentItem = null;

    function updateSavings() {
      if (!currentItem) return;
      const orig = parseFloat(currentItem.price) || 0;
      const offer = parseFloat(amountInput.value) || 0;
      if (offer > 0 && offer < orig) {
        const saved = orig - offer;
        const pct = Math.round((saved / orig) * 100);
        savingsPreview.classList.remove("hidden");
        savingsAmount.textContent = `Save ₹${saved} (${pct}% off)`;
      } else {
        savingsPreview.classList.add("hidden");
      }
    }

    amountInput.addEventListener("input", updateSavings);

    chipBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!currentItem) return;
        const pct = parseInt(btn.dataset.pct, 10) || 10;
        const orig = parseFloat(currentItem.price) || 0;
        const discounted = Math.max(1, Math.round(orig * (1 - pct / 100)));
        amountInput.value = discounted;
        updateSavings();

        chipBtns.forEach(b => b.className = "btn-offer-chip py-2 rounded-lg bg-slate-900 hover:bg-amber-950/60 border border-slate-700 hover:border-amber-400 text-slate-200 transition cursor-pointer font-bold text-center");
        btn.className = "btn-offer-chip py-2 rounded-lg bg-amber-500 border border-amber-400 text-slate-950 transition cursor-pointer font-bold text-center";
      });
    });

    submitBtn.addEventListener("click", async () => {
      if (!currentItem) return;
      const offerVal = parseFloat(amountInput.value);
      if (!offerVal || offerVal <= 0) {
        showToast("INVALID OFFER", "Please enter a valid offer amount.");
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "TRANSMITTING...";

      const res = await MarketAPI.createOffer(currentItem.id, offerVal);
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Transmit Offer to Seller</span>`;
      lucide.createIcons();

      if (res && res.success) {
        modal.classList.add("hidden");
        showToast("OFFER TRANSMITTED", `Offer of ₹${offerVal} sent to seller!`);
        playHandshakeChime();
      } else {
        showToast("OFFER FAILED", res.error || "Could not transmit offer.");
      }
    });

    const closeAll = () => {
      modal.classList.add("hidden");
      currentItem = null;
      amountInput.value = "";
      savingsPreview.classList.add("hidden");
    };

    if (closeBtn) closeBtn.addEventListener("click", closeAll);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAll();
    });

    return {
      open: (item) => {
        currentItem = item;
        if (titleElem) titleElem.textContent = item.title;
        if (origPriceElem) origPriceElem.textContent = `₹${item.price}`;
        amountInput.value = "";
        savingsPreview.classList.add("hidden");
        chipBtns.forEach(b => b.className = "btn-offer-chip py-2 rounded-lg bg-slate-900 hover:bg-amber-950/60 border border-slate-700 hover:border-amber-400 text-slate-200 transition cursor-pointer font-bold text-center");
        modal.classList.remove("hidden");
        lucide.createIcons();
        setTimeout(() => amountInput.focus(), 150);
      }
    };
  }

  /**
   * Setup Counter Offer Modal
   */
  let activeCounterOfferId = null;

  function setupCounterOfferModal() {
    const modal = document.getElementById("modal-counter-offer");
    const closeBtn = document.getElementById("btn-close-counter-modal");
    const input = document.getElementById("input-counter-amount");
    const submitBtn = document.getElementById("btn-submit-counter");

    if (!modal) return null;

    submitBtn.addEventListener("click", async () => {
      if (!activeCounterOfferId) return;
      const counterVal = parseFloat(input.value);
      if (!counterVal || counterVal <= 0) {
        showToast("INVALID COUNTER", "Please enter a valid counter amount.");
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "TRANSMITTING...";

      const res = await MarketAPI.respondOffer(activeCounterOfferId, "counter", counterVal);
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Transmit Counter Offer</span>`;
      lucide.createIcons();

      if (res && res.success) {
        modal.classList.add("hidden");
        showToast("COUNTER TRANSMITTED", `Counter-offer of ₹${counterVal} sent!`);
      } else {
        showToast("COUNTER FAILED", res.error || "Could not transmit counter-offer.");
      }
    });

    const closeAll = () => {
      modal.classList.add("hidden");
      activeCounterOfferId = null;
      input.value = "";
    };

    if (closeBtn) closeBtn.addEventListener("click", closeAll);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAll();
    });

    return {
      open: (offerId, suggestedPrice = null) => {
        activeCounterOfferId = offerId;
        input.value = suggestedPrice ? String(suggestedPrice) : "";
        modal.classList.remove("hidden");
        lucide.createIcons();
        setTimeout(() => input.focus(), 150);
      }
    };
  }

  /**
   * Setup My Beacons Management Drawer
   */
  async function updateMyBeaconsBadge() {
    if (!window.MarketAPI) return;
    try {
      const badge = document.getElementById("my-beacons-badge");
      const myItems = await MarketAPI.getMyItems();
      if (badge) badge.textContent = myItems.length;
    } catch (e) {}
  }

  function setupMyBeaconsModal() {
    const modal = document.getElementById("modal-my-beacons");
    const openBtn = document.getElementById("btn-open-my-beacons");
    const closeBtn = document.getElementById("btn-close-my-beacons");
    const list = document.getElementById("my-beacons-list");

    if (!openBtn || !modal) return;

    openBtn.addEventListener("click", async () => {
      await renderMyBeacons();
      modal.classList.remove("hidden");
    });

    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    async function renderMyBeacons() {
      list.innerHTML = `<div class="text-center text-slate-500 text-xs py-4 font-mono">Scanning your beacons...</div>`;
      const items = await MarketAPI.getMyItems();
      list.innerHTML = "";

      if (items.length === 0) {
        list.innerHTML = `
          <div class="text-center text-slate-400 py-8 text-xs font-mono">
            <i data-lucide="radio" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
            No active beacons broadcasted from this device yet.
          </div>
        `;
        lucide.createIcons();
        return;
      }

      items.forEach((item) => {
        const isSold = item.status === "sold";
        const isWanted = item.beacon_type === "wanted";

        const card = document.createElement("div");
        card.className = "p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs font-mono";
        card.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0">
            <img src="${item.image || (PRESET_PHOTOS[item.category] || PRESET_PHOTOS.stationery)[0]}" class="w-10 h-10 rounded object-cover border border-slate-700 shrink-0" />
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                  isWanted ? 'bg-pink-950 text-pink-300 border border-pink-500/40' : 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                }">${isWanted ? 'WANTED' : 'SELLING'}</span>
                ${isSold ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-slate-400">SOLD</span>' : ''}
              </div>
              <h4 class="font-bold text-slate-100 truncate">${item.title}</h4>
              <div class="text-emerald-400">₹${item.price}</div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${!isSold ? `
              <button class="btn-mark-sold px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] transition">
                Mark Sold
              </button>
            ` : ''}
            <button class="btn-delete-beacon p-1 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition" title="Delete beacon">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        `;

        if (!isSold) {
          card.querySelector(".btn-mark-sold").addEventListener("click", async () => {
            await MarketAPI.updateItemStatus(item.id, "sold");
            showToast("BEACON UPDATED", `"${item.title}" marked as Sold!`);
            await renderMyBeacons();
            await refreshMarket();
          });
        }

        card.querySelector(".btn-delete-beacon").addEventListener("click", async () => {
          if (confirm(`Remove beacon for "${item.title}"?`)) {
            await MarketAPI.updateItemStatus(item.id, "deleted");
            showToast("BEACON REMOVED", `"${item.title}" deactivated.`);
            await renderMyBeacons();
            await refreshMarket();
          }
        });

        list.appendChild(card);
      });

      updateMyBeaconsBadge();
      lucide.createIcons();
    }
  }

  async function openChatModal(target) {
    if (!target || !target.item) return;
    if (typeof hideCommunicationAlert === "function") hideCommunicationAlert();
    state.unreadInboxCount = 0;
    if (typeof updateInboxBadge === "function") updateInboxBadge();

    const modal = document.getElementById("modal-chat");
    const item = target.item;
    state.activeChatId = item.id;
    state.activeChatAgreedPrice = item.agreed_price || null;

    document.getElementById("chat-seller-avatar").src =
      item.seller?.avatar || item.seller_avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80";
    document.getElementById("chat-seller-name").textContent = item.seller?.name || item.seller_name || "Seller";
    document.getElementById("chat-item-title").textContent = item.title;
    
    const priceDisplay = document.getElementById("chat-item-price");
    if (item.agreed_price && item.agreed_price < item.price) {
      priceDisplay.innerHTML = `<span class="line-through text-slate-500 text-xs mr-1">₹${item.price}</span><span class="text-emerald-400 font-bold">₹${item.agreed_price}</span>`;
    } else {
      priceDisplay.textContent = `₹${item.price}`;
    }

    const landmarkElem = document.getElementById("chat-item-landmark");
    if (landmarkElem) {
      landmarkElem.textContent = item.landmark || "Campus Central";
    }

    // Real-time Geodesic Distance from Buyer (You) to Seller
    const distM = calculateDistanceMeters(
      state.userLocation.lat,
      state.userLocation.lng,
      item.lat,
      item.lng
    );
    const distFormatted = formatDistance(distM);
    const walkTime = estimateWalkingTime(distM);
    const distBadge = document.getElementById("chat-item-distance-badge");
    if (distBadge) {
      const inZone = distM <= 500;
      distBadge.className = inZone
        ? "px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold flex items-center gap-1"
        : "px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold flex items-center gap-1";
      distBadge.innerHTML = `<i data-lucide="navigation" class="w-3 h-3"></i> ${distFormatted} (${walkTime}) ${inZone ? '• &lt;500m' : ''}`;
      if (window.lucide) lucide.createIcons();
    }

    const gmapsBtn = document.getElementById("btn-chat-google-maps");
    if (gmapsBtn) {
      gmapsBtn.onclick = () => {
        openGoogleMapsDirections(item.lat, item.lng, item.landmark);
      };
    }

    const container = document.getElementById("chat-messages-container");
    container.innerHTML = `<div class="text-center text-slate-500 text-xs py-4">Connecting to secure signal...</div>`;
    modal.classList.remove("hidden");

    let messages = [];
    if (window.MarketAPI) {
      messages = await MarketAPI.getChatMessages(item.id);
    }

    container.innerHTML = "";

    if (messages.length === 0) {
      // Default beacon greeting
      messages.push({
        sender_id: item.seller_id || "system",
        sender_name: item.seller?.name || item.seller_name || "Seller",
        text: `Hey! Thanks for pinging my beacon for "${item.title}". I'm around ${item.landmark}. Let me know if you want to inspect it!`
      });
    }

    messages.forEach((msg) => appendMessageBubble(msg));
  }

  function appendMessageBubble(msg) {
    const container = document.getElementById("chat-messages-container");
    if (!container) return;

    const currentDeviceId = window.MarketAPI ? MarketAPI.getDeviceId() : null;
    const isMe = msg.sender_id === currentDeviceId || msg.sender === "me";

    // Check for interactive Meetup Location Pinpoint Card
    const meetupMatch = msg.text && msg.text.match(/^\[MEETUP_POINT:([0-9.-]+),([0-9.-]+),(.*?)\]$/);
    if (meetupMatch) {
      const mLat = parseFloat(meetupMatch[1]);
      const mLng = parseFloat(meetupMatch[2]);
      const mName = meetupMatch[3];
      const distM = calculateDistanceMeters(state.userLocation.lat, state.userLocation.lng, mLat, mLng);
      const walk = estimateWalkingTime(distM);

      const bubble = document.createElement("div");
      bubble.className = `flex flex-col ${isMe ? "items-end" : "items-start"}`;
      bubble.innerHTML = `
        <span class="text-[10px] text-slate-500 font-mono mb-0.5 px-1">${isMe ? 'You' : (msg.sender_name || 'Seller')}</span>
        <div class="chat-meetup-card max-w-[85%] text-slate-100">
          <div class="flex items-center gap-1.5 mb-1 text-cyan-300 font-bold font-mono text-[11px]">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-emerald-400 animate-pulse"></i>
            <span>PROPOSED MEETUP SPOT</span>
          </div>
          <p class="font-bold text-xs text-white mb-0.5">${mName}</p>
          <div class="text-[10px] text-slate-400 font-mono mb-2">
            <span>${formatDistance(distM)} from you</span> • <span class="text-cyan-300 font-bold">${walk}</span>
          </div>
          <button type="button" class="btn-meetup-nav w-full py-1.5 px-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-[10px] flex items-center justify-center gap-1.5 transition shadow cursor-pointer">
            <i data-lucide="map" class="w-3.5 h-3.5"></i>
            <span>OPEN IN GOOGLE MAPS</span>
          </button>
        </div>
      `;
      const navBtn = bubble.querySelector(".btn-meetup-nav");
      if (navBtn) {
        navBtn.onclick = () => openGoogleMapsDirections(mLat, mLng, mName);
      }
      container.appendChild(bubble);
      lucide.createIcons();
      container.scrollTop = container.scrollHeight;
      return;
    }

    // Check for Secure Handshake celebration card
    const handshakeMatch = msg.text && msg.text.match(/^\[HANDSHAKE_VERIFIED:(\d+):(\d+):(.*?)]$/);
    if (handshakeMatch) {
      const code = handshakeMatch[1];
      const rating = parseInt(handshakeMatch[2], 10) || 5;
      const feedback = handshakeMatch[3] || "In-person trade completed!";
      const stars = "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));

      const bubble = document.createElement("div");
      bubble.className = "w-full flex flex-col items-center my-2";
      bubble.innerHTML = `
        <div class="chat-handshake-card w-full max-w-[95%] text-slate-100 font-mono">
          <div class="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-emerald-500/30">
            <div class="flex items-center gap-1.5 text-emerald-300 font-bold text-xs">
              <i data-lucide="award" class="w-4 h-4 text-emerald-400"></i>
              <span>HANDSHAKE VERIFIED</span>
            </div>
            <span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40">PIN ${code}</span>
          </div>
          <div class="text-[11px] text-slate-200 mb-1">
            🤝 In-person item handover confirmed on campus!
          </div>
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <span class="text-amber-300 font-bold">${stars} (${feedback})</span>
            <span class="text-emerald-400 font-bold">+50 Trust Boost</span>
          </div>
        </div>
      `;
      container.appendChild(bubble);
      lucide.createIcons();
      container.scrollTop = container.scrollHeight;
      return;
    }

    // 1. Check for [OFFER:offer_id:amount:original_price:status:buyer_name]
    const offerMatch = msg.text && msg.text.match(/^\[OFFER:([^:]+):([0-9.]+):([0-9.]+):([^:]+):(.*?)\]$/);
    if (offerMatch) {
      const offerId = offerMatch[1];
      const amount = parseFloat(offerMatch[2]);
      const origPrice = parseFloat(offerMatch[3]);
      const status = offerMatch[4];
      const buyerName = offerMatch[5] || "Student";
      const savings = Math.max(0, origPrice - amount);
      const pct = Math.round((savings / origPrice) * 100);

      const bubble = document.createElement("div");
      bubble.className = "w-full flex flex-col items-center my-2 font-mono";
      bubble.innerHTML = `
        <div class="chat-offer-card chat-offer-pending w-full max-w-[95%] text-slate-100">
          <div class="flex items-center justify-between gap-2 pb-1 mb-1.5 border-b border-amber-500/30 text-xs">
            <div class="flex items-center gap-1.5 text-amber-400 font-bold">
              <i data-lucide="tag" class="w-4 h-4"></i>
              <span>PRICE OFFER PROPOSED</span>
            </div>
            <span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/40">PENDING</span>
          </div>
          <div class="flex items-baseline justify-between mb-1">
            <div>
              <span class="text-sm font-bold text-white">₹${amount}</span>
              <span class="line-through text-xs text-slate-500 ml-1.5">₹${origPrice}</span>
            </div>
            <span class="text-[11px] text-emerald-400 font-bold">⚡ Save ₹${savings} (${pct}%)</span>
          </div>
          <div class="text-[11px] text-slate-400 mb-2">
            Proposed by <strong class="text-slate-200">${buyerName}</strong>
          </div>
          <div class="offer-actions flex items-center gap-1.5 pt-1 border-t border-slate-800">
            ${isMe ? `
              <span class="text-[11px] text-amber-300/80 italic flex items-center gap-1">
                <i data-lucide="clock" class="w-3.5 h-3.5 animate-spin"></i> Awaiting seller response...
              </span>
            ` : `
              <button type="button" class="btn-offer-accept flex-1 py-1.5 px-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
                <i data-lucide="check" class="w-3.5 h-3.5"></i> Accept ₹${amount}
              </button>
              <button type="button" class="btn-offer-counter py-1.5 px-2.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-400 text-cyan-300 font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Counter
              </button>
              <button type="button" class="btn-offer-decline py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-400 text-slate-400 hover:text-rose-300 font-bold text-[11px] transition cursor-pointer">
                ✕
              </button>
            `}
          </div>
        </div>
      `;

      const acceptBtn = bubble.querySelector(".btn-offer-accept");
      if (acceptBtn) {
        acceptBtn.addEventListener("click", async () => {
          acceptBtn.disabled = true;
          acceptBtn.textContent = "ACCEPTING...";
          const res = await MarketAPI.respondOffer(offerId, "accept");
          if (res && res.success) {
            state.activeChatAgreedPrice = amount;
            playHandshakeChime();
            showToast("OFFER ACCEPTED", `Deal agreed at ₹${amount}! UPI QR updated.`);
          }
        });
      }

      const counterBtn = bubble.querySelector(".btn-offer-counter");
      if (counterBtn) {
        counterBtn.addEventListener("click", () => {
          if (!counterOfferModal) counterOfferModal = setupCounterOfferModal();
          if (counterOfferModal) counterOfferModal.open(offerId, Math.round((origPrice + amount) / 2));
        });
      }

      const declineBtn = bubble.querySelector(".btn-offer-decline");
      if (declineBtn) {
        declineBtn.addEventListener("click", async () => {
          if (confirm("Decline this offer?")) {
            await MarketAPI.respondOffer(offerId, "decline");
          }
        });
      }

      container.appendChild(bubble);
      lucide.createIcons();
      container.scrollTop = container.scrollHeight;
      return;
    }

    // 2. Check for [OFFER_ACCEPTED:offer_id:agreed_amount]
    const acceptMatch = msg.text && msg.text.match(/^\[OFFER_ACCEPTED:([^:]+):([0-9.]+)\]$/);
    if (acceptMatch) {
      const agreedAmount = parseFloat(acceptMatch[2]);
      state.activeChatAgreedPrice = agreedAmount;

      const bubble = document.createElement("div");
      bubble.className = "w-full flex flex-col items-center my-2 font-mono";
      bubble.innerHTML = `
        <div class="chat-offer-card chat-offer-accepted w-full max-w-[95%] text-slate-100">
          <div class="flex items-center justify-between gap-2 pb-1 mb-1.5 border-b border-emerald-500/30 text-xs">
            <div class="flex items-center gap-1.5 text-emerald-400 font-bold">
              <i data-lucide="check-circle-2" class="w-4 h-4"></i>
              <span>OFFER ACCEPTED!</span>
            </div>
            <span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold">DEAL AGREED</span>
          </div>
          <div class="text-xs text-slate-200 mb-2">
            🤝 Price agreed at <strong class="text-emerald-300 text-sm font-bold">₹${agreedAmount}</strong>!
          </div>
          <button type="button" class="btn-card-pay-upi w-full py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-[0_0_15px_rgba(0,255,157,0.3)]">
            <i data-lucide="qr-code" class="w-4 h-4"></i>
            <span>Scan & Pay Negotiated ₹${agreedAmount} via UPI</span>
          </button>
        </div>
      `;
      const payBtn = bubble.querySelector(".btn-card-pay-upi");
      if (payBtn) {
        payBtn.addEventListener("click", () => {
          const upiBtn = document.getElementById("btn-open-upi-pay");
          if (upiBtn) upiBtn.click();
        });
      }
      container.appendChild(bubble);
      lucide.createIcons();
      container.scrollTop = container.scrollHeight;
      return;
    }

    // 3. Check for [OFFER_COUNTERED:offer_id:counter_amount]
    const counterMatch = msg.text && msg.text.match(/^\[OFFER_COUNTERED:([^:]+):([0-9.]+)\]$/);
    if (counterMatch) {
      const offerId = counterMatch[1];
      const counterAmount = parseFloat(counterMatch[2]);

      const bubble = document.createElement("div");
      bubble.className = "w-full flex flex-col items-center my-2 font-mono";
      bubble.innerHTML = `
        <div class="chat-offer-card chat-offer-countered w-full max-w-[95%] text-slate-100">
          <div class="flex items-center justify-between gap-2 pb-1 mb-1.5 border-b border-cyan-500/30 text-xs">
            <div class="flex items-center gap-1.5 text-cyan-300 font-bold">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              <span>COUNTER-OFFER PROPOSED</span>
            </div>
            <span class="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40">COUNTER</span>
          </div>
          <div class="text-xs text-slate-200 mb-2">
            Alternative price proposed: <strong class="text-cyan-300 text-sm font-bold">₹${counterAmount}</strong>
          </div>
          <div class="flex items-center gap-2 pt-1 border-t border-slate-800">
            ${isMe ? `
              <span class="text-[11px] text-cyan-300/80 italic flex items-center gap-1">
                <i data-lucide="clock" class="w-3.5 h-3.5"></i> Awaiting response...
              </span>
            ` : `
              <button type="button" class="btn-counter-accept flex-1 py-1.5 px-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
                <i data-lucide="check" class="w-3.5 h-3.5"></i> Accept ₹${counterAmount}
              </button>
              <button type="button" class="btn-counter-decline py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-400 text-slate-400 hover:text-rose-300 font-bold text-[11px] transition cursor-pointer">
                ✕ Decline
              </button>
            `}
          </div>
        </div>
      `;
      const acceptBtn = bubble.querySelector(".btn-counter-accept");
      if (acceptBtn) {
        acceptBtn.addEventListener("click", async () => {
          acceptBtn.disabled = true;
          acceptBtn.textContent = "ACCEPTING...";
          const res = await MarketAPI.respondOffer(offerId, "accept");
          if (res && res.success) {
            state.activeChatAgreedPrice = counterAmount;
            playHandshakeChime();
            showToast("COUNTER ACCEPTED", `Deal agreed at ₹${counterAmount}! UPI QR updated.`);
          }
        });
      }
      const declineBtn = bubble.querySelector(".btn-counter-decline");
      if (declineBtn) {
        declineBtn.addEventListener("click", async () => {
          await MarketAPI.respondOffer(offerId, "decline");
        });
      }
      container.appendChild(bubble);
      lucide.createIcons();
      container.scrollTop = container.scrollHeight;
      return;
    }

    // 4. Check for [OFFER_DECLINED:offer_id:amount]
    const declineMatch = msg.text && msg.text.match(/^\[OFFER_DECLINED:([^:]+):([0-9.]+)\]$/);
    if (declineMatch) {
      const decAmount = parseFloat(declineMatch[2]);
      const bubble = document.createElement("div");
      bubble.className = "w-full flex flex-col items-center my-2 font-mono";
      bubble.innerHTML = `
        <div class="chat-offer-card chat-offer-declined w-full max-w-[95%] text-slate-100">
          <div class="flex items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-1.5 text-rose-400 font-bold">
              <i data-lucide="x-circle" class="w-4 h-4"></i>
              <span>Offer of ₹${decAmount} was declined</span>
            </div>
            <span class="text-[9px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-500/40">DECLINED</span>
          </div>
        </div>
      `;
      container.appendChild(bubble);
      lucide.createIcons();
      container.scrollTop = container.scrollHeight;
      return;
    }

    // 5. Check for [BOUNTY_MATCH:responder_id:responder_name]
    const bountyMatchRx = msg.text && msg.text.match(/^\[BOUNTY_MATCH:([^:]+):(.*?)\]$/);
    if (bountyMatchRx) {
      const responderName = bountyMatchRx[2] || "Campus Student";
      const bubble = document.createElement("div");
      bubble.className = "w-full flex flex-col items-center my-2 font-mono";
      bubble.innerHTML = `
        <div class="bounty-card w-full max-w-[95%] text-slate-100">
          <div class="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-pink-500/30 text-xs">
            <div class="flex items-center gap-1.5 text-pink-300 font-bold">
              <i data-lucide="check-circle-2" class="w-4 h-4 text-pink-400"></i>
              <span>BOUNTY MATCH!</span>
            </div>
            <span class="text-[9px] px-1.5 py-0.2 rounded bg-pink-950 text-pink-300 border border-pink-500/40 font-bold">SELLER FOUND</span>
          </div>
          <div class="text-[11px] text-slate-200">
            🎯 <strong class="text-pink-200">${responderName}</strong> says they have this item and is ready to sell!
          </div>
          <div class="mt-2 text-[10px] text-slate-400">Reply in chat to arrange a campus meetup.</div>
        </div>
      `;
      container.appendChild(bubble);
      lucide.createIcons();
      container.scrollTop = container.scrollHeight;
      return;
    }

    const bubble = document.createElement("div");
    bubble.className = `flex flex-col ${isMe ? "items-end" : "items-start"}`;
    bubble.innerHTML = `
      <span class="text-[10px] text-slate-500 font-mono mb-0.5 px-1">${isMe ? 'You' : (msg.sender_name || 'Seller')}</span>
      <div class="max-w-[80%] rounded-xl px-3.5 py-2 ${
        isMe
          ? "bg-cyan-500 text-slate-950 font-medium rounded-br-xs"
          : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-xs"
      }">
        <p class="leading-relaxed text-xs">${msg.text}</p>
      </div>
    `;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  async function sendChatMessage(text) {
    if (!state.selectedTarget) return;
    const item = state.selectedTarget.item;

    if (window.MarketAPI) {
      const msg = await MarketAPI.sendChatMessage(item.id, text);
      appendMessageBubble(msg);
    } else {
      appendMessageBubble({ sender: "me", text });
    }
  }

  /**
   * Update the Bounty Board badge with count of active wanted requests
   */
  function updateBountyBadge() {
    const bounties = state.rawItems.filter(it => it.beacon_type === "wanted" && it.status !== "sold");
    const badge = document.getElementById("bounty-board-badge");
    if (!badge) return;
    if (bounties.length > 0) {
      badge.textContent = bounties.length;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  /**
   * Setup Campus Bounty Board Modal
   */
  function setupBountyBoardModal() {
    const modal = document.getElementById("modal-bounty-board");
    const closeBtn = document.getElementById("btn-close-bounty-board");
    const openBtn = document.getElementById("btn-open-bounty-board");
    const listContainer = document.getElementById("bounty-list-container");
    const emptyState = document.getElementById("bounty-empty-state");
    const countDisplay = document.getElementById("bounty-count-display");
    const postWantedBtn = document.getElementById("btn-bounty-post-wanted");

    if (!modal) return;

    function renderBounties() {
      const bounties = state.rawItems.filter(it => it.beacon_type === "wanted" && it.status !== "sold");
      if (countDisplay) countDisplay.textContent = bounties.length;

      // Remove existing bounty cards (not the empty state)
      const existingCards = listContainer.querySelectorAll(".bounty-card-wrapper");
      existingCards.forEach(c => c.remove());

      if (bounties.length === 0) {
        if (emptyState) emptyState.classList.remove("hidden");
        return;
      }
      if (emptyState) emptyState.classList.add("hidden");

      const now = Date.now() / 1000;
      const currentDeviceId = window.MarketAPI ? MarketAPI.getDeviceId() : null;

      bounties.forEach((item) => {
        const isUrgent = (now - (item.created_at || now)) < 1800; // within 30 mins
        const ageSeconds = now - (item.created_at || now);
        let ageStr;
        if (ageSeconds < 60) ageStr = "just now";
        else if (ageSeconds < 3600) ageStr = `${Math.floor(ageSeconds / 60)}m ago`;
        else if (ageSeconds < 86400) ageStr = `${Math.floor(ageSeconds / 3600)}h ago`;
        else ageStr = `${Math.floor(ageSeconds / 86400)}d ago`;

        const isMyBounty = item.seller_id === currentDeviceId;

        const wrapper = document.createElement("div");
        wrapper.className = "bounty-card-wrapper";
        wrapper.innerHTML = `
          <div class="bounty-card">
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  ${isUrgent ? '<span class="bounty-urgent-badge">🔥 URGENT</span>' : ''}
                  <span class="text-[10px] font-mono text-slate-500">${ageStr}</span>
                </div>
                <h4 class="font-bold text-sm text-white leading-snug line-clamp-2">${item.title}</h4>
              </div>
              <div class="text-right shrink-0 font-mono">
                <div class="text-xs text-pink-300 font-bold">Max Budget</div>
                <div class="text-base font-black text-emerald-400">₹${item.price}</div>
              </div>
            </div>
            <div class="text-[11px] text-slate-400 mb-2.5 line-clamp-2">${item.description || "No description provided."}</div>
            <div class="flex items-center justify-between gap-2 pt-2 border-t border-pink-500/20">
              <div class="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                <span class="text-slate-400 font-semibold">${item.seller_name || "Student"}</span>
                • <span class="text-pink-400/80">${item.landmark || "Campus"}</span>
              </div>
              ${isMyBounty
                ? '<span class="text-[10px] font-mono text-amber-400 px-2 py-1 rounded bg-amber-950/50 border border-amber-500/30">YOUR BOUNTY</span>'
                : `<button type="button" class="btn-bounty-match py-1.5 px-3 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold font-mono text-[11px] flex items-center gap-1.5 transition shadow-[0_0_10px_rgba(255,0,119,0.3)] cursor-pointer" data-item-id="${item.id}" data-title="${item.title.replace(/"/g, '&quot;')}">
                  <i data-lucide="zap" class="w-3.5 h-3.5"></i> I HAVE THIS!
                </button>`
              }
            </div>
          </div>
        `;
        listContainer.appendChild(wrapper);
      });

      // Wire "I HAVE THIS!" buttons
      listContainer.querySelectorAll(".btn-bounty-match").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const itemId = btn.dataset.itemId;
          const itemTitle = btn.dataset.title || "Item";
          btn.disabled = true;
          btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Signaling...`;
          lucide.createIcons();

          const res = await MarketAPI.matchBounty(itemId);
          if (res && res.success) {
            btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> Signaled!`;
            lucide.createIcons();
            showToast("BOUNTY SIGNAL SENT", `You signalled that you have "${itemTitle}". The buyer will chat you!`);
            // Open chat for the bounty item
            const target = state.evaluatedItems.find(t => t.item.id === itemId);
            if (target) {
              modal.classList.add("hidden");
              setTimeout(() => openChatModal(target), 300);
            }
          } else {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="zap" class="w-3.5 h-3.5"></i> I HAVE THIS!`;
            lucide.createIcons();
            showToast("SIGNAL FAILED", res.error || "Could not signal bounty.");
          }
        });
      });

      lucide.createIcons();
    }

    if (openBtn) {
      openBtn.addEventListener("click", () => {
        renderBounties();
        modal.classList.remove("hidden");
        lucide.createIcons();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    }
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    if (postWantedBtn) {
      postWantedBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
        const sellBtn = document.getElementById("btn-open-sell-modal");
        if (sellBtn) {
          sellBtn.click();
          // Pre-select the "Wanted" radio after modal opens
          setTimeout(() => {
            const wantedRadio = document.querySelector('input[name="sell-beacon-type"][value="wanted"]');
            if (wantedRadio) {
              wantedRadio.checked = true;
              wantedRadio.dispatchEvent(new Event("change"));
            }
          }, 300);
        }
      });
    }
  }

  /**
   * Real-Time Toast Notification Popup
   */
  let toastTimer = null;
  function showToast(title, desc) {
    const toast = document.getElementById("radar-toast");
    const toastTitle = document.getElementById("toast-title");
    const toastDesc = document.getElementById("toast-desc");
    const closeBtn = document.getElementById("btn-close-toast");

    if (!toast) return;

    toastTitle.textContent = title;
    toastDesc.textContent = desc;

    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.remove("translate-y-2", "opacity-0");
      toast.classList.add("translate-y-0", "opacity-100");
    }, 20);

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4000);

    closeBtn.onclick = hideToast;
  }

  function hideToast() {
    const toast = document.getElementById("radar-toast");
    if (!toast) return;
    toast.classList.remove("translate-y-0", "opacity-100");
    toast.classList.add("translate-y-2", "opacity-0");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }

  /**
   * Cross-Device Real-Time Communication Alert System
   * Synthesizes audio chime, displays interactive toast alert, updates header inbox badge,
   * and triggers background push notifications.
   */
  let commToastTimeout = null;
  let chatAudioCtx = null;

  function getChatAudioContext() {
    if (!chatAudioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        chatAudioCtx = new AudioContextClass();
      }
    }
    if (chatAudioCtx && chatAudioCtx.state === "suspended") {
      chatAudioCtx.resume().catch(() => {});
    }
    return chatAudioCtx;
  }

  function playChatAlertSound(isSoft = false) {
    try {
      const ctx = getChatAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      if (isSoft) {
        // Subtle soft blip for open active conversation
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(987.77, now); // B5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } else {
        // Dynamic dual-tone high-tech notification chime (880Hz -> 1318.5Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, now); // A5
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.14);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(1318.5, now + 0.08); // E6
        gain2.gain.setValueAtTime(0.25, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.32);
      }
    } catch (e) {
      console.warn("Sound chime playback skipped:", e);
    }
  }

  function sendSystemPushNotification(title, body, itemId) {
    if (!("Notification" in window)) return;
    try {
      if (Notification.permission === "granted") {
        const notif = new Notification(title, {
          body: body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: itemId ? `radar-chat-${itemId}` : "radar-comm",
          renotify: true
        });
        notif.onclick = () => {
          try {
            window.focus();
            if (itemId) openChatForItemId(itemId);
            notif.close();
          } catch (e) {}
        };
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().catch(() => {});
      }
    } catch (e) {
      console.warn("Push notification failed:", e);
    }
  }

  function formatMessageForAlert(text) {
    if (!text) return "Sent a signal.";
    if (text.startsWith("[OFFER:")) {
      const amt = text.replace("[OFFER:", "").replace("]", "");
      return `💰 Made an offer of ₹${amt}`;
    }
    if (text.startsWith("[OFFER_ACCEPTED:")) {
      const amt = text.replace("[OFFER_ACCEPTED:", "").replace("]", "");
      return `🎉 Accepted offer of ₹${amt}!`;
    }
    if (text.startsWith("[OFFER_COUNTERED:")) {
      const amt = text.replace("[OFFER_COUNTERED:", "").replace("]", "");
      return `🤝 Counter offer sent: ₹${amt}`;
    }
    if (text.startsWith("[OFFER_DECLINED]")) {
      return `❌ Offer declined.`;
    }
    if (text.startsWith("[MEETUP_POINT:")) {
      const parts = text.slice(14, -1).split(",");
      const place = parts[2] || "Campus Spot";
      return `📍 Proposed meetup spot: ${place}`;
    }
    if (text.startsWith("[BOUNTY_MATCH:")) {
      const name = text.replace("[BOUNTY_MATCH:", "").replace("]", "");
      return `🎯 Bounty matched by ${name}!`;
    }
    if (text.startsWith("[HANDSHAKE_VERIFIED]")) {
      return `🤝 Handshake completed & verified!`;
    }
    return text;
  }

  function showCommunicationAlert({ type = "message", senderName, senderAvatar, itemTitle, messageText, itemId }) {
    const toast = document.getElementById("comm-alert-toast");
    if (!toast) return;

    // Track unread signals & target item
    state.unreadInboxCount = (state.unreadInboxCount || 0) + 1;
    state.latestAlertItemId = itemId;
    updateInboxBadge();

    // Play synthesized two-tone chime
    playChatAlertSound(false);

    // Audio/Visual feedback on radar sweep if radar is active
    if (radarEngine && typeof radarEngine.triggerActiveSonarSweep === "function") {
      radarEngine.triggerActiveSonarSweep();
    }

    // Set UI contents
    const avatarEl = document.getElementById("comm-alert-avatar");
    if (avatarEl) {
      if (senderAvatar) {
        avatarEl.innerHTML = `<img src="${senderAvatar}" alt="" class="w-full h-full object-cover rounded-full">`;
      } else {
        avatarEl.innerHTML = type === "offer" || type === "counter" || type === "accepted" ? "💰" : "💬";
      }
    }

    const senderEl = document.getElementById("comm-alert-sender");
    if (senderEl) {
      senderEl.textContent = senderName || "Campus User";
    }

    const badgeEl = document.getElementById("comm-alert-badge");
    if (badgeEl) {
      if (type === "offer") {
        badgeEl.textContent = "NEW OFFER";
        badgeEl.className = "text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-500/40 font-bold uppercase";
      } else if (type === "counter") {
        badgeEl.textContent = "COUNTER OFFER";
        badgeEl.className = "text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-400 border border-purple-500/40 font-bold uppercase";
      } else if (type === "accepted") {
        badgeEl.textContent = "OFFER ACCEPTED";
        badgeEl.className = "text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40 font-bold uppercase";
      } else {
        badgeEl.textContent = "NEW SIGNAL";
        badgeEl.className = "text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/40 font-bold uppercase";
      }
    }

    const itemEl = document.getElementById("comm-alert-item");
    if (itemEl) {
      itemEl.textContent = itemTitle ? `Regarding: ${itemTitle}` : "Regarding beacon";
    }

    const msgEl = document.getElementById("comm-alert-message");
    if (msgEl) {
      msgEl.textContent = messageText || "New communication received.";
    }

    // Push notification for background tab
    const pushTitle = `📡 ${senderName || "New Signal"}: ${itemTitle || "Item"}`;
    sendSystemPushNotification(pushTitle, messageText, itemId);

    // Show toast with slide-in animation
    toast.classList.remove("hidden");
    void toast.offsetHeight;
    toast.classList.remove("opacity-0", "-translate-y-2");
    toast.classList.add("opacity-100", "translate-y-0");

    if (commToastTimeout) clearTimeout(commToastTimeout);
    commToastTimeout = setTimeout(() => {
      hideCommunicationAlert();
    }, 8000);
  }

  function hideCommunicationAlert() {
    const toast = document.getElementById("comm-alert-toast");
    if (!toast) return;
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "-translate-y-2");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 300);
  }

  function updateInboxBadge() {
    const badge = document.getElementById("header-inbox-badge");
    if (!badge) return;
    const count = state.unreadInboxCount || 0;
    if (count > 0) {
      badge.textContent = count > 9 ? "9+" : count;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  async function openChatForItemId(itemId) {
    if (!itemId) return;
    hideCommunicationAlert();
    state.unreadInboxCount = 0;
    updateInboxBadge();

    let target = state.evaluatedItems && state.evaluatedItems.find(t => t.item && t.item.id === itemId);
    if (!target && state.rawItems) {
      const raw = state.rawItems.find(i => i.id === itemId);
      if (raw) target = { item: raw };
    }
    if (!target && window.MarketAPI) {
      try {
        const item = await MarketAPI.getItem(itemId);
        if (item) target = { item };
      } catch (e) {}
    }
    if (!target) {
      target = {
        item: {
          id: itemId,
          title: "Campus Listing",
          price: 0,
          lat: state.userLocation.lat,
          lng: state.userLocation.lng
        }
      };
    }
    openChatModal(target);
  }

  function setupCommunicationAlerts() {
    const inboxBtn = document.getElementById("btn-header-inbox");
    if (inboxBtn) {
      inboxBtn.addEventListener("click", () => {
        if (state.latestAlertItemId) {
          openChatForItemId(state.latestAlertItemId);
        } else if (state.rawItems && state.rawItems.length > 0) {
          openChatForItemId(state.rawItems[0].id);
        } else {
          showToast("MESSAGES INBOX", "No active communications yet. Tap any beacon on radar to start a chat!");
        }
      });
    }

    const closeToastBtn = document.getElementById("btn-close-comm-toast");
    if (closeToastBtn) {
      closeToastBtn.addEventListener("click", () => {
        hideCommunicationAlert();
      });
    }

    const replyBtn = document.getElementById("btn-comm-alert-reply");
    if (replyBtn) {
      replyBtn.addEventListener("click", () => {
        const itemId = state.latestAlertItemId;
        hideCommunicationAlert();
        if (itemId) {
          openChatForItemId(itemId);
        }
      });
    }

    // Opportunistically request notification permission on first user tap
    document.addEventListener("click", () => {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }, { once: true });
  }

  /**
   * Setup Progressive Web App (PWA) Service Worker & Install Prompt
   */
  let deferredPrompt = null;
  function setupPWA() {
    // 1. Register Service Worker with proactive update check
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js?v=3.8.2")
          .then((reg) => {
            console.log("[PWA] Service Worker registered with scope:", reg.scope);
            // Force active update check on every load
            if (reg.update) reg.update();
            reg.onupdatefound = () => {
              const installingWorker = reg.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                    console.log("[PWA] New version installed; refreshing for Google Maps.");
                    window.location.reload();
                  }
                };
              }
            };
          })
          .catch((err) => {
            console.warn("[PWA] Service Worker registration failed:", err);
          });
      });
    }

    const headerInstallBtn = document.getElementById("btn-pwa-install");
    const mobileBanner = document.getElementById("pwa-install-banner");
    const bannerInstallBtn = document.getElementById("btn-pwa-banner-install");
    const bannerDismissBtn = document.getElementById("btn-pwa-banner-dismiss");

    // Check if already running in standalone PWA mode
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (isStandalone) {
      console.log("[PWA] Running in standalone mode");
      if (headerInstallBtn) headerInstallBtn.classList.add("hidden");
      if (mobileBanner) mobileBanner.classList.add("hidden");
      return;
    }

    // Capture beforeinstallprompt event
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      console.log("[PWA] beforeinstallprompt event captured");

      // Show header install button
      if (headerInstallBtn) {
        headerInstallBtn.classList.remove("hidden");
      }

      // Check if user dismissed banner recently
      const dismissedAt = localStorage.getItem("pwa_dismissed_at");
      const oneDay = 24 * 60 * 60 * 1000;
      if (!dismissedAt || Date.now() - parseInt(dismissedAt, 10) > oneDay) {
        setTimeout(() => {
          if (mobileBanner && deferredPrompt) {
            mobileBanner.classList.remove("hidden");
            if (window.lucide) lucide.createIcons();
          }
        }, 2500);
      }
    });

    // Install trigger helper
    async function triggerInstall() {
      if (!deferredPrompt) {
        showToast("INSTALL PWA", "Tap your browser menu (⋮ or Share) and select 'Add to Home screen'.");
        return;
      }

      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log("[PWA] User install choice:", outcome);
      if (outcome === "accepted") {
        showToast("INSTALLING APP", "Adding RadarMarket to your home screen...");
      }
      deferredPrompt = null;
      if (headerInstallBtn) headerInstallBtn.classList.add("hidden");
      if (mobileBanner) mobileBanner.classList.add("hidden");
    }

    if (headerInstallBtn) headerInstallBtn.addEventListener("click", triggerInstall);
    if (bannerInstallBtn) bannerInstallBtn.addEventListener("click", triggerInstall);

    if (bannerDismissBtn) {
      bannerDismissBtn.addEventListener("click", () => {
        if (mobileBanner) mobileBanner.classList.add("hidden");
        localStorage.setItem("pwa_dismissed_at", Date.now().toString());
      });
    }

    // App installed event
    window.addEventListener("appinstalled", () => {
      console.log("[PWA] RadarMarket installed successfully!");
      showToast("APP INSTALLED", "RadarMarket is now installed on your device!");
      deferredPrompt = null;
      if (headerInstallBtn) headerInstallBtn.classList.add("hidden");
      if (mobileBanner) mobileBanner.classList.add("hidden");
    });
  }
})();

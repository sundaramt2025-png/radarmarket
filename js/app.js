/**
 * RadarMarket - Main Application Controller (Production Multi-User Enabled)
 */

(function () {
  // Application State
  const state = {
    userLocation: { ...MarketData.DEFAULT_USER_LOCATION },
    maxRadiusMeters: 1500,
    selectedCategory: "all",
    searchQuery: "",
    currentView: "radar", // "radar" | "grid"
    gridSortBy: "algo",
    rawItems: [],
    evaluatedItems: [],
    filteredItems: [],
    selectedTarget: null,
    audioEnabled: false,
    activeChatId: null,
    chatMessagesCache: new Map() // itemId -> Array
  };

  let radarEngine = null;

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
    ]
  };

  /**
   * Initialize App on DOM ready
   */
  document.addEventListener("DOMContentLoaded", async () => {
    initRadarEngine();
    setupEventListeners();

    // 1. Initialize user profile & network
    if (window.MarketAPI) {
      const user = await MarketAPI.initUser();
      updateProfileUI(user);
      setupSyncListeners();
      MarketAPI.startSyncLoop(1500);
    }

    // 2. Initial market load
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
      state.rawItems = items;
      recalculateAndRender();
    });

    // When a new radar beacon is broadcasted by someone else on the network
    MarketAPI.on("newItemBroadcast", (events) => {
      try {
        const first = events[0];
        const payload = typeof first.payload === "string" ? JSON.parse(first.payload) : first.payload;
        showToast("RADAR BEACON DETECTED", `New listing: "${payload.title || 'Item'}" was just broadcasted!`);
        if (state.audioEnabled && radarEngine) {
          radarEngine.playSonarPing(1100, 0.1);
        }
      } catch (e) {}
    });

    // When an incoming chat message arrives
    MarketAPI.on("newChatMessage", (msg) => {
      if (state.activeChatId === msg.item_id) {
        appendMessageBubble(msg);
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

    // 3. Filter by category & search query
    state.filteredItems = state.evaluatedItems.filter((entry) => {
      // Category match
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
    if (state.currentView === "grid") {
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
    document.getElementById("hud-target-count").textContent = inRangeCount;
    document.getElementById("feed-count").textContent = state.filteredItems.length;
    document.getElementById("hud-location-text").textContent = state.userLocation.name;
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
   * Render Spotlight Target Card in Radar View
   */
  function renderTargetSpotlight(target) {
    const panel = document.getElementById("selected-target-panel");
    if (!target) {
      panel.classList.add("opacity-50");
      document.getElementById("target-title").textContent = "No target acquired in this sector";
      document.getElementById("target-algo-score").textContent = "--";
      document.getElementById("target-signal-tier").textContent = "SIGNAL: LOST";
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
    } else {
      catBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase badge-book";
      catBadge.textContent = "📖 " + (item.sub_category || item.subCategory || "Book");
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

    document.getElementById("target-image").src = item.image || PRESET_PHOTOS[item.category][0];
    document.getElementById("target-distance").textContent = target.distanceFormatted;
    
    const walkingElem = document.getElementById("target-walking-time");
    if (walkingElem) {
      walkingElem.textContent = target.walkingTime || "walking dist";
    }

    document.getElementById("target-bearing").textContent = `${target.bearingFormatted} (Azimuth)`;
    document.getElementById("target-landmark").textContent = item.landmark;

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
   * Render Sidebar Live Nearby Feed
   */
  function renderNearbyFeed() {
    const list = document.getElementById("radar-feed-list");
    list.innerHTML = "";

    if (state.filteredItems.length === 0) {
      list.innerHTML = `
        <div class="py-8 text-center text-slate-500 text-xs font-mono">
          <i data-lucide="scan" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
          No items detected matching your scan filters.
        </div>
      `;
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

      itemCard.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="relative shrink-0 cursor-zoom-in feed-img-container" title="Click to inspect photo">
            <img src="${item.image || PRESET_PHOTOS[item.category][0]}" alt="${item.title}" class="w-10 h-10 rounded-md object-cover border border-slate-700 hover:border-cyan-400 bg-slate-950 transition" />
            <span class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-950 ${
              item.category === 'stationery' ? 'bg-[#00ff9d]' : 'bg-[#00e5ff]'
            }"></span>
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-bold text-slate-200 truncate ${isSelected ? 'text-cyan-300' : ''}">${item.title}</h4>
            <div class="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 mt-0.5">
              <span class="px-1.5 py-0.2 rounded font-bold ${target.proximityTier?.bgClass || 'bg-cyan-950 text-cyan-300'}">${target.distanceFormatted}</span>
              <span class="text-emerald-400 font-semibold">• ${target.walkingTime}</span>
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
            window.openPhotoLightbox(item.image || PRESET_PHOTOS[item.category][0], item.title, item.condition || "Authentic Photo");
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
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-slate-400 font-mono">
          <i data-lucide="package-x" class="w-12 h-12 mx-auto mb-3 opacity-40"></i>
          <p class="text-sm">No items found matching your filter criteria.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    state.filteredItems.forEach((target) => {
      const item = target.item;
      const origPrice = item.original_price || item.originalPrice;

      const card = document.createElement("div");
      card.className = "glass-panel glass-panel-hover p-4 flex flex-col justify-between relative overflow-hidden group";

      card.innerHTML = `
        <div>
          <!-- Top Media & Badges -->
          <div class="relative w-full aspect-video rounded-lg overflow-hidden mb-3 bg-slate-950 border border-slate-800 cursor-zoom-in catalog-image-trigger group/img" title="Click to inspect photo in high resolution">
            <img 
              src="${item.image || PRESET_PHOTOS[item.category][0]}" 
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
                item.beacon_type === 'wanted' ? 'bg-pink-950 text-pink-300 border border-pink-500/40' : item.category === 'stationery' ? 'badge-stationery' : 'badge-book'
              }">
                ${item.beacon_type === 'wanted' ? '🚨 Wanted' : item.category === 'stationery' ? '✏️ Stationery' : '📖 Book'}
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
            window.openPhotoLightbox(item.image || PRESET_PHOTOS[item.category][0], item.title, item.condition || "Authentic Photo");
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
    document.getElementById("tip-distance").textContent = target.distanceFormatted;
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
    // 1. Radar Range Slider
    const rangeSlider = document.getElementById("range-slider");
    const rangeDisplay = document.getElementById("range-value-display");

    rangeSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      state.maxRadiusMeters = val;
      rangeDisplay.textContent = val >= 1000 ? `${(val / 1000).toFixed(1)} km` : `${val} m`;
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
          b.className = "filter-category-btn px-3 py-1.5 rounded-md text-slate-400 hover:text-slate-200 transition";
        });
        btn.className = "filter-category-btn px-3 py-1.5 rounded-md text-cyan-400 bg-cyan-950/80 border border-cyan-500/30 transition";
        state.selectedCategory = btn.dataset.category;
        recalculateAndRender();
      });
    });

    // 3. Search Input
    const searchInput = document.getElementById("search-input");
    const searchClearBtn = document.getElementById("search-clear-btn");

    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      if (state.searchQuery.length > 0) {
        searchClearBtn.classList.remove("hidden");
      } else {
        searchClearBtn.classList.add("hidden");
      }
      recalculateAndRender();
    });

    searchClearBtn.addEventListener("click", () => {
      searchInput.value = "";
      state.searchQuery = "";
      searchClearBtn.classList.add("hidden");
      recalculateAndRender();
    });

    // 4. View Mode Switcher
    const radarBtn = document.getElementById("view-radar-btn");
    const gridBtn = document.getElementById("view-grid-btn");

    radarBtn.addEventListener("click", () => switchView("radar"));
    gridBtn.addEventListener("click", () => switchView("grid"));

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

    // 8. Location Preset / Real GPS Selector
    const locSelect = document.getElementById("location-select");
    locSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "gps_real") {
        activateLiveAreaScan();
      } else {
        const preset = MarketData.LOCATION_PRESETS.find((p) => p.id === val);
        if (preset) {
          state.userLocation = {
            lat: preset.lat,
            lng: preset.lng,
            name: preset.name
          };
          recalculateAndRender();
        }
      }
    });

    // 8. Modals
    setupSellModal();
    setupPhotoLightbox();
    setupAlgorithmModal();
    setupChatModal();
    setupMobileModal();
    setupGoogleAuthModal();
    setupMyBeaconsModal();
    updateMyBeaconsBadge();

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
  }

  function switchView(mode) {
    state.currentView = mode;
    const radarContainer = document.getElementById("radar-mode-container");
    const gridContainer = document.getElementById("grid-mode-container");
    const radarBtn = document.getElementById("view-radar-btn");
    const gridBtn = document.getElementById("view-grid-btn");

    if (mode === "radar") {
      radarContainer.classList.remove("hidden");
      gridContainer.classList.add("hidden");
      radarBtn.className = "px-3 py-1.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 transition";
      gridBtn.className = "px-3 py-1.5 rounded-md text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition";
      if (radarEngine) {
        radarEngine.initCanvas();
      }
    } else {
      radarContainer.classList.add("hidden");
      gridContainer.classList.remove("hidden");
      gridBtn.className = "px-3 py-1.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 transition";
      radarBtn.className = "px-3 py-1.5 rounded-md text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition";
      renderCatalogGrid();
    }
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
   * Resizes large smartphone photos down to max 800px and calculates reduction stats.
   */
  function compressImageFile(file, callback, onError) {
    if (!file || !file.type.startsWith("image/")) {
      if (onError) onError(new Error("Selected file is not an image."));
      return;
    }

    const originalSizeBytes = file.size;
    const reader = new FileReader();

    reader.onerror = (err) => {
      if (onError) onError(err);
    };

    reader.onload = (e) => {
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
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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

    if (triggerCameraBtn && cameraInput) {
      triggerCameraBtn.addEventListener("click", () => cameraInput.click());
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
        if (cameraInput) cameraInput.click();
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

    openBtn.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });
    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
      clearUploadedPhoto();
      if (isbnScanner) isbnScanner.reset();
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        clearUploadedPhoto();
        if (isbnScanner) isbnScanner.reset();
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const category = form.querySelector("input[name='sell-category']:checked").value;
      const beaconType = form.querySelector("input[name='sell-beacon-type']:checked")?.value || "sell";
      const title = document.getElementById("sell-title").value.trim();
      const subCategory = document.getElementById("sell-subcategory").value.trim() || (category === "books" ? "Textbook" : "Stationery");
      const condition = document.getElementById("sell-condition").value;
      const price = parseFloat(document.getElementById("sell-price").value);
      const origPriceVal = document.getElementById("sell-orig-price").value;
      const originalPrice = origPriceVal ? parseFloat(origPriceVal) : Math.round(price * 1.6);
      const upiId = document.getElementById("sell-upi-id") ? document.getElementById("sell-upi-id").value.trim() : "";
      const landmark = document.getElementById("sell-landmark").value.trim();
      const description = document.getElementById("sell-desc").value.trim();
      
      let image = uploadedPhotoBase64 || document.getElementById("sell-image").value.trim();

      if (!image) {
        const presets = PRESET_PHOTOS[category];
        image = presets[Math.floor(Math.random() * presets.length)];
      }

      // Generate localized GPS coordinates ~150m to 500m from user
      const randomDistKm = (0.15 + Math.random() * 0.45);
      const randomBearingRad = Math.random() * Math.PI * 2;
      const deltaLat = (randomDistKm / 111) * Math.cos(randomBearingRad);
      const deltaLng = (randomDistKm / (111 * Math.cos((state.userLocation.lat * Math.PI) / 180))) * Math.sin(randomBearingRad);

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
        lat: state.userLocation.lat + deltaLat,
        lng: state.userLocation.lng + deltaLng,
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
          const imgSrc = item.image || PRESET_PHOTOS[item.category][0];
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
    const triggerGisBtn = document.getElementById("btn-trigger-gis-prompt");
    const customDemoForm = document.getElementById("form-custom-demo-login");
    const customEmailInput = document.getElementById("input-custom-demo-email");
    const editGoogleNicknameForm = document.getElementById("form-edit-google-nickname");
    const guestNicknameForm = document.getElementById("form-guest-nickname");

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
      }
      modal.classList.remove("hidden");
    };

    if (openBtn) openBtn.addEventListener("click", openModal);
    if (openBtnFromSell) openBtnFromSell.addEventListener("click", openModal);

    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

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

    // Trigger GIS One-Tap
    if (triggerGisBtn) {
      triggerGisBtn.addEventListener("click", () => {
        const clientId = window.MarketAPI ? MarketAPI.getGoogleClientId() : "";
        if (!clientId) {
          showToast("GOOGLE CLIENT ID NEEDED", "Please paste your full Google Client ID in the settings box below.");
          const details = modal.querySelector("details");
          if (details) details.open = true;
          return;
        }
        if (typeof google !== "undefined" && google.accounts && google.accounts.id) {
          google.accounts.id.prompt();
        }
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
          await MarketAPI.loginWithDemoGoogle({ email, name, picture });
          modal.classList.add("hidden");
          const user = MarketAPI.getCurrentUser();
          showToast("CAMPUS IDENTITY VERIFIED", `Welcome, ${user?.nickname}! +30 Trust score granted.`);
          refreshMarket();
        }
      });
    });

    // Custom Email Test Sign-In
    if (customDemoForm && customEmailInput) {
      customDemoForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = customEmailInput.value.trim();
        if (!email) return;
        const prefix = email.split("@")[0].replace(/[._]/g, " ");
        const name = prefix.charAt(0).toUpperCase() + prefix.slice(1);
        if (window.MarketAPI) {
          await MarketAPI.loginWithDemoGoogle({
            email,
            name,
            picture: `https://api.dicebear.com/7.x/bottts/svg?seed=${email}`
          });
          modal.classList.add("hidden");
          const user = MarketAPI.getCurrentUser();
          const bonus = user?.is_campus_verified ? "+30 Campus" : "+20 Google";
          showToast("VERIFIED SIGN-IN", `Logged in as ${email} (${bonus} Trust).`);
          refreshMarket();
        }
      });
    }

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

    // UPI Payment QR sheet
    const upiPayBtn = document.getElementById("btn-open-upi-pay");
    const upiSheet = document.getElementById("chat-upi-sheet");
    const closeUpiBtn = document.getElementById("btn-close-upi-sheet");
    const upiAmount = document.getElementById("chat-upi-amount");
    const upiIdDisplay = document.getElementById("chat-upi-id-display");
    const upiQrImg = document.getElementById("chat-upi-qr-img");

    if (upiPayBtn && upiSheet) {
      upiPayBtn.addEventListener("click", () => {
        if (!state.selectedTarget) return;
        const item = state.selectedTarget.item;
        const upiId = item.upi_id || "campus-trade@okhdfcbank";
        const sellerName = item.seller?.name || item.seller_name || "Campus Seller";
        const price = item.price;
        const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(sellerName)}&am=${price}&tn=${encodeURIComponent(item.title)}`;

        if (upiAmount) upiAmount.textContent = `₹${price}`;
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
            <img src="${item.image || PRESET_PHOTOS[item.category][0]}" class="w-10 h-10 rounded object-cover border border-slate-700 shrink-0" />
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
    const modal = document.getElementById("modal-chat");
    const item = target.item;
    state.activeChatId = item.id;

    document.getElementById("chat-seller-avatar").src =
      item.seller?.avatar || item.seller_avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80";
    document.getElementById("chat-seller-name").textContent = item.seller?.name || item.seller_name || "Seller";
    document.getElementById("chat-item-title").textContent = item.title;
    document.getElementById("chat-item-price").textContent = `₹${item.price}`;

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
   * Setup Progressive Web App (PWA) Service Worker & Install Prompt
   */
  let deferredPrompt = null;
  function setupPWA() {
    // 1. Register Service Worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[PWA] Service Worker registered with scope:", reg.scope);
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

/**
 * RadarMarket - Inventory Dataset & LocalStorage Store
 */

const DEFAULT_USER_LOCATION = {
  lat: null,
  lng: null,
  name: "Detecting Live GPS...",
  isLiveGPS: false
};

const LOCATION_PRESETS = [
  { id: "gps_real", name: "🛰️ Live Device GPS (Real-Time)", lat: null, lng: null }
];

/// Zero fake listings - authentic community marketplace only
const INITIAL_ITEMS = [];

const STORAGE_KEY = "radarmarket_items_v1";

/**
 * Load items from LocalStorage or initialize with defaults
 */
function getMarketItems() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item) =>
            !item.id.startsWith("stat-") &&
            !item.id.startsWith("book-") &&
            !(item.seller_id && item.seller_id.startsWith("seller-system"))
        );
      }
    }
  } catch (e) {
    console.warn("Error reading from localStorage:", e);
  }
  return [];
}

/**
 * Save market items array to LocalStorage
 */
function saveMarketItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
  }
}

/**
 * Add a new item listing
 */
function addNewListing(itemData) {
  const items = getMarketItems();
  const newItem = {
    id: "user-" + Date.now().toString(36),
    createdAt: Date.now(),
    isAvailable: true,
    ...itemData
  };
  items.unshift(newItem);
  saveMarketItems(items);
  return newItem;
}

/**
 * Reset dataset back to initial defaults
 */
function resetMarketToDefaults() {
  saveMarketItems(INITIAL_ITEMS);
  return INITIAL_ITEMS;
}

window.MarketData = {
  DEFAULT_USER_LOCATION,
  LOCATION_PRESETS,
  INITIAL_ITEMS,
  getMarketItems,
  saveMarketItems,
  addNewListing,
  resetMarketToDefaults
};

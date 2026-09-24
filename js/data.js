/**
 * RadarMarket - Inventory Dataset & LocalStorage Store
 */

const DEFAULT_USER_LOCATION = {
  lat: null,
  lng: null,
  name: "SEARCH YOUR COLLAGE HERE....",
  isLiveGPS: false
};

const LOCATION_PRESETS = [
  { id: "gps_real", name: "🛰️ Live Device GPS (Real-Time)", lat: null, lng: null }
];

/// Zero fake listings - authentic community marketplace only
const INITIAL_ITEMS = [];

const STORAGE_KEY = "radarmarket_items_v1";

/**
 * 6 Core India-Centric Multi-Category Taxonomy & Dynamic Attribute Definitions
 */
const CATEGORIES_TAXONOMY = {
  electronics: {
    id: "electronics",
    label: "Electronics & Gadgets",
    shortLabel: "Gadgets",
    icon: "smartphone",
    emoji: "📱",
    color: "#00f0ff",
    subcategories: [
      "Smartphones & Tablets",
      "Laptops & Accessories",
      "Earbuds & Headphones",
      "Scientific Calculators",
      "Power Banks & Cables",
      "Keyboards & Monitors"
    ],
    fields: [
      { key: "brand", label: "Brand / Manufacturer", type: "text", placeholder: "e.g. Casio, Apple, Lenovo, Boat, OnePlus" },
      { key: "model_year", label: "Model / Year", type: "text", placeholder: "e.g. fx-991CW, 2023, M2 Air" },
      { key: "warranty_months", label: "Remaining Warranty", type: "select", options: ["None / Expired", "Under 3 Months", "3 - 6 Months", "6+ Months", "1+ Year Bill Available"] },
      { key: "battery_condition", label: "Battery / Functional Condition", type: "select", options: ["100% Perfect Working", "Good Battery Life", "Average Battery", "Plug-in Use Only"] }
    ]
  },
  books: {
    id: "books",
    label: "Books & Exam Prep",
    shortLabel: "Books",
    icon: "book-open",
    emoji: "📚",
    color: "#ffe600",
    subcategories: [
      "Engineering & Tech Core",
      "Medical, MBBS & Pharmacy",
      "UPSC, GATE, CAT Prep",
      "JEE / NEET Guides & Test Series",
      "B.Com / CA / MBA Books",
      "Novels & Self-Help"
    ],
    fields: [
      { key: "exam_stream", label: "Exam / Stream / Degree", type: "text", placeholder: "e.g. B.Tech CSE, UPSC CSE, GATE EC, MBBS 2nd Yr" },
      { key: "subject_title", label: "Subject / Topic", type: "text", placeholder: "e.g. Data Structures, Polity, Organic Chemistry" },
      { key: "edition_year", label: "Edition / Publication Year", type: "text", placeholder: "e.g. 5th Edition, 2023, Latest" },
      { key: "highlight_condition", label: "Markings & Page Notes", type: "select", options: ["Unmarked / Clean Copy", "Minor Pencil Highlights", "Important Formulas Highlighted", "Well Annotated"] }
    ]
  },
  hostel: {
    id: "hostel",
    label: "Hostel & PG Essentials",
    shortLabel: "Hostel & PG",
    icon: "bed",
    emoji: "🛏️",
    color: "#ff007f",
    subcategories: [
      "Mattresses & Bedding",
      "Electric Kettles & Inductions",
      "Study Lamps & Foldable Tables",
      "Buckets, Mugs & Clotheshorses",
      "Storage Boxes & Racks",
      "Curtains, Mirrors & Irons"
    ],
    fields: [
      { key: "item_dimensions", label: "Dimensions / Capacity", type: "text", placeholder: "e.g. Single Bed 6x3 ft, 1.8L Kettle" },
      { key: "power_rating", label: "Power / Wattage (if electric)", type: "text", placeholder: "e.g. 1500W, 10W LED, Not Applicable" },
      { key: "hostel_block", label: "Hostel Wing / Society Tower", type: "text", placeholder: "e.g. Hostel 4 / Wing B / Flat 302" },
      { key: "hygiene_state", label: "Cleanliness & Hygiene Status", type: "select", options: ["Sanitized & Spotless", "Gently Used & Cleaned", "Normal Wear"] }
    ]
  },
  stationery: {
    id: "stationery",
    label: "Stationery & Art Supplies",
    shortLabel: "Stationery",
    icon: "pen-tool",
    emoji: "✏️",
    color: "#00ff88",
    subcategories: [
      "Mini Drafters & T-Squares",
      "Engineering Drawing Boards",
      "Notebooks, Binders & Registers",
      "Lab Coats & Safety Goggles",
      "Fine Art, Sketching & Paints",
      "Scientific Geometry Kits"
    ],
    fields: [
      { key: "drafter_brand", label: "Brand / Scale Standard", type: "text", placeholder: "e.g. Omega, Rotring, Faber-Castell, Classmate" },
      { key: "board_size", label: "Size / Spec", type: "text", placeholder: "e.g. A2 Drawing Board, Large Lab Coat 40\"" },
      { key: "completeness", label: "Included Accessories", type: "select", options: ["Complete Kit with Original Bag/Clamps", "Standard Gear Only", "Extra Refills Included"] }
    ]
  },
  sports: {
    id: "sports",
    label: "Sports & Fitness",
    shortLabel: "Sports & Fit",
    icon: "dumbbell",
    emoji: "🏏",
    color: "#ff8c00",
    subcategories: [
      "Cricket Bats & Gear",
      "Badminton & Tennis Racquets",
      "Dumbbells & Resistance Bands",
      "Yoga & Workout Mats",
      "Campus Bicycles & Locks",
      "Football, Basketball & Studs"
    ],
    fields: [
      { key: "gear_brand", label: "Brand / Model", type: "text", placeholder: "e.g. Yonex, SG, Decathlon Domyos, Hero Cycle" },
      { key: "weight_spec", label: "Weight / Tension / Spec", type: "text", placeholder: "e.g. 24 lbs string, 5kg pair, Short Handle" },
      { key: "usage_period", label: "Usage Duration", type: "select", options: ["Under 1 Month (Almost New)", "1 - 6 Months", "6+ Months of Active Play"] }
    ]
  },
  fashion: {
    id: "fashion",
    label: "Fashion & Campus Merch",
    shortLabel: "Fashion",
    icon: "shirt",
    emoji: "👕",
    color: "#a855f7",
    subcategories: [
      "College Hoodies & Merch",
      "Formal Suits & Interview Blazers",
      "College Backpacks & Laptop Bags",
      "Fest T-Shirts & Memorabilia",
      "Formal Shoes & Belts"
    ],
    fields: [
      { key: "apparel_size", label: "Size", type: "select", options: ["S (Small)", "M (Medium)", "L (Large)", "XL (Extra Large)", "XXL", "Free Size / Adjustable"] },
      { key: "brand_name", label: "Brand / Institution", type: "text", placeholder: "e.g. Raymond, Wildcraft, Official Campus Hoodie" },
      { key: "gender_fit", label: "Fit & Style", type: "select", options: ["Unisex / Universal", "Men's Fit", "Women's Fit"] }
    ]
  }
};

/**
 * Indian Safe Meetup Landmark Options
 */
const SAFE_LANDMARKS = [
  "Central Library Foyer / Steps",
  "Campus Canteen / Nescafe Kiosk",
  "Society Main Gate Security Post",
  "Metro Station Entry Gate / Token Counter",
  "Student Activity Center (SAC) / Sports Porch",
  "Campus Admin Block / Main Gate Porch",
  "Hostel / PG Common Reception Counter",
  "Local Market Clock Tower / Main Square"
];

/**
 * Proximity Tiers (Campus, Society, City)
 */
const PROXIMITY_TIERS = {
  campus: {
    id: "campus",
    label: "Campus Mode",
    shortLabel: "1 KM CAMPUS",
    radius: 1000,
    min: 200,
    max: 1500,
    desc: "Walking distance across hostel & academic blocks (500m - 1 km)"
  },
  society: {
    id: "society",
    label: "Society / Neighborhood",
    shortLabel: "5 KM SOCIETY",
    radius: 5000,
    min: 1500,
    max: 8000,
    desc: "Nearby student PGs, apartments & residential sectors (2 km - 5 km)"
  },
  city: {
    id: "city",
    label: "City / Metro Cluster",
    shortLabel: "25 KM CITY",
    radius: 25000,
    min: 8000,
    max: 25000,
    desc: "Wider metropolitan coaching hub & student districts (10 km - 25 km)"
  }
};

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
  CATEGORIES_TAXONOMY,
  SAFE_LANDMARKS,
  PROXIMITY_TIERS,
  INITIAL_ITEMS,
  getMarketItems,
  saveMarketItems,
  addNewListing,
  resetMarketToDefaults
};

/**
 * RadarMarket - Inventory Dataset & LocalStorage Store
 */

const DEFAULT_USER_LOCATION = {
  lat: 28.6139,
  lng: 77.2090,
  name: "University Campus Central (Ground Zero)"
};

const LOCATION_PRESETS = [
  { id: "campus_central", name: "University Campus Central", lat: 28.6139, lng: 77.2090 },
  { id: "library_quad", name: "Central Academic Library", lat: 28.6162, lng: 77.2115 },
  { id: "engineering_block", name: "Engineering & Tech Complex", lat: 28.6110, lng: 77.2065 },
  { id: "student_hostels", name: "North Dorms & Hostels", lat: 28.6185, lng: 77.2045 },
  { id: "city_quarter", name: "Old Book Market Square", lat: 28.6220, lng: 77.2150 }
];

// Curated high quality initial listings
const INITIAL_ITEMS = [
  // STATIONERY EQUIPMENT
  {
    id: "stat-001",
    title: "Casio fx-991EX ClassWiz Scientific Calculator",
    category: "stationery",
    subCategory: "Calculators & Electronics",
    price: 650,
    originalPrice: 1595,
    condition: "Like New",
    conditionScore: 0.95,
    seller: {
      name: "Aarav Sharma",
      rating: 4.9,
      reviewsCount: 28,
      verified: true,
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80"
    },
    // ~350m North-East
    lat: 28.6165,
    lng: 77.2110,
    landmark: "2nd Floor, Science Library",
    image: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80",
    description: "Barely used for 1 semester. Matrix, vector, spreadsheet functions all working perfectly. Has solar + battery.",
    tags: ["calculator", "casio", "engineering", "math", "exam-approved"],
    createdAt: Date.now() - 3600000 * 5, // 5 hours ago
    isAvailable: true
  },
  {
    id: "stat-002",
    title: "Rotring Professional Technical Drafting Compass Set",
    category: "stationery",
    subCategory: "Drafting & Architecture",
    price: 850,
    originalPrice: 2200,
    condition: "Good",
    conditionScore: 0.85,
    seller: {
      name: "Sneha Patel",
      rating: 4.7,
      reviewsCount: 14,
      verified: true,
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80"
    },
    // ~720m South
    lat: 28.6075,
    lng: 77.2085,
    landmark: "Architecture Design Studio 4",
    image: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=600&q=80",
    description: "German precision brass compass with extension bar, lead container, and universal pen adapter in original hard velvet case.",
    tags: ["drafting", "compass", "architecture", "rotring", "technical drawing"],
    createdAt: Date.now() - 3600000 * 18,
    isAvailable: true
  },
  {
    id: "stat-003",
    title: "Lamy Safari Charcoal Fountain Pen (Fine Nib)",
    category: "stationery",
    subCategory: "Fine Writing & Pens",
    price: 1100,
    originalPrice: 2400,
    condition: "Like New",
    conditionScore: 0.95,
    seller: {
      name: "Vikram Mehta",
      rating: 5.0,
      reviewsCount: 42,
      verified: true,
      avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&q=80"
    },
    // ~200m West
    lat: 28.6142,
    lng: 77.2070,
    landmark: "Campus Cafe Lounge",
    image: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80",
    description: "Matte black ABS body, original Z28 piston converter included + 3 blue ink cartridges. Flawless smooth flow.",
    tags: ["fountain pen", "lamy", "calligraphy", "pen", "luxury stationery"],
    createdAt: Date.now() - 3600000 * 2,
    isAvailable: true
  },
  {
    id: "stat-004",
    title: "Copic Sketch & Touch Twin Alcohol Art Markers (24 Colors)",
    category: "stationery",
    subCategory: "Art Supplies & Illustration",
    price: 1400,
    originalPrice: 3800,
    condition: "Good",
    conditionScore: 0.80,
    seller: {
      name: "Tanya Sen",
      rating: 4.8,
      reviewsCount: 19,
      verified: false,
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"
    },
    // ~1.1km North-West
    lat: 28.6210,
    lng: 77.2010,
    landmark: "Fine Arts Faculty Wing",
    image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=600&q=80",
    description: "Dual tip (chisel and brush). All markers tested with plenty of ink left. Includes desktop organizer stand.",
    tags: ["art", "markers", "copic", "drawing", "illustration"],
    createdAt: Date.now() - 3600000 * 24,
    isAvailable: true
  },
  {
    id: "stat-005",
    title: "Heavy Duty A3/A4 Rotary Paper Trimmer & Cutter",
    category: "stationery",
    subCategory: "Office & Lab Equipment",
    price: 750,
    originalPrice: 1950,
    condition: "Fair",
    conditionScore: 0.70,
    seller: {
      name: "Campus Print & Binding Club",
      rating: 4.6,
      reviewsCount: 31,
      verified: true,
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80"
    },
    // ~450m South-East
    lat: 28.6105,
    lng: 77.2120,
    landmark: "Student Activity Center (SAC)",
    image: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80",
    description: "Solid metal base with millimeter alignment grid. Self-sharpening circular blade. Minor scratches on base.",
    tags: ["paper cutter", "trimmer", "project work", "printing", "stationery"],
    createdAt: Date.now() - 3600000 * 48,
    isAvailable: true
  },

  // SECOND HAND BOOKS
  {
    id: "book-001",
    title: "Advanced Engineering Mathematics (10th Ed) - Erwin Kreyszig",
    category: "books",
    subCategory: "Engineering & Mathematics",
    price: 490,
    originalPrice: 1250,
    condition: "Good",
    conditionScore: 0.85,
    seller: {
      name: "Rohan Varma",
      rating: 4.9,
      reviewsCount: 35,
      verified: true,
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
    },
    // ~280m North
    lat: 28.6160,
    lng: 77.2095,
    landmark: "Reading Room 3, Central Library",
    image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80",
    description: "Standard text for ODE, PDE, Linear Algebra, Complex Analysis. Binding intact. Neatly highlighted important formulas.",
    tags: ["mathematics", "kreyszig", "engineering", "calculus", "textbook"],
    createdAt: Date.now() - 3600000 * 8,
    isAvailable: true
  },
  {
    id: "book-002",
    title: "Introduction to Algorithms (CLRS 3rd Edition)",
    category: "books",
    subCategory: "Computer Science",
    price: 920,
    originalPrice: 2400,
    condition: "Like New",
    conditionScore: 0.95,
    seller: {
      name: "Ananya Iyer",
      rating: 5.0,
      reviewsCount: 50,
      verified: true,
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80"
    },
    // ~550m North-West
    lat: 28.6175,
    lng: 77.2055,
    landmark: "CS Department Lab 102",
    image: "https://images.unsplash.com/photo-1532012164546-f432f2e3777a?auto=format&fit=crop&w=600&q=80",
    description: "The bible of algorithms (Cormen, Leiserson, Rivest, Stein). Hardcover, no bent pages, zero pencil marks.",
    tags: ["algorithms", "clrs", "computer science", "dsa", "coding", "mit"],
    createdAt: Date.now() - 3600000 * 3,
    isAvailable: true
  },
  {
    id: "book-003",
    title: "Concepts of Physics (Vol 1 & 2 Complete Set) - HC Verma",
    category: "books",
    subCategory: "Physics & Exam Prep",
    price: 380,
    originalPrice: 990,
    condition: "Good",
    conditionScore: 0.85,
    seller: {
      name: "Karan Johar (Engg Student)",
      rating: 4.8,
      reviewsCount: 16,
      verified: true,
      avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=120&q=80"
    },
    // ~850m South-West
    lat: 28.6080,
    lng: 77.2030,
    landmark: "Hostel 7 Common Hall",
    image: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80",
    description: "Both volumes with solved examples. Cleared my physics foundation with these! Perfect condition.",
    tags: ["physics", "hc verma", "jee", "neet", "mechanics", "optics"],
    createdAt: Date.now() - 3600000 * 12,
    isAvailable: true
  },
  {
    id: "book-004",
    title: "Organic Chemistry - Paula Yurkanis Bruice (8th Global Edition)",
    category: "books",
    subCategory: "Chemistry & Biology",
    price: 680,
    originalPrice: 1800,
    condition: "Fair",
    conditionScore: 0.70,
    seller: {
      name: "Meera Nair",
      rating: 4.5,
      reviewsCount: 9,
      verified: false,
      avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80"
    },
    // ~1.4km East
    lat: 28.6140,
    lng: 77.2230,
    landmark: "BioTech Research Center Gate",
    image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=600&q=80",
    description: "Full color edition with mechanism maps and synthesis practice problem sheets. Cover has edge wear.",
    tags: ["chemistry", "organic chemistry", "bruice", "pre-med", "reaction mechanism"],
    createdAt: Date.now() - 3600000 * 30,
    isAvailable: true
  },
  {
    id: "book-005",
    title: "1984 + Animal Farm (George Orwell Collector's Duo)",
    category: "books",
    subCategory: "Literature & Fiction",
    price: 250,
    originalPrice: 650,
    condition: "Like New",
    conditionScore: 0.95,
    seller: {
      name: "Devika Rao",
      rating: 4.9,
      reviewsCount: 22,
      verified: true,
      avatar: "https://images.unsplash.com/photo-1548142813-c348350df52b?auto=format&fit=crop&w=120&q=80"
    },
    // ~400m North-West
    lat: 28.6168,
    lng: 77.2060,
    landmark: "Humanities Courtyard",
    image: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=600&q=80",
    description: "Read once on holiday. Pristine spine, no creases or dog ears. Classic dystopian fiction.",
    tags: ["fiction", "orwell", "literature", "classics", "novels"],
    createdAt: Date.now() - 3600000 * 6,
    isAvailable: true
  },
  {
    id: "book-006",
    title: "Atomic Habits - James Clear (Hardcover Edition)",
    category: "books",
    subCategory: "Self-Help & Productivity",
    price: 320,
    originalPrice: 799,
    condition: "Like New",
    conditionScore: 0.95,
    seller: {
      name: "Kabir Singh",
      rating: 4.8,
      reviewsCount: 18,
      verified: true,
      avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=120&q=80"
    },
    // ~620m South-East
    lat: 28.6090,
    lng: 77.2135,
    landmark: "Student Sports Pavilion",
    image: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=600&q=80",
    description: "Life changing book on building tiny habits for big results. Original bookmark ribbon still attached.",
    tags: ["atomic habits", "james clear", "productivity", "psychology", "bestseller"],
    createdAt: Date.now() - 3600000 * 15,
    isAvailable: true
  }
];

const STORAGE_KEY = "radarmarket_items_v1";

/**
 * Load items from LocalStorage or initialize with defaults
 */
function getMarketItems() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Error reading from localStorage:", e);
  }
  // Initialize and persist defaults
  saveMarketItems(INITIAL_ITEMS);
  return INITIAL_ITEMS;
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

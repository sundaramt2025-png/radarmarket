/**
 * RadarMarket - Pan-India College & University Campus Directory
 * Contains verified geocoordinates, acronyms, and categorization for 
 * top universities, IITs, NITs, IIMs, AIIMS, and major colleges across India.
 */
(function (window) {
  "use strict";

  const INDIAN_CAMPUSES = [
    // --- IITs & PREMIER ENGINEERING ---
    {
      id: "iit-bombay",
      name: "Indian Institute of Technology Bombay",
      shortName: "IIT Bombay (IIT-B)",
      acronyms: ["iitb", "iit bombay", "powai"],
      city: "Mumbai",
      state: "Maharashtra",
      lat: 19.1334,
      lng: 72.9133,
      category: "IIT / Premier",
      tags: ["engineering", "mumbai", "powai", "tech"]
    },
    {
      id: "iit-delhi",
      name: "Indian Institute of Technology Delhi",
      shortName: "IIT Delhi (IIT-D)",
      acronyms: ["iitd", "iit delhi", "hauz khas"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.5450,
      lng: 77.1926,
      category: "IIT / Premier",
      tags: ["engineering", "delhi", "hauz khas", "tech"]
    },
    {
      id: "iit-madras",
      name: "Indian Institute of Technology Madras",
      shortName: "IIT Madras (IIT-M)",
      acronyms: ["iitm", "iit madras", "adyar"],
      city: "Chennai",
      state: "Tamil Nadu",
      lat: 12.9915,
      lng: 80.2337,
      category: "IIT / Premier",
      tags: ["engineering", "chennai", "tech"]
    },
    {
      id: "iit-kharagpur",
      name: "Indian Institute of Technology Kharagpur",
      shortName: "IIT Kharagpur (IIT-KGP)",
      acronyms: ["iitkgp", "iit kgp", "kharagpur"],
      city: "Kharagpur",
      state: "West Bengal",
      lat: 22.3149,
      lng: 87.3105,
      category: "IIT / Premier",
      tags: ["engineering", "bengal", "tech"]
    },
    {
      id: "iit-kanpur",
      name: "Indian Institute of Technology Kanpur",
      shortName: "IIT Kanpur (IIT-K)",
      acronyms: ["iitk", "iit kanpur", "kalyanpur"],
      city: "Kanpur",
      state: "Uttar Pradesh",
      lat: 26.5123,
      lng: 80.2329,
      category: "IIT / Premier",
      tags: ["engineering", "up", "tech"]
    },
    {
      id: "iit-roorkee",
      name: "Indian Institute of Technology Roorkee",
      shortName: "IIT Roorkee (IIT-R)",
      acronyms: ["iitr", "iit roorkee", "roorkee"],
      city: "Roorkee",
      state: "Uttarakhand",
      lat: 29.8649,
      lng: 77.8966,
      category: "IIT / Premier",
      tags: ["engineering", "uttarakhand", "tech"]
    },
    {
      id: "iit-guwahati",
      name: "Indian Institute of Technology Guwahati",
      shortName: "IIT Guwahati (IIT-G)",
      acronyms: ["iitg", "iit guwahati"],
      city: "Guwahati",
      state: "Assam",
      lat: 26.1878,
      lng: 91.6916,
      category: "IIT / Premier",
      tags: ["engineering", "assam", "northeast"]
    },
    {
      id: "iit-hyderabad",
      name: "Indian Institute of Technology Hyderabad",
      shortName: "IIT Hyderabad (IIT-H)",
      acronyms: ["iith", "iit hyderabad", "kandi"],
      city: "Sangareddy",
      state: "Telangana",
      lat: 17.5947,
      lng: 78.1230,
      category: "IIT / Premier",
      tags: ["engineering", "hyderabad", "tech"]
    },
    {
      id: "iisc-bangalore",
      name: "Indian Institute of Science Bangalore",
      shortName: "IISc Bangalore",
      acronyms: ["iisc", "iisc bangalore", "malleswaram"],
      city: "Bengaluru",
      state: "Karnataka",
      lat: 13.0219,
      lng: 77.5671,
      category: "IIT / Premier",
      tags: ["science", "research", "bangalore"]
    },
    {
      id: "bits-pilani",
      name: "Birla Institute of Technology and Science Pilani",
      shortName: "BITS Pilani (Main Campus)",
      acronyms: ["bits", "bits pilani", "pilani"],
      city: "Pilani",
      state: "Rajasthan",
      lat: 28.3639,
      lng: 75.5877,
      category: "IIT / Premier",
      tags: ["engineering", "bits", "rajasthan"]
    },
    {
      id: "bits-goa",
      name: "BITS Pilani K K Birla Goa Campus",
      shortName: "BITS Goa Campus",
      acronyms: ["bits goa", "bits zuarinagar"],
      city: "Zuarinagar",
      state: "Goa",
      lat: 15.3911,
      lng: 73.8782,
      category: "IIT / Premier",
      tags: ["engineering", "goa", "bits"]
    },
    {
      id: "bits-hyderabad",
      name: "BITS Pilani Hyderabad Campus",
      shortName: "BITS Hyderabad Campus",
      acronyms: ["bits hyd", "bits hyderabad", "jawaharnagar"],
      city: "Hyderabad",
      state: "Telangana",
      lat: 17.5449,
      lng: 78.5718,
      category: "IIT / Premier",
      tags: ["engineering", "hyderabad", "bits"]
    },

    // --- NITs & IIITs ---
    {
      id: "nit-trichy",
      name: "National Institute of Technology Tiruchirappalli",
      shortName: "NIT Trichy (NITT)",
      acronyms: ["nitt", "nit trichy", "trichy"],
      city: "Tiruchirappalli",
      state: "Tamil Nadu",
      lat: 10.7589,
      lng: 78.8132,
      category: "NIT / IIIT",
      tags: ["engineering", "tamil nadu", "nit"]
    },
    {
      id: "nit-surathkal",
      name: "National Institute of Technology Karnataka",
      shortName: "NIT Surathkal (NITK)",
      acronyms: ["nitk", "nit surathkal", "mangalore"],
      city: "Surathkal",
      state: "Karnataka",
      lat: 13.0110,
      lng: 74.7943,
      category: "NIT / IIIT",
      tags: ["engineering", "karnataka", "nit"]
    },
    {
      id: "nit-rourkela",
      name: "National Institute of Technology Rourkela",
      shortName: "NIT Rourkela (NITR)",
      acronyms: ["nitr", "nit rourkela"],
      city: "Rourkela",
      state: "Odisha",
      lat: 22.2530,
      lng: 84.9010,
      category: "NIT / IIIT",
      tags: ["engineering", "odisha", "nit"]
    },
    {
      id: "nit-warangal",
      name: "National Institute of Technology Warangal",
      shortName: "NIT Warangal (NITW)",
      acronyms: ["nitw", "nit warangal", "kazipet"],
      city: "Warangal",
      state: "Telangana",
      lat: 17.9836,
      lng: 79.5308,
      category: "NIT / IIIT",
      tags: ["engineering", "telangana", "nit"]
    },
    {
      id: "vnit-nagpur",
      name: "Visvesvaraya National Institute of Technology",
      shortName: "VNIT Nagpur",
      acronyms: ["vnit", "vnit nagpur"],
      city: "Nagpur",
      state: "Maharashtra",
      lat: 21.1235,
      lng: 79.0515,
      category: "NIT / IIIT",
      tags: ["engineering", "maharashtra", "nit"]
    },
    {
      id: "svnit-surat",
      name: "Sardar Vallabhbhai National Institute of Technology",
      shortName: "SVNIT Surat",
      acronyms: ["svnit", "svnit surat"],
      city: "Surat",
      state: "Gujarat",
      lat: 21.1643,
      lng: 72.7845,
      category: "NIT / IIIT",
      tags: ["engineering", "gujarat", "nit"]
    },
    {
      id: "mnnit-allahabad",
      name: "Motilal Nehru National Institute of Technology",
      shortName: "MNNIT Allahabad / Prayagraj",
      acronyms: ["mnnit", "mnnit allahabad", "prayagraj"],
      city: "Prayagraj",
      state: "Uttar Pradesh",
      lat: 25.4934,
      lng: 81.8631,
      category: "NIT / IIIT",
      tags: ["engineering", "up", "nit"]
    },
    {
      id: "iiit-hyderabad",
      name: "International Institute of Information Technology",
      shortName: "IIIT Hyderabad",
      acronyms: ["iiith", "iiit hyderabad", "gachibowli"],
      city: "Hyderabad",
      state: "Telangana",
      lat: 17.4455,
      lng: 78.3489,
      category: "NIT / IIIT",
      tags: ["tech", "coding", "hyderabad"]
    },
    {
      id: "iiit-delhi",
      name: "Indraprastha Institute of Information Technology",
      shortName: "IIIT Delhi",
      acronyms: ["iiitd", "iiit delhi", "okhla"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.5459,
      lng: 77.2732,
      category: "NIT / IIIT",
      tags: ["tech", "delhi", "iiit"]
    },

    // --- DELHI NCR & NORTH INDIA ---
    {
      id: "du-north-campus",
      name: "Delhi University (North Campus Hub)",
      shortName: "DU North Campus",
      acronyms: ["du", "du north", "north campus", "delhi university"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.6903,
      lng: 77.2072,
      category: "Delhi NCR",
      tags: ["central university", "delhi", "arts", "commerce", "science"]
    },
    {
      id: "du-srcc",
      name: "Shri Ram College of Commerce (SRCC)",
      shortName: "SRCC Delhi",
      acronyms: ["srcc", "shri ram college"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.6926,
      lng: 77.2081,
      category: "Delhi NCR",
      tags: ["commerce", "economics", "delhi"]
    },
    {
      id: "du-st-stephens",
      name: "St. Stephen's College, University of Delhi",
      shortName: "St. Stephen's College",
      acronyms: ["stephens", "st stephens"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.6888,
      lng: 77.2114,
      category: "Delhi NCR",
      tags: ["arts", "science", "delhi"]
    },
    {
      id: "du-south-campus",
      name: "Delhi University (South Campus Hub)",
      shortName: "DU South Campus (Benito Juarez)",
      acronyms: ["du south", "south campus"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.5830,
      lng: 77.1610,
      category: "Delhi NCR",
      tags: ["delhi", "central university"]
    },
    {
      id: "dtu-delhi",
      name: "Delhi Technological University (formerly DCE)",
      shortName: "DTU Delhi (Bawana)",
      acronyms: ["dtu", "dce", "delhi tech"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.7499,
      lng: 77.1170,
      category: "Delhi NCR",
      tags: ["engineering", "delhi", "tech"]
    },
    {
      id: "nsut-delhi",
      name: "Netaji Subhas University of Technology",
      shortName: "NSUT Delhi (Dwarka)",
      acronyms: ["nsut", "nsit", "dwarka"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.6083,
      lng: 77.0371,
      category: "Delhi NCR",
      tags: ["engineering", "delhi"]
    },
    {
      id: "jnu-delhi",
      name: "Jawaharlal Nehru University",
      shortName: "JNU New Delhi",
      acronyms: ["jnu", "jawaharlal nehru university"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.5400,
      lng: 77.1666,
      category: "Delhi NCR",
      tags: ["central university", "research", "humanities"]
    },
    {
      id: "jamia-millia",
      name: "Jamia Millia Islamia",
      shortName: "Jamia Millia Islamia (JMI)",
      acronyms: ["jmi", "jamia"],
      city: "New Delhi",
      state: "Delhi NCR",
      lat: 28.5616,
      lng: 77.2802,
      category: "Delhi NCR",
      tags: ["central university", "delhi"]
    },
    {
      id: "amity-noida",
      name: "Amity University Uttar Pradesh",
      shortName: "Amity University Noida",
      acronyms: ["amity", "amity noida", "amity university"],
      city: "Noida",
      state: "Delhi NCR",
      lat: 28.5440,
      lng: 77.3330,
      category: "Delhi NCR",
      tags: ["private", "noida", "tech"]
    },
    {
      id: "panjab-university",
      name: "Panjab University Chandigarh",
      shortName: "Panjab University (PU Chd)",
      acronyms: ["pu", "panjab university", "chandigarh"],
      city: "Chandigarh",
      state: "Chandigarh",
      lat: 30.7600,
      lng: 76.7680,
      category: "Delhi NCR",
      tags: ["chandigarh", "state university"]
    },
    {
      id: "thapar-patiala",
      name: "Thapar Institute of Engineering and Technology",
      shortName: "Thapar University Patiala",
      acronyms: ["thapar", "tiet", "patiala"],
      city: "Patiala",
      state: "Punjab",
      lat: 30.3564,
      lng: 76.3647,
      category: "Delhi NCR",
      tags: ["engineering", "punjab"]
    },
    {
      id: "lpu-phagwara",
      name: "Lovely Professional University",
      shortName: "LPU Jalandhar-Phagwara",
      acronyms: ["lpu", "lovely professional university"],
      city: "Phagwara",
      state: "Punjab",
      lat: 31.2536,
      lng: 75.7037,
      category: "Delhi NCR",
      tags: ["punjab", "private", "mega campus"]
    },

    // --- MAHARASHTRA & WEST INDIA ---
    {
      id: "mu-kalina",
      name: "University of Mumbai (Vidyanagari Kalina Campus)",
      shortName: "Mumbai University (Kalina)",
      acronyms: ["mu", "mumbai university", "kalina", "vidyanagari"],
      city: "Mumbai",
      state: "Maharashtra",
      lat: 19.0760,
      lng: 72.8634,
      category: "Mumbai & Pune",
      tags: ["university", "mumbai", "kalina"]
    },
    {
      id: "vjti-matunga",
      name: "Veermata Jijabai Technological Institute",
      shortName: "VJTI Mumbai (Matunga)",
      acronyms: ["vjti", "vjti matunga", "matunga"],
      city: "Mumbai",
      state: "Maharashtra",
      lat: 19.0222,
      lng: 72.8561,
      category: "Mumbai & Pune",
      tags: ["engineering", "mumbai", "matunga"]
    },
    {
      id: "st-xaviers-mumbai",
      name: "St. Xavier's College Mumbai",
      shortName: "St. Xavier's (Fort, Mumbai)",
      acronyms: ["xaviers", "st xaviers mumbai", "fort"],
      city: "Mumbai",
      state: "Maharashtra",
      lat: 18.9438,
      lng: 72.8318,
      category: "Mumbai & Pune",
      tags: ["arts", "science", "mumbai", "heritage"]
    },
    {
      id: "spit-andheri",
      name: "Sardar Patel Institute of Technology (SPIT / SPCE)",
      shortName: "SPIT / Bhavan's Campus Andheri",
      acronyms: ["spit", "spce", "bhavans andheri"],
      city: "Mumbai",
      state: "Maharashtra",
      lat: 19.1232,
      lng: 72.8364,
      category: "Mumbai & Pune",
      tags: ["engineering", "andheri", "mumbai"]
    },
    {
      id: "djsanghvi-vile-parle",
      name: "Dwarkadas J. Sanghvi College of Engineering",
      shortName: "DJ Sanghvi (Vile Parle)",
      acronyms: ["djsce", "dj sanghvi", "vile parle"],
      city: "Mumbai",
      state: "Maharashtra",
      lat: 19.1075,
      lng: 72.8373,
      category: "Mumbai & Pune",
      tags: ["engineering", "vile parle", "mumbai"]
    },
    {
      id: "nmims-mumbai",
      name: "SVKM's NMIMS Deemed-to-be-University",
      shortName: "NMIMS Mumbai (Juhu / Vile Parle)",
      acronyms: ["nmims", "svkm", "juhu"],
      city: "Mumbai",
      state: "Maharashtra",
      lat: 19.1032,
      lng: 72.8367,
      category: "Mumbai & Pune",
      tags: ["management", "commerce", "mumbai"]
    },
    {
      id: "coep-pune",
      name: "COEP Technological University (College of Engineering Pune)",
      shortName: "COEP Pune (Shivajinagar)",
      acronyms: ["coep", "coep pune", "shivajinagar"],
      city: "Pune",
      state: "Maharashtra",
      lat: 18.5293,
      lng: 73.8565,
      category: "Mumbai & Pune",
      tags: ["engineering", "pune", "heritage"]
    },
    {
      id: "sppu-pune",
      name: "Savitribai Phule Pune University",
      shortName: "SPPU Pune University (Ganeshkhind)",
      acronyms: ["sppu", "pune university", "ganeshkhind"],
      city: "Pune",
      state: "Maharashtra",
      lat: 18.5529,
      lng: 73.8260,
      category: "Mumbai & Pune",
      tags: ["university", "pune"]
    },
    {
      id: "symbiosis-pune",
      name: "Symbiosis International University",
      shortName: "Symbiosis Pune (Lavale / Viman Nagar)",
      acronyms: ["siu", "symbiosis", "viman nagar"],
      city: "Pune",
      state: "Maharashtra",
      lat: 18.5362,
      lng: 73.8296,
      category: "Mumbai & Pune",
      tags: ["law", "management", "pune"]
    },
    {
      id: "ict-matunga",
      name: "Institute of Chemical Technology",
      shortName: "ICT Mumbai (UDCT)",
      acronyms: ["ict", "udct", "chemical technology"],
      city: "Mumbai",
      state: "Maharashtra",
      lat: 19.0234,
      lng: 72.8596,
      category: "Mumbai & Pune",
      tags: ["chemical", "engineering", "mumbai"]
    },
    {
      id: "pillai-panvel",
      name: "Pillai College of Engineering Panvel",
      shortName: "Pillai Campus (New Panvel / Navi Mumbai)",
      acronyms: ["pillai", "pce", "panvel", "navi mumbai"],
      city: "Navi Mumbai",
      state: "Maharashtra",
      lat: 18.9894,
      lng: 73.1277,
      category: "Mumbai & Pune",
      tags: ["engineering", "navi mumbai"]
    },
    {
      id: "taps-colony-boisar",
      name: "BARC / TAPS Education Complex & Local Colleges Boisar",
      shortName: "Boisar Campus & College Zone",
      acronyms: ["boisar", "palghar", "taps"],
      city: "Boisar",
      state: "Maharashtra",
      lat: 19.8035,
      lng: 72.7232,
      category: "Mumbai & Pune",
      tags: ["palghar", "boisar", "local sector"]
    },

    // --- KARNATAKA & SOUTH INDIA ---
    {
      id: "christ-university-blr",
      name: "Christ (Deemed to be University)",
      shortName: "Christ University (Hosur Rd, Bengaluru)",
      acronyms: ["christ", "christ university", "hosur road"],
      city: "Bengaluru",
      state: "Karnataka",
      lat: 12.9344,
      lng: 77.6060,
      category: "Bangalore & South",
      tags: ["arts", "commerce", "law", "bangalore"]
    },
    {
      id: "rvce-bangalore",
      name: "R.V. College of Engineering",
      shortName: "RVCE Bengaluru (Mysore Rd)",
      acronyms: ["rvce", "rv college", "mysore road"],
      city: "Bengaluru",
      state: "Karnataka",
      lat: 12.9238,
      lng: 77.4987,
      category: "Bangalore & South",
      tags: ["engineering", "bangalore"]
    },
    {
      id: "bmsce-bangalore",
      name: "B.M.S. College of Engineering",
      shortName: "BMSCE Bengaluru (Basavanagudi)",
      acronyms: ["bmsce", "bms college", "basavanagudi"],
      city: "Bengaluru",
      state: "Karnataka",
      lat: 12.9416,
      lng: 77.5658,
      category: "Bangalore & South",
      tags: ["engineering", "bangalore"]
    },
    {
      id: "pes-university-blr",
      name: "PES University (RR Campus)",
      shortName: "PES University (Banashankari)",
      acronyms: ["pes", "pesit", "pes university"],
      city: "Bengaluru",
      state: "Karnataka",
      lat: 12.9344,
      lng: 77.5345,
      category: "Bangalore & South",
      tags: ["engineering", "bangalore"]
    },
    {
      id: "manipal-mahe",
      name: "Manipal Academy of Higher Education",
      shortName: "MAHE Manipal (Main Campus)",
      acronyms: ["manipal", "mahe", "mit manipal"],
      city: "Manipal",
      state: "Karnataka",
      lat: 13.3525,
      lng: 74.7928,
      category: "Bangalore & South",
      tags: ["medical", "engineering", "coastal"]
    },
    {
      id: "vit-vellore",
      name: "Vellore Institute of Technology",
      shortName: "VIT Vellore (Main Campus)",
      acronyms: ["vit", "vit vellore", "vellore"],
      city: "Vellore",
      state: "Tamil Nadu",
      lat: 12.9698,
      lng: 79.1559,
      category: "Bangalore & South",
      tags: ["engineering", "tamil nadu", "vit"]
    },
    {
      id: "anna-university",
      name: "Anna University (CEG Guindy Campus)",
      shortName: "Anna University Chennai",
      acronyms: ["anna university", "ceg", "guindy"],
      city: "Chennai",
      state: "Tamil Nadu",
      lat: 13.0118,
      lng: 80.2362,
      category: "Bangalore & South",
      tags: ["engineering", "chennai", "state premier"]
    },
    {
      id: "srm-ktr",
      name: "SRM Institute of Science and Technology",
      shortName: "SRM Kattankulathur (Main Campus)",
      acronyms: ["srm", "srm ktr", "srm university"],
      city: "Chennai",
      state: "Tamil Nadu",
      lat: 12.8230,
      lng: 80.0444,
      category: "Bangalore & South",
      tags: ["engineering", "chennai", "private"]
    },
    {
      id: "osmania-university",
      name: "Osmania University Hyderabad",
      shortName: "Osmania University (Tarnaka)",
      acronyms: ["ou", "osmania", "tarnaka"],
      city: "Hyderabad",
      state: "Telangana",
      lat: 17.4138,
      lng: 78.5284,
      category: "Bangalore & South",
      tags: ["heritage", "state university", "hyderabad"]
    },

    // --- EAST & CENTRAL INDIA ---
    {
      id: "jadavpur-university",
      name: "Jadavpur University Kolkata",
      shortName: "Jadavpur University (JU Kolkata)",
      acronyms: ["ju", "jadavpur", "jadavpur university"],
      city: "Kolkata",
      state: "West Bengal",
      lat: 22.4989,
      lng: 88.3718,
      category: "East & Central",
      tags: ["engineering", "arts", "kolkata"]
    },
    {
      id: "calcutta-university",
      name: "University of Calcutta",
      shortName: "Calcutta University (College St)",
      acronyms: ["cu", "calcutta university", "college street"],
      city: "Kolkata",
      state: "West Bengal",
      lat: 22.5739,
      lng: 88.3638,
      category: "East & Central",
      tags: ["heritage", "kolkata", "university"]
    },
    {
      id: "bhu-varanasi",
      name: "Banaras Hindu University",
      shortName: "BHU Varanasi (Main Campus)",
      acronyms: ["bhu", "banaras hindu university", "iit bhu"],
      city: "Varanasi",
      state: "Uttar Pradesh",
      lat: 25.2677,
      lng: 82.9913,
      category: "East & Central",
      tags: ["central university", "heritage", "varanasi"]
    },
    {
      id: "amu-aligarh",
      name: "Aligarh Muslim University",
      shortName: "AMU Aligarh",
      acronyms: ["amu", "aligarh muslim university"],
      city: "Aligarh",
      state: "Uttar Pradesh",
      lat: 27.9150,
      lng: 78.0770,
      category: "East & Central",
      tags: ["central university", "up"]
    },
    {
      id: "aiims-delhi",
      name: "All India Institute of Medical Sciences New Delhi",
      shortName: "AIIMS New Delhi (Ansari Nagar)",
      acronyms: ["aiims", "aiims delhi", "ansari nagar"],
      city: "New Delhi",
      state: "Medical / AIIMS",
      lat: 28.5672,
      lng: 77.2100,
      category: "Medical / AIIMS",
      tags: ["medical", "aiims", "delhi"]
    },
    {
      id: "iim-ahmedabad",
      name: "Indian Institute of Management Ahmedabad",
      shortName: "IIM Ahmedabad (Vastrapur)",
      acronyms: ["iima", "iim ahmedabad", "vastrapur"],
      city: "Ahmedabad",
      state: "Gujarat",
      lat: 23.0336,
      lng: 72.5323,
      category: "IIT / Premier",
      tags: ["management", "iim", "ahmedabad"]
    },
    {
      id: "iim-bangalore",
      name: "Indian Institute of Management Bangalore",
      shortName: "IIM Bangalore (Bannerghatta)",
      acronyms: ["iimb", "iim bangalore", "bannerghatta"],
      city: "Bengaluru",
      state: "Karnataka",
      lat: 12.8984,
      lng: 77.5996,
      category: "IIT / Premier",
      tags: ["management", "iim", "bangalore"]
    }
  ];

  /**
   * Fast In-Memory Fuzzy / Acronym Matcher for Indian Campuses
   */
  function searchCampuses(query, limit = 20) {
    if (!query || !query.trim()) {
      return INDIAN_CAMPUSES.slice(0, limit);
    }
    const cleanQ = query.trim().toLowerCase();
    const qTokens = cleanQ.split(/\s+/).filter(Boolean);

    const scored = INDIAN_CAMPUSES.map((campus) => {
      let score = 0;
      const cName = campus.name.toLowerCase();
      const cShort = campus.shortName.toLowerCase();
      const cCity = campus.city.toLowerCase();
      const cState = campus.state.toLowerCase();
      const cAcronyms = (campus.acronyms || []).map((a) => a.toLowerCase());
      const cTags = (campus.tags || []).map((t) => t.toLowerCase());

      // Exact acronym match gives top score
      if (cAcronyms.includes(cleanQ)) {
        score += 150;
      }

      // Exact short name match
      if (cShort === cleanQ) {
        score += 120;
      }

      // Starts with query
      if (cName.startsWith(cleanQ) || cShort.startsWith(cleanQ)) {
        score += 80;
      }

      // Token matches
      qTokens.forEach((token) => {
        if (cAcronyms.some((a) => a.includes(token))) score += 50;
        if (cShort.includes(token)) score += 35;
        if (cName.includes(token)) score += 25;
        if (cCity.includes(token)) score += 20;
        if (cState.includes(token)) score += 15;
        if (cTags.some((t) => t.includes(token))) score += 10;
      });

      return { campus, score };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.campus);
  }

  /**
   * Get Campuses Filtered by Category Pill
   */
  function getCampusesByCategory(category = "all", limit = 30) {
    if (!category || category === "all") {
      return INDIAN_CAMPUSES.slice(0, limit);
    }
    return INDIAN_CAMPUSES.filter((c) => {
      if (category === "iit" || category === "premier") {
        return c.category === "IIT / Premier";
      }
      if (category === "delhi") {
        return c.category === "Delhi NCR" || c.state.includes("Delhi");
      }
      if (category === "mumbai_pune") {
        return c.category === "Mumbai & Pune" || c.state === "Maharashtra";
      }
      if (category === "south") {
        return c.category === "Bangalore & South" || ["Karnataka", "Tamil Nadu", "Telangana", "Kerala", "Andhra Pradesh"].includes(c.state);
      }
      return c.category.toLowerCase().includes(category.toLowerCase());
    }).slice(0, limit);
  }

  /**
   * Find Nearest Campus to given coordinates
   */
  function findNearestCampus(lat, lng) {
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    function haversine(lat1, lon1, lat2, lon2) {
      const R = 6371e3;
      const phi1 = (lat1 * Math.PI) / 180;
      const phi2 = (lat2 * Math.PI) / 180;
      const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
      const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    let nearest = null;
    let minDistance = Infinity;

    for (const c of INDIAN_CAMPUSES) {
      const d = haversine(lat, lng, c.lat, c.lng);
      if (d < minDistance) {
        minDistance = d;
        nearest = { ...c, distanceMeters: d };
      }
    }

    return nearest;
  }

  /**
   * Live Pan-India Geocoding Fallback for Unlisted Local Colleges
   * Queries OpenStreetMap Nominatim restricted to Indian boundaries
   */
  async function searchLiveIndianColleges(query) {
    if (!query || query.trim().length < 3) return [];
    try {
      const encoded = encodeURIComponent(`${query.trim()} college india`);
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=in&limit=8&addressdetails=1`,
        { headers: { "Accept-Language": "en" } }
      );
      if (!resp.ok) return [];
      const results = await resp.json();
      return (results || []).map((r, idx) => {
        const addr = r.address || {};
        const city = addr.city || addr.town || addr.county || addr.state_district || "India";
        const state = addr.state || "India";
        const short = r.display_name.split(",")[0];
        return {
          id: `live-osm-${r.place_id || idx}`,
          name: r.display_name,
          shortName: short,
          acronyms: [short.toLowerCase()],
          city: city,
          state: state,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          category: "Live Map Campus",
          tags: ["live-geocoded", city.toLowerCase(), state.toLowerCase()],
          isLiveGeocoded: true
        };
      });
    } catch (err) {
      console.warn("Live Indian college geocoding unavailable:", err);
      return [];
    }
  }

  // Export to global scope
  window.IndianCampuses = {
    CAMPUSES: INDIAN_CAMPUSES,
    searchCampuses,
    getCampusesByCategory,
    findNearestCampus,
    searchLiveIndianColleges
  };
})(window);

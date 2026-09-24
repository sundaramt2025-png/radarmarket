/**
 * RadarMarket - Supercharged Pan-India College & University Campus Directory
 * Comprehensive directory of verified Indian higher-education institutions,
 * universities, IITs, NITs, IIMs, medical colleges, and regional institutes across all states.
 */
(function (window) {
  "use strict";

  const INDIAN_CAMPUSES = [
    // === IITs & PREMIER INSTITUTES ===
    { id: "iit-bombay", name: "Indian Institute of Technology Bombay", shortName: "IIT Bombay (IIT-B)", acronyms: ["iitb", "iit bombay", "powai"], city: "Mumbai", state: "Maharashtra", lat: 19.1334, lng: 72.9133, category: "IIT / Premier", tags: ["engineering", "mumbai", "powai", "tech"] },
    { id: "iit-delhi", name: "Indian Institute of Technology Delhi", shortName: "IIT Delhi (IIT-D)", acronyms: ["iitd", "iit delhi", "hauz khas"], city: "New Delhi", state: "Delhi NCR", lat: 28.5450, lng: 77.1926, category: "IIT / Premier", tags: ["engineering", "delhi", "tech"] },
    { id: "iit-madras", name: "Indian Institute of Technology Madras", shortName: "IIT Madras (IIT-M)", acronyms: ["iitm", "iit madras", "adyar"], city: "Chennai", state: "Tamil Nadu", lat: 12.9915, lng: 80.2337, category: "IIT / Premier", tags: ["engineering", "chennai", "tech"] },
    { id: "iit-kharagpur", name: "Indian Institute of Technology Kharagpur", shortName: "IIT Kharagpur (IIT-KGP)", acronyms: ["iitkgp", "iit kgp"], city: "Kharagpur", state: "West Bengal", lat: 22.3149, lng: 87.3105, category: "IIT / Premier", tags: ["engineering", "bengal", "tech"] },
    { id: "iit-kanpur", name: "Indian Institute of Technology Kanpur", shortName: "IIT Kanpur (IIT-K)", acronyms: ["iitk", "iit kanpur"], city: "Kanpur", state: "Uttar Pradesh", lat: 26.5123, lng: 80.2329, category: "IIT / Premier", tags: ["engineering", "up", "tech"] },
    { id: "iit-roorkee", name: "Indian Institute of Technology Roorkee", shortName: "IIT Roorkee (IIT-R)", acronyms: ["iitr", "iit roorkee"], city: "Roorkee", state: "Uttarakhand", lat: 29.8649, lng: 77.8966, category: "IIT / Premier", tags: ["engineering", "uttarakhand"] },
    { id: "iit-guwahati", name: "Indian Institute of Technology Guwahati", shortName: "IIT Guwahati (IIT-G)", acronyms: ["iitg", "iit guwahati"], city: "Guwahati", state: "Assam", lat: 26.1878, lng: 91.6916, category: "IIT / Premier", tags: ["engineering", "assam", "northeast"] },
    { id: "iit-hyderabad", name: "Indian Institute of Technology Hyderabad", shortName: "IIT Hyderabad (IIT-H)", acronyms: ["iith", "iit hyderabad"], city: "Hyderabad", state: "Telangana", lat: 17.5947, lng: 78.1230, category: "IIT / Premier", tags: ["engineering", "hyderabad"] },
    { id: "iit-indore", name: "Indian Institute of Technology Indore", shortName: "IIT Indore (Simrol)", acronyms: ["iiti", "iit indore", "simrol"], city: "Indore", state: "Madhya Pradesh", lat: 22.5204, lng: 75.9207, category: "IIT / Premier", tags: ["engineering", "mp"] },
    { id: "iit-bhubaneswar", name: "Indian Institute of Technology Bhubaneswar", shortName: "IIT Bhubaneswar", acronyms: ["iit bbsr", "iit bhubaneswar"], city: "Bhubaneswar", state: "Odisha", lat: 20.1484, lng: 85.6712, category: "IIT / Premier", tags: ["engineering", "odisha"] },
    { id: "iit-patna", name: "Indian Institute of Technology Patna", shortName: "IIT Patna (Bihta)", acronyms: ["iitp", "iit patna", "bihta"], city: "Patna", state: "Bihar", lat: 25.5357, lng: 84.8512, category: "IIT / Premier", tags: ["engineering", "bihar"] },
    { id: "iit-gandhinagar", name: "Indian Institute of Technology Gandhinagar", shortName: "IIT Gandhinagar (Palaj)", acronyms: ["iitgn", "iit gandhinagar"], city: "Gandhinagar", state: "Gujarat", lat: 23.2114, lng: 72.6842, category: "IIT / Premier", tags: ["engineering", "gujarat"] },
    { id: "iit-jodhpur", name: "Indian Institute of Technology Jodhpur", shortName: "IIT Jodhpur (Karwad)", acronyms: ["iitj", "iit jodhpur"], city: "Jodhpur", state: "Rajasthan", lat: 26.4711, lng: 73.1134, category: "IIT / Premier", tags: ["engineering", "rajasthan"] },
    { id: "iit-ropar", name: "Indian Institute of Technology Ropar", shortName: "IIT Ropar", acronyms: ["iitrpr", "iit ropar"], city: "Rupnagar", state: "Punjab", lat: 30.9664, lng: 76.4731, category: "IIT / Premier", tags: ["engineering", "punjab"] },
    { id: "iit-mandi", name: "Indian Institute of Technology Mandi", shortName: "IIT Mandi (Kamand)", acronyms: ["iit mandi", "kamand"], city: "Mandi", state: "Himachal Pradesh", lat: 31.7816, lng: 76.9944, category: "IIT / Premier", tags: ["engineering", "himachal"] },
    { id: "iit-varanasi", name: "Indian Institute of Technology (BHU) Varanasi", shortName: "IIT BHU Varanasi", acronyms: ["iit bhu", "it bhu"], city: "Varanasi", state: "Uttar Pradesh", lat: 25.2623, lng: 82.9893, category: "IIT / Premier", tags: ["engineering", "varanasi", "up"] },
    { id: "iit-dhanbad", name: "Indian Institute of Technology (ISM) Dhanbad", shortName: "IIT (ISM) Dhanbad", acronyms: ["ism dhanbad", "iit ism"], city: "Dhanbad", state: "Jharkhand", lat: 23.8143, lng: 86.4412, category: "IIT / Premier", tags: ["engineering", "mining", "jharkhand"] },
    { id: "iit-palakkad", name: "Indian Institute of Technology Palakkad", shortName: "IIT Palakkad", acronyms: ["iit pkd", "iit palakkad"], city: "Palakkad", state: "Kerala", lat: 10.8037, lng: 76.7441, category: "IIT / Premier", tags: ["engineering", "kerala"] },
    { id: "iit-tirupati", name: "Indian Institute of Technology Tirupati", shortName: "IIT Tirupati", acronyms: ["iit tpt", "iit tirupati"], city: "Tirupati", state: "Andhra Pradesh", lat: 13.7088, lng: 79.5936, category: "IIT / Premier", tags: ["engineering", "ap"] },
    { id: "iit-jammu", name: "Indian Institute of Technology Jammu", shortName: "IIT Jammu (Jagti)", acronyms: ["iit jammu"], city: "Jammu", state: "Jammu and Kashmir", lat: 32.8029, lng: 74.8966, category: "IIT / Premier", tags: ["engineering", "jk"] },
    { id: "iit-bhilai", name: "Indian Institute of Technology Bhilai", shortName: "IIT Bhilai", acronyms: ["iit bhilai"], city: "Bhilai", state: "Chhattisgarh", lat: 21.1448, lng: 81.3045, category: "IIT / Premier", tags: ["engineering", "chhattisgarh"] },
    { id: "iit-goa", name: "Indian Institute of Technology Goa", shortName: "IIT Goa (Farmagudi)", acronyms: ["iit goa"], city: "Ponda", state: "Goa", lat: 15.4249, lng: 74.0086, category: "IIT / Premier", tags: ["engineering", "goa"] },
    { id: "iit-dharwad", name: "Indian Institute of Technology Dharwad", shortName: "IIT Dharwad", acronyms: ["iit dharwad"], city: "Dharwad", state: "Karnataka", lat: 15.4600, lng: 74.9800, category: "IIT / Premier", tags: ["engineering", "karnataka"] },
    { id: "iisc-bangalore", name: "Indian Institute of Science Bangalore", shortName: "IISc Bangalore", acronyms: ["iisc", "iisc bangalore"], city: "Bengaluru", state: "Karnataka", lat: 13.0219, lng: 77.5671, category: "IIT / Premier", tags: ["science", "research", "bangalore"] },
    { id: "bits-pilani", name: "Birla Institute of Technology and Science Pilani", shortName: "BITS Pilani (Main Campus)", acronyms: ["bits", "bits pilani"], city: "Pilani", state: "Rajasthan", lat: 28.3639, lng: 75.5877, category: "IIT / Premier", tags: ["engineering", "bits", "rajasthan"] },
    { id: "bits-goa", name: "BITS Pilani K K Birla Goa Campus", shortName: "BITS Goa Campus", acronyms: ["bits goa", "zuarinagar"], city: "Zuarinagar", state: "Goa", lat: 15.3911, lng: 73.8782, category: "IIT / Premier", tags: ["engineering", "goa", "bits"] },
    { id: "bits-hyderabad", name: "BITS Pilani Hyderabad Campus", shortName: "BITS Hyderabad Campus", acronyms: ["bits hyd", "bits hyderabad"], city: "Hyderabad", state: "Telangana", lat: 17.5449, lng: 78.5718, category: "IIT / Premier", tags: ["engineering", "hyderabad", "bits"] },

    // === NITs & IIITs ===
    { id: "nit-trichy", name: "National Institute of Technology Tiruchirappalli", shortName: "NIT Trichy (NITT)", acronyms: ["nitt", "nit trichy"], city: "Tiruchirappalli", state: "Tamil Nadu", lat: 10.7589, lng: 78.8132, category: "NIT / IIIT", tags: ["engineering", "tamil nadu", "nit"] },
    { id: "nit-surathkal", name: "National Institute of Technology Karnataka", shortName: "NIT Surathkal (NITK)", acronyms: ["nitk", "nit surathkal"], city: "Surathkal", state: "Karnataka", lat: 13.0110, lng: 74.7943, category: "NIT / IIIT", tags: ["engineering", "karnataka", "nit"] },
    { id: "nit-rourkela", name: "National Institute of Technology Rourkela", shortName: "NIT Rourkela (NITR)", acronyms: ["nitr", "nit rourkela"], city: "Rourkela", state: "Odisha", lat: 22.2530, lng: 84.9010, category: "NIT / IIIT", tags: ["engineering", "odisha", "nit"] },
    { id: "nit-warangal", name: "National Institute of Technology Warangal", shortName: "NIT Warangal (NITW)", acronyms: ["nitw", "nit warangal"], city: "Warangal", state: "Telangana", lat: 17.9836, lng: 79.5308, category: "NIT / IIIT", tags: ["engineering", "telangana", "nit"] },
    { id: "nit-calicut", name: "National Institute of Technology Calicut", shortName: "NIT Calicut (NITC)", acronyms: ["nitc", "nit calicut"], city: "Kozhikode", state: "Kerala", lat: 11.3216, lng: 75.9336, category: "NIT / IIIT", tags: ["engineering", "kerala", "nit"] },
    { id: "vnit-nagpur", name: "Visvesvaraya National Institute of Technology", shortName: "VNIT Nagpur", acronyms: ["vnit", "vnit nagpur"], city: "Nagpur", state: "Maharashtra", lat: 21.1235, lng: 79.0515, category: "NIT / IIIT", tags: ["engineering", "maharashtra", "nit"] },
    { id: "svnit-surat", name: "Sardar Vallabhbhai National Institute of Technology", shortName: "SVNIT Surat", acronyms: ["svnit", "svnit surat"], city: "Surat", state: "Gujarat", lat: 21.1643, lng: 72.7845, category: "NIT / IIIT", tags: ["engineering", "gujarat", "nit"] },
    { id: "mnnit-allahabad", name: "Motilal Nehru National Institute of Technology", shortName: "MNNIT Allahabad / Prayagraj", acronyms: ["mnnit", "mnnit allahabad"], city: "Prayagraj", state: "Uttar Pradesh", lat: 25.4934, lng: 81.8631, category: "NIT / IIIT", tags: ["engineering", "up", "nit"] },
    { id: "mnit-jaipur", name: "Malaviya National Institute of Technology Jaipur", shortName: "MNIT Jaipur (Malaviya)", acronyms: ["mnit", "mnit jaipur"], city: "Jaipur", state: "Rajasthan", lat: 26.8640, lng: 75.8108, category: "NIT / IIIT", tags: ["engineering", "rajasthan", "nit"] },
    { id: "nit-kurukshetra", name: "National Institute of Technology Kurukshetra", shortName: "NIT Kurukshetra", acronyms: ["nit kkr", "nit kurukshetra"], city: "Kurukshetra", state: "Haryana", lat: 29.9499, lng: 76.8173, category: "NIT / IIIT", tags: ["engineering", "haryana", "nit"] },
    { id: "manit-bhopal", name: "Maulana Azad National Institute of Technology", shortName: "MANIT Bhopal", acronyms: ["manit", "manit bhopal"], city: "Bhopal", state: "Madhya Pradesh", lat: 23.2167, lng: 77.4083, category: "NIT / IIIT", tags: ["engineering", "mp", "nit"] },
    { id: "nit-durgapur", name: "National Institute of Technology Durgapur", shortName: "NIT Durgapur", acronyms: ["nit dgp", "nit durgapur"], city: "Durgapur", state: "West Bengal", lat: 23.5484, lng: 87.2931, category: "NIT / IIIT", tags: ["engineering", "bengal", "nit"] },
    { id: "nit-jamshedpur", name: "National Institute of Technology Jamshedpur", shortName: "NIT Jamshedpur (Adityapur)", acronyms: ["nit jsr", "nit jamshedpur"], city: "Jamshedpur", state: "Jharkhand", lat: 22.7766, lng: 86.1437, category: "NIT / IIIT", tags: ["engineering", "jharkhand", "nit"] },
    { id: "nit-silchar", name: "National Institute of Technology Silchar", shortName: "NIT Silchar", acronyms: ["nit silchar"], city: "Silchar", state: "Assam", lat: 24.7577, lng: 92.7925, category: "NIT / IIIT", tags: ["engineering", "assam", "nit"] },
    { id: "nit-patna", name: "National Institute of Technology Patna", shortName: "NIT Patna (Ashok Rajpath)", acronyms: ["nit patna"], city: "Patna", state: "Bihar", lat: 25.6207, lng: 85.1722, category: "NIT / IIIT", tags: ["engineering", "bihar", "nit"] },
    { id: "nit-hamirpur", name: "National Institute of Technology Hamirpur", shortName: "NIT Hamirpur", acronyms: ["nith", "nit hamirpur"], city: "Hamirpur", state: "Himachal Pradesh", lat: 31.7084, lng: 76.5273, category: "NIT / IIIT", tags: ["engineering", "himachal", "nit"] },
    { id: "nit-jalandhar", name: "Dr B R Ambedkar National Institute of Technology", shortName: "NIT Jalandhar (NITJ)", acronyms: ["nitj", "nit jalandhar"], city: "Jalandhar", state: "Punjab", lat: 31.3959, lng: 75.5358, category: "NIT / IIIT", tags: ["engineering", "punjab", "nit"] },
    { id: "nit-srinagar", name: "National Institute of Technology Srinagar", shortName: "NIT Srinagar (Hazratbal)", acronyms: ["nit srinagar"], city: "Srinagar", state: "Jammu and Kashmir", lat: 34.1250, lng: 74.8389, category: "NIT / IIIT", tags: ["engineering", "kashmir", "nit"] },
    { id: "nit-raipur", name: "National Institute of Technology Raipur", shortName: "NIT Raipur (GE Road)", acronyms: ["nit raipur"], city: "Raipur", state: "Chhattisgarh", lat: 21.2497, lng: 81.6050, category: "NIT / IIIT", tags: ["engineering", "chhattisgarh", "nit"] },
    { id: "nit-goa", name: "National Institute of Technology Goa", shortName: "NIT Goa (Cuncolim)", acronyms: ["nit goa"], city: "Cuncolim", state: "Goa", lat: 15.1764, lng: 73.9930, category: "NIT / IIIT", tags: ["engineering", "goa", "nit"] },
    { id: "nit-delhi", name: "National Institute of Technology Delhi", shortName: "NIT Delhi (Narela)", acronyms: ["nitd", "nit delhi"], city: "New Delhi", state: "Delhi NCR", lat: 28.8427, lng: 77.1052, category: "NIT / IIIT", tags: ["engineering", "delhi", "nit"] },
    { id: "iiit-hyderabad", name: "International Institute of Information Technology Hyderabad", shortName: "IIIT Hyderabad (Gachibowli)", acronyms: ["iiith", "iiit hyderabad"], city: "Hyderabad", state: "Telangana", lat: 17.4455, lng: 78.3489, category: "NIT / IIIT", tags: ["tech", "coding", "hyderabad"] },
    { id: "iiit-delhi", name: "Indraprastha Institute of Information Technology Delhi", shortName: "IIIT Delhi (Okhla)", acronyms: ["iiitd", "iiit delhi"], city: "New Delhi", state: "Delhi NCR", lat: 28.5459, lng: 77.2732, category: "NIT / IIIT", tags: ["tech", "delhi", "iiit"] },
    { id: "iiit-bangalore", name: "International Institute of Information Technology Bangalore", shortName: "IIIT Bangalore (Electronic City)", acronyms: ["iiitb", "iiit bangalore"], city: "Bengaluru", state: "Karnataka", lat: 12.8399, lng: 77.6635, category: "NIT / IIIT", tags: ["tech", "bangalore"] },
    { id: "iiit-allahabad", name: "Indian Institute of Information Technology Allahabad", shortName: "IIIT Allahabad (Jhalwa)", acronyms: ["iiita", "iiit allahabad"], city: "Prayagraj", state: "Uttar Pradesh", lat: 25.4300, lng: 81.7706, category: "NIT / IIIT", tags: ["tech", "up"] },
    { id: "iiit-gwalior", name: "ABV-Indian Institute of Information Technology and Management", shortName: "IIITM Gwalior", acronyms: ["iiitm gwalior"], city: "Gwalior", state: "Madhya Pradesh", lat: 26.2492, lng: 78.1738, category: "NIT / IIIT", tags: ["tech", "mp"] },
    { id: "iiit-jabalpur", name: "PDPM Indian Institute of Information Technology", shortName: "IIITDM Jabalpur (Dumna)", acronyms: ["iiitdm jabalpur"], city: "Jabalpur", state: "Madhya Pradesh", lat: 23.1765, lng: 80.0248, category: "NIT / IIIT", tags: ["tech", "mp"] },
    { id: "iiit-kancheepuram", name: "Indian Institute of Information Technology Design & Manufacturing", shortName: "IIITDM Kancheepuram (Chennai)", acronyms: ["iiitdm chennai"], city: "Chennai", state: "Tamil Nadu", lat: 12.8386, lng: 80.1373, category: "NIT / IIIT", tags: ["tech", "chennai"] },

    // === MAHARASHTRA, MUMBAI & PUNE ===
    { id: "mu-kalina", name: "University of Mumbai (Vidyanagari Kalina)", shortName: "Mumbai University (Kalina)", acronyms: ["mu", "mumbai university", "kalina"], city: "Mumbai", state: "Maharashtra", lat: 19.0760, lng: 72.8634, category: "Mumbai & Pune", tags: ["university", "mumbai"] },
    { id: "mu-fort", name: "University of Mumbai (Fort Heritage Campus)", shortName: "Mumbai University (Fort)", acronyms: ["mu fort", "mumbai university fort"], city: "Mumbai", state: "Maharashtra", lat: 18.9298, lng: 72.8310, category: "Mumbai & Pune", tags: ["heritage", "mumbai"] },
    { id: "vjti-matunga", name: "Veermata Jijabai Technological Institute", shortName: "VJTI Mumbai (Matunga)", acronyms: ["vjti", "vjti matunga"], city: "Mumbai", state: "Maharashtra", lat: 19.0222, lng: 72.8561, category: "Mumbai & Pune", tags: ["engineering", "mumbai"] },
    { id: "st-xaviers-mumbai", name: "St. Xavier's College Mumbai", shortName: "St. Xavier's (Fort, Mumbai)", acronyms: ["xaviers", "st xaviers mumbai"], city: "Mumbai", state: "Maharashtra", lat: 18.9438, lng: 72.8318, category: "Mumbai & Pune", tags: ["arts", "science", "mumbai"] },
    { id: "spit-andheri", name: "Sardar Patel Institute of Technology (SPIT / SPCE)", shortName: "SPIT / Bhavan's Andheri", acronyms: ["spit", "spce", "bhavans andheri"], city: "Mumbai", state: "Maharashtra", lat: 19.1232, lng: 72.8364, category: "Mumbai & Pune", tags: ["engineering", "andheri"] },
    { id: "djsanghvi-vile-parle", name: "Dwarkadas J. Sanghvi College of Engineering", shortName: "DJ Sanghvi (Vile Parle)", acronyms: ["djsce", "dj sanghvi"], city: "Mumbai", state: "Maharashtra", lat: 19.1075, lng: 72.8373, category: "Mumbai & Pune", tags: ["engineering", "vile parle"] },
    { id: "nmims-mumbai", name: "SVKM's NMIMS Deemed University", shortName: "NMIMS Mumbai (Juhu)", acronyms: ["nmims", "svkm", "juhu"], city: "Mumbai", state: "Maharashtra", lat: 19.1032, lng: 72.8367, category: "Mumbai & Pune", tags: ["management", "mumbai"] },
    { id: "mithibai-mumbai", name: "Mithibai College of Arts & Chauhan Institute", shortName: "Mithibai College (Vile Parle)", acronyms: ["mithibai", "mithibai college"], city: "Mumbai", state: "Maharashtra", lat: 19.1027, lng: 72.8373, category: "Mumbai & Pune", tags: ["arts", "commerce", "mumbai"] },
    { id: "hr-college-churchgate", name: "H.R. College of Commerce and Economics", shortName: "HR College (Churchgate)", acronyms: ["hr college", "churchgate"], city: "Mumbai", state: "Maharashtra", lat: 18.9322, lng: 72.8267, category: "Mumbai & Pune", tags: ["commerce", "mumbai"] },
    { id: "kc-college-churchgate", name: "Kishinchand Chellaram College", shortName: "KC College (Churchgate)", acronyms: ["kc college", "churchgate"], city: "Mumbai", state: "Maharashtra", lat: 18.9328, lng: 72.8263, category: "Mumbai & Pune", tags: ["arts", "science", "mumbai"] },
    { id: "somaiya-vidyavihar", name: "K J Somaiya College of Engineering (Somaiya Vidyavihar)", shortName: "Somaiya Vidyavihar (Ghatkopar)", acronyms: ["somaiya", "kj somaiya", "vidyavihar"], city: "Mumbai", state: "Maharashtra", lat: 19.0728, lng: 72.9004, category: "Mumbai & Pune", tags: ["engineering", "ghatkopar"] },
    { id: "tsec-bandra", name: "Thadomal Shahani Engineering College", shortName: "TSEC Bandra (National College)", acronyms: ["tsec", "thadomal shahani", "bandra"], city: "Mumbai", state: "Maharashtra", lat: 19.0645, lng: 72.8358, category: "Mumbai & Pune", tags: ["engineering", "bandra"] },
    { id: "fr-agnel-vashi", name: "Fr. C. Rodrigues Institute of Technology", shortName: "Fr. Agnel (FCRIT Vashi)", acronyms: ["fcrit", "fr agnel", "vashi"], city: "Navi Mumbai", state: "Maharashtra", lat: 19.0763, lng: 72.9926, category: "Mumbai & Pune", tags: ["engineering", "navi mumbai"] },
    { id: "rait-nerul", name: "Ramrao Adik Institute of Technology (DY Patil)", shortName: "RAIT Nerul (Navi Mumbai)", acronyms: ["rait", "dy patil nerul"], city: "Navi Mumbai", state: "Maharashtra", lat: 19.0434, lng: 73.0238, category: "Mumbai & Pune", tags: ["engineering", "navi mumbai"] },
    { id: "pillai-panvel", name: "Pillai College of Engineering Panvel", shortName: "Pillai Campus (New Panvel)", acronyms: ["pillai", "pce", "panvel"], city: "Navi Mumbai", state: "Maharashtra", lat: 18.9894, lng: 73.1277, category: "Mumbai & Pune", tags: ["engineering", "navi mumbai"] },
    { id: "taps-colony-boisar", name: "BARC / TAPS Education Complex & Local Colleges Boisar", shortName: "Boisar Campus & College Zone", acronyms: ["boisar", "palghar", "taps"], city: "Boisar", state: "Maharashtra", lat: 19.8035, lng: 72.7232, category: "Mumbai & Pune", tags: ["palghar", "boisar", "local sector"] },
    { id: "st-john-palghar", name: "St. John College of Engineering and Management Palghar", shortName: "St. John Campus Palghar", acronyms: ["st john", "palghar college"], city: "Palghar", state: "Maharashtra", lat: 19.7088, lng: 72.7758, category: "Mumbai & Pune", tags: ["engineering", "palghar"] },
    { id: "viva-college-virar", name: "VIVA College of Arts, Commerce & Science", shortName: "VIVA College Virar", acronyms: ["viva", "viva college", "virar"], city: "Virar", state: "Maharashtra", lat: 19.4623, lng: 72.8122, category: "Mumbai & Pune", tags: ["virar", "vasai", "mumbai"] },
    { id: "govt-poly-thane", name: "Government Polytechnic Thane", shortName: "Govt Polytechnic Thane", acronyms: ["gp thane", "polytechnic thane"], city: "Thane", state: "Maharashtra", lat: 19.1860, lng: 72.9759, category: "Mumbai & Pune", tags: ["polytechnic", "thane"] },
    { id: "coep-pune", name: "COEP Technological University (College of Engineering Pune)", shortName: "COEP Pune (Shivajinagar)", acronyms: ["coep", "coep pune", "shivajinagar"], city: "Pune", state: "Maharashtra", lat: 18.5293, lng: 73.8565, category: "Mumbai & Pune", tags: ["engineering", "pune"] },
    { id: "sppu-pune", name: "Savitribai Phule Pune University", shortName: "SPPU Pune University (Ganeshkhind)", acronyms: ["sppu", "pune university"], city: "Pune", state: "Maharashtra", lat: 18.5529, lng: 73.8260, category: "Mumbai & Pune", tags: ["university", "pune"] },
    { id: "fergusson-pune", name: "Fergusson College (Autonomous) Pune", shortName: "Fergusson College (FC Pune)", acronyms: ["fergusson", "fc pune"], city: "Pune", state: "Maharashtra", lat: 18.5236, lng: 73.8407, category: "Mumbai & Pune", tags: ["arts", "science", "pune"] },
    { id: "mit-wpu-pune", name: "MIT World Peace University Pune", shortName: "MIT-WPU Pune (Kothrud)", acronyms: ["mit wpu", "mit pune", "kothrud"], city: "Pune", state: "Maharashtra", lat: 18.5178, lng: 73.8151, category: "Mumbai & Pune", tags: ["engineering", "pune"] },
    { id: "pict-pune", name: "Pune Institute of Computer Technology", shortName: "PICT Pune (Dhankawadi)", acronyms: ["pict", "pict pune"], city: "Pune", state: "Maharashtra", lat: 18.4575, lng: 73.8508, category: "Mumbai & Pune", tags: ["tech", "coding", "pune"] },
    { id: "pccoe-pune", name: "Pimpri Chinchwad College of Engineering", shortName: "PCCOE Pune (Akurdi)", acronyms: ["pccoe", "akurdi"], city: "Pune", state: "Maharashtra", lat: 18.6517, lng: 73.7615, category: "Mumbai & Pune", tags: ["engineering", "pcmc"] },
    { id: "symbiosis-pune", name: "Symbiosis International University", shortName: "Symbiosis Pune (Lavale / Viman Nagar)", acronyms: ["symbiosis", "siu"], city: "Pune", state: "Maharashtra", lat: 18.5362, lng: 73.8296, category: "Mumbai & Pune", tags: ["law", "management", "pune"] },
    { id: "dy-patil-akurdi", name: "D.Y. Patil International University Akurdi", shortName: "DY Patil Akurdi Campus", acronyms: ["dy patil akurdi"], city: "Pune", state: "Maharashtra", lat: 18.6465, lng: 73.7591, category: "Mumbai & Pune", tags: ["engineering", "pune"] },
    { id: "walchand-sangli", name: "Walchand College of Engineering Sangli", shortName: "Walchand College (WCE Sangli)", acronyms: ["walchand", "wce sangli"], city: "Sangli", state: "Maharashtra", lat: 16.8458, lng: 74.6014, category: "Mumbai & Pune", tags: ["engineering", "maharashtra"] },
    { id: "gce-karad", name: "Government College of Engineering Karad", shortName: "GCE Karad (Vidyanagar)", acronyms: ["gce karad"], city: "Karad", state: "Maharashtra", lat: 17.2995, lng: 74.1952, category: "Mumbai & Pune", tags: ["engineering", "maharashtra"] },
    { id: "gce-aurangabad", name: "Government College of Engineering Chhatrapati Sambhajinagar", shortName: "GECA Aurangabad", acronyms: ["geca", "gec aurangabad"], city: "Chhatrapati Sambhajinagar", state: "Maharashtra", lat: 19.8660, lng: 75.3229, category: "Mumbai & Pune", tags: ["engineering", "aurangabad"] },
    { id: "bamu-aurangabad", name: "Dr. Babasaheb Ambedkar Marathwada University", shortName: "BAMU University Sambhajinagar", acronyms: ["bamu"], city: "Chhatrapati Sambhajinagar", state: "Maharashtra", lat: 19.9010, lng: 75.3116, category: "Mumbai & Pune", tags: ["university", "maharashtra"] },
    { id: "kk-wagh-nashik", name: "K. K. Wagh Institute of Engineering", shortName: "KK Wagh Nashik (Amrutdham)", acronyms: ["kk wagh", "nashik college"], city: "Nashik", state: "Maharashtra", lat: 20.0125, lng: 73.8239, category: "Mumbai & Pune", tags: ["engineering", "nashik"] },

    // === DELHI NCR & NORTH INDIA ===
    { id: "du-north-campus", name: "Delhi University (North Campus Hub)", shortName: "DU North Campus", acronyms: ["du", "du north", "north campus"], city: "New Delhi", state: "Delhi NCR", lat: 28.6903, lng: 77.2072, category: "Delhi NCR", tags: ["central university", "delhi"] },
    { id: "du-srcc", name: "Shri Ram College of Commerce (SRCC)", shortName: "SRCC Delhi", acronyms: ["srcc"], city: "New Delhi", state: "Delhi NCR", lat: 28.6926, lng: 77.2081, category: "Delhi NCR", tags: ["commerce", "delhi"] },
    { id: "du-hindu", name: "Hindu College, University of Delhi", shortName: "Hindu College (North Campus)", acronyms: ["hindu college"], city: "New Delhi", state: "Delhi NCR", lat: 28.6837, lng: 77.2104, category: "Delhi NCR", tags: ["arts", "science", "delhi"] },
    { id: "du-miranda", name: "Miranda House, University of Delhi", shortName: "Miranda House (DU)", acronyms: ["miranda house"], city: "New Delhi", state: "Delhi NCR", lat: 28.6917, lng: 77.2117, category: "Delhi NCR", tags: ["arts", "science", "delhi"] },
    { id: "du-hansraj", name: "Hansraj College, University of Delhi", shortName: "Hansraj College (Malka Ganj)", acronyms: ["hansraj"], city: "New Delhi", state: "Delhi NCR", lat: 28.6797, lng: 77.2106, category: "Delhi NCR", tags: ["arts", "science", "delhi"] },
    { id: "du-st-stephens", name: "St. Stephen's College, University of Delhi", shortName: "St. Stephen's College", acronyms: ["stephens", "st stephens"], city: "New Delhi", state: "Delhi NCR", lat: 28.6888, lng: 77.2114, category: "Delhi NCR", tags: ["arts", "science", "delhi"] },
    { id: "du-south-campus", name: "Delhi University (South Campus Hub)", shortName: "DU South Campus (Benito Juarez)", acronyms: ["du south"], city: "New Delhi", state: "Delhi NCR", lat: 28.5830, lng: 77.1610, category: "Delhi NCR", tags: ["delhi", "central university"] },
    { id: "du-lsr", name: "Lady Shri Ram College for Women", shortName: "LSR College (Lajpat Nagar)", acronyms: ["lsr", "lady shri ram"], city: "New Delhi", state: "Delhi NCR", lat: 28.5619, lng: 77.2396, category: "Delhi NCR", tags: ["arts", "delhi"] },
    { id: "du-venkateswara", name: "Sri Venkateswara College (Venky)", shortName: "Sri Venkateswara (Venky DU)", acronyms: ["venky", "venkateswara"], city: "New Delhi", state: "Delhi NCR", lat: 28.5864, lng: 77.1664, category: "Delhi NCR", tags: ["south campus", "delhi"] },
    { id: "dtu-delhi", name: "Delhi Technological University (formerly DCE)", shortName: "DTU Delhi (Bawana)", acronyms: ["dtu", "dce"], city: "New Delhi", state: "Delhi NCR", lat: 28.7499, lng: 77.1170, category: "Delhi NCR", tags: ["engineering", "delhi"] },
    { id: "nsut-delhi", name: "Netaji Subhas University of Technology", shortName: "NSUT Delhi (Dwarka)", acronyms: ["nsut", "nsit"], city: "New Delhi", state: "Delhi NCR", lat: 28.6083, lng: 77.0371, category: "Delhi NCR", tags: ["engineering", "delhi"] },
    { id: "jnu-delhi", name: "Jawaharlal Nehru University", shortName: "JNU New Delhi", acronyms: ["jnu"], city: "New Delhi", state: "Delhi NCR", lat: 28.5400, lng: 77.1666, category: "Delhi NCR", tags: ["central university", "delhi"] },
    { id: "jamia-millia", name: "Jamia Millia Islamia", shortName: "Jamia Millia Islamia (JMI)", acronyms: ["jmi", "jamia"], city: "New Delhi", state: "Delhi NCR", lat: 28.5616, lng: 77.2802, category: "Delhi NCR", tags: ["central university", "delhi"] },
    { id: "aiims-delhi", name: "All India Institute of Medical Sciences New Delhi", shortName: "AIIMS New Delhi", acronyms: ["aiims", "aiims delhi"], city: "New Delhi", state: "Delhi NCR", lat: 28.5672, lng: 77.2100, category: "Medical / AIIMS", tags: ["medical", "delhi"] },
    { id: "amity-noida", name: "Amity University Uttar Pradesh", shortName: "Amity University Noida", acronyms: ["amity", "amity noida"], city: "Noida", state: "Delhi NCR", lat: 28.5440, lng: 77.3330, category: "Delhi NCR", tags: ["private", "noida"] },
    { id: "shiv-nadar-noida", name: "Shiv Nadar University", shortName: "Shiv Nadar University (Dadri)", acronyms: ["snu", "shiv nadar"], city: "Greater Noida", state: "Delhi NCR", lat: 28.5262, lng: 77.5752, category: "Delhi NCR", tags: ["private", "noida"] },
    { id: "ashoka-sonipat", name: "Ashoka University Rajiv Gandhi Education City", shortName: "Ashoka University Sonipat", acronyms: ["ashoka university"], city: "Sonipat", state: "Delhi NCR", lat: 28.9536, lng: 77.1009, category: "Delhi NCR", tags: ["liberal arts", "haryana"] },
    { id: "panjab-university", name: "Panjab University Chandigarh", shortName: "Panjab University (PU Chd)", acronyms: ["pu", "panjab university"], city: "Chandigarh", state: "Chandigarh", lat: 30.7600, lng: 76.7680, category: "Delhi NCR", tags: ["chandigarh", "state university"] },
    { id: "pec-chandigarh", name: "Punjab Engineering College (Deemed)", shortName: "PEC Chandigarh (Sector 12)", acronyms: ["pec", "pec chandigarh"], city: "Chandigarh", state: "Chandigarh", lat: 30.7667, lng: 76.7865, category: "Delhi NCR", tags: ["engineering", "chandigarh"] },
    { id: "thapar-patiala", name: "Thapar Institute of Engineering and Technology", shortName: "Thapar University Patiala", acronyms: ["thapar", "tiet"], city: "Patiala", state: "Punjab", lat: 30.3564, lng: 76.3647, category: "Delhi NCR", tags: ["engineering", "punjab"] },
    { id: "lpu-phagwara", name: "Lovely Professional University", shortName: "LPU Jalandhar-Phagwara", acronyms: ["lpu"], city: "Phagwara", state: "Punjab", lat: 31.2536, lng: 75.7037, category: "Delhi NCR", tags: ["punjab", "private"] },
    { id: "gndu-amritsar", name: "Guru Nanak Dev University", shortName: "GNDU Amritsar", acronyms: ["gndu"], city: "Amritsar", state: "Punjab", lat: 31.6360, lng: 74.8250, category: "Delhi NCR", tags: ["punjab", "state university"] },
    { id: "kurukshetra-univ", name: "Kurukshetra University", shortName: "Kurukshetra University (KUK)", acronyms: ["kuk"], city: "Kurukshetra", state: "Haryana", lat: 29.9678, lng: 76.8197, category: "Delhi NCR", tags: ["haryana"] },

    // === BENGALURU, KARNATAKA & SOUTH ===
    { id: "christ-university-blr", name: "Christ (Deemed to be University)", shortName: "Christ University (Hosur Rd)", acronyms: ["christ", "christ university"], city: "Bengaluru", state: "Karnataka", lat: 12.9344, lng: 77.6060, category: "Bangalore & South", tags: ["arts", "commerce", "bangalore"] },
    { id: "rvce-bangalore", name: "R.V. College of Engineering", shortName: "RVCE Bengaluru (Mysore Rd)", acronyms: ["rvce", "rv college"], city: "Bengaluru", state: "Karnataka", lat: 12.9238, lng: 77.4987, category: "Bangalore & South", tags: ["engineering", "bangalore"] },
    { id: "bmsce-bangalore", name: "B.M.S. College of Engineering", shortName: "BMSCE Bengaluru (Basavanagudi)", acronyms: ["bmsce", "bms college"], city: "Bengaluru", state: "Karnataka", lat: 12.9416, lng: 77.5658, category: "Bangalore & South", tags: ["engineering", "bangalore"] },
    { id: "pes-university-blr", name: "PES University (RR Campus)", shortName: "PES University (Banashankari)", acronyms: ["pes", "pesit"], city: "Bengaluru", state: "Karnataka", lat: 12.9344, lng: 77.5345, category: "Bangalore & South", tags: ["engineering", "bangalore"] },
    { id: "msrit-bangalore", name: "Ramaiah Institute of Technology", shortName: "MSRIT Bengaluru (M S Ramaiah)", acronyms: ["msrit", "ramaiah"], city: "Bengaluru", state: "Karnataka", lat: 13.0315, lng: 77.5647, category: "Bangalore & South", tags: ["engineering", "bangalore"] },
    { id: "dsce-bangalore", name: "Dayananda Sagar College of Engineering", shortName: "DSCE Bengaluru (Kumaraswamy)", acronyms: ["dsce", "dayananda sagar"], city: "Bengaluru", state: "Karnataka", lat: 12.9090, lng: 77.5663, category: "Bangalore & South", tags: ["engineering", "bangalore"] },
    { id: "manipal-mahe", name: "Manipal Academy of Higher Education", shortName: "MAHE Manipal (Main Campus)", acronyms: ["manipal", "mahe", "mit manipal"], city: "Manipal", state: "Karnataka", lat: 13.3525, lng: 74.7928, category: "Bangalore & South", tags: ["medical", "engineering", "manipal"] },
    { id: "vtu-belagavi", name: "Visvesvaraya Technological University", shortName: "VTU Belagavi (Jnana Sangama)", acronyms: ["vtu"], city: "Belagavi", state: "Karnataka", lat: 15.8943, lng: 74.5208, category: "Bangalore & South", tags: ["engineering", "karnataka"] },
    { id: "nie-mysore", name: "The National Institute of Engineering", shortName: "NIE Mysore", acronyms: ["nie mysore"], city: "Mysuru", state: "Karnataka", lat: 12.2842, lng: 76.6416, category: "Bangalore & South", tags: ["engineering", "mysore"] },
    { id: "anna-university", name: "Anna University (CEG Guindy Campus)", shortName: "Anna University Chennai", acronyms: ["anna university", "ceg"], city: "Chennai", state: "Tamil Nadu", lat: 13.0118, lng: 80.2362, category: "Bangalore & South", tags: ["engineering", "chennai"] },
    { id: "vit-vellore", name: "Vellore Institute of Technology", shortName: "VIT Vellore (Main Campus)", acronyms: ["vit", "vit vellore"], city: "Vellore", state: "Tamil Nadu", lat: 12.9698, lng: 79.1559, category: "Bangalore & South", tags: ["engineering", "vit"] },
    { id: "vit-chennai", name: "VIT Chennai Campus (Vandalur)", shortName: "VIT Chennai", acronyms: ["vit chennai"], city: "Chennai", state: "Tamil Nadu", lat: 12.8406, lng: 80.1534, category: "Bangalore & South", tags: ["engineering", "chennai"] },
    { id: "srm-ktr", name: "SRM Institute of Science and Technology", shortName: "SRM Kattankulathur (Main Campus)", acronyms: ["srm", "srm ktr"], city: "Chennai", state: "Tamil Nadu", lat: 12.8230, lng: 80.0444, category: "Bangalore & South", tags: ["engineering", "chennai"] },
    { id: "loyola-chennai", name: "Loyola College Chennai (Autonomous)", shortName: "Loyola College (Nungambakkam)", acronyms: ["loyola", "loyola chennai"], city: "Chennai", state: "Tamil Nadu", lat: 13.0643, lng: 80.2343, category: "Bangalore & South", tags: ["arts", "commerce", "chennai"] },
    { id: "mcc-chennai", name: "Madras Christian College (MCC)", shortName: "MCC Chennai (Tambaram)", acronyms: ["mcc", "madras christian"], city: "Chennai", state: "Tamil Nadu", lat: 12.9238, lng: 80.1238, category: "Bangalore & South", tags: ["arts", "science", "chennai"] },
    { id: "psg-tech-cbe", name: "PSG College of Technology Coimbatore", shortName: "PSG Tech Coimbatore (Peelamedu)", acronyms: ["psg tech", "psg"], city: "Coimbatore", state: "Tamil Nadu", lat: 11.0247, lng: 77.0028, category: "Bangalore & South", tags: ["engineering", "coimbatore"] },
    { id: "sastra-thanjavur", name: "SASTRA Deemed University", shortName: "SASTRA University (Thanjavur)", acronyms: ["sastra"], city: "Thanjavur", state: "Tamil Nadu", lat: 10.7280, lng: 79.0150, category: "Bangalore & South", tags: ["engineering", "tamil nadu"] },
    { id: "amrita-coimbatore", name: "Amrita Vishwa Vidyapeetham", shortName: "Amrita Coimbatore (Ettimadai)", acronyms: ["amrita", "amrita university"], city: "Coimbatore", state: "Tamil Nadu", lat: 10.9027, lng: 76.9006, category: "Bangalore & South", tags: ["engineering", "coimbatore"] },
    { id: "osmania-university", name: "Osmania University Hyderabad", shortName: "Osmania University (Tarnaka)", acronyms: ["ou", "osmania"], city: "Hyderabad", state: "Telangana", lat: 17.4138, lng: 78.5284, category: "Bangalore & South", tags: ["university", "hyderabad"] },
    { id: "jntu-hyderabad", name: "Jawaharlal Nehru Technological University Hyderabad", shortName: "JNTU Hyderabad (Kukatpally)", acronyms: ["jntuh", "jntu"], city: "Hyderabad", state: "Telangana", lat: 17.4933, lng: 78.3914, category: "Bangalore & South", tags: ["engineering", "hyderabad"] },
    { id: "hcu-hyderabad", name: "University of Hyderabad", shortName: "HCU Hyderabad (Gachibowli)", acronyms: ["hcu", "uohyd"], city: "Hyderabad", state: "Telangana", lat: 17.4600, lng: 78.3300, category: "Bangalore & South", tags: ["central university", "hyderabad"] },
    { id: "cbit-hyderabad", name: "Chaitanya Bharathi Institute of Technology", shortName: "CBIT Hyderabad (Gandipet)", acronyms: ["cbit", "cbit hyderabad"], city: "Hyderabad", state: "Telangana", lat: 17.3918, lng: 78.3194, category: "Bangalore & South", tags: ["engineering", "hyderabad"] },
    { id: "andhra-university", name: "Andhra University Visakhapatnam", shortName: "Andhra University (AU Vizag)", acronyms: ["au", "andhra university"], city: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.7289, lng: 83.3225, category: "Bangalore & South", tags: ["university", "vizag"] },
    { id: "cet-trivandrum", name: "College of Engineering Trivandrum", shortName: "CET Thiruvananthapuram", acronyms: ["cet", "cet trivandrum"], city: "Thiruvananthapuram", state: "Kerala", lat: 8.5458, lng: 76.9063, category: "Bangalore & South", tags: ["engineering", "kerala"] },
    { id: "cusat-kochi", name: "Cochin University of Science and Technology", shortName: "CUSAT Kochi (Kalamassery)", acronyms: ["cusat"], city: "Kochi", state: "Kerala", lat: 10.0435, lng: 76.3262, category: "Bangalore & South", tags: ["science", "tech", "kochi"] },

    // === EAST, CENTRAL & REST OF INDIA ===
    { id: "jadavpur-university", name: "Jadavpur University Kolkata", shortName: "Jadavpur University (JU)", acronyms: ["ju", "jadavpur"], city: "Kolkata", state: "West Bengal", lat: 22.4989, lng: 88.3718, category: "East & Central", tags: ["engineering", "arts", "kolkata"] },
    { id: "calcutta-university", name: "University of Calcutta", shortName: "Calcutta University (College St)", acronyms: ["cu", "calcutta university"], city: "Kolkata", state: "West Bengal", lat: 22.5739, lng: 88.3638, category: "East & Central", tags: ["heritage", "kolkata"] },
    { id: "presidency-kolkata", name: "Presidency University Kolkata", shortName: "Presidency University (College St)", acronyms: ["presidency", "presidency college"], city: "Kolkata", state: "West Bengal", lat: 22.5756, lng: 88.3632, category: "East & Central", tags: ["heritage", "kolkata"] },
    { id: "st-xaviers-kolkata", name: "St. Xavier's College Kolkata", shortName: "St. Xavier's (Park Street)", acronyms: ["xaviers kolkata"], city: "Kolkata", state: "West Bengal", lat: 22.5488, lng: 88.3582, category: "East & Central", tags: ["commerce", "kolkata"] },
    { id: "iiest-shibpur", name: "Indian Institute of Engineering Science and Technology", shortName: "IIEST Shibpur (Howrah)", acronyms: ["iiest", "besu", "shibpur"], city: "Howrah", state: "West Bengal", lat: 22.5552, lng: 88.3060, category: "East & Central", tags: ["engineering", "bengal"] },
    { id: "bhu-varanasi", name: "Banaras Hindu University", shortName: "BHU Varanasi (Main Campus)", acronyms: ["bhu", "banaras hindu university"], city: "Varanasi", state: "Uttar Pradesh", lat: 25.2677, lng: 82.9913, category: "East & Central", tags: ["central university", "heritage"] },
    { id: "amu-aligarh", name: "Aligarh Muslim University", shortName: "AMU Aligarh", acronyms: ["amu"], city: "Aligarh", state: "Uttar Pradesh", lat: 27.9150, lng: 78.0770, category: "East & Central", tags: ["central university", "up"] },
    { id: "lucknow-university", name: "University of Lucknow", shortName: "Lucknow University (Badshah Bagh)", acronyms: ["lu", "lucknow university"], city: "Lucknow", state: "Uttar Pradesh", lat: 26.8653, lng: 80.9388, category: "East & Central", tags: ["university", "lucknow"] },
    { id: "aktu-lucknow", name: "Dr. A.P.J. Abdul Kalam Technical University", shortName: "AKTU Lucknow (UPTU)", acronyms: ["aktu", "uptu"], city: "Lucknow", state: "Uttar Pradesh", lat: 26.9142, lng: 80.9482, category: "East & Central", tags: ["engineering", "lucknow"] },
    { id: "hbtu-kanpur", name: "Harcourt Butler Technical University", shortName: "HBTU Kanpur (Nawabganj)", acronyms: ["hbtu", "hbti"], city: "Kanpur", state: "Uttar Pradesh", lat: 26.4950, lng: 80.3069, category: "East & Central", tags: ["engineering", "kanpur"] },
    { id: "allahabad-univ", name: "University of Allahabad", shortName: "Allahabad University (Central)", acronyms: ["au", "allahabad university"], city: "Prayagraj", state: "Uttar Pradesh", lat: 25.4600, lng: 81.8590, category: "East & Central", tags: ["central university", "up"] },
    { id: "patna-university", name: "Patna University", shortName: "Patna University (Ashok Rajpath)", acronyms: ["pu patna"], city: "Patna", state: "Bihar", lat: 25.6178, lng: 85.1706, category: "East & Central", tags: ["university", "bihar"] },
    { id: "bit-mesra", name: "Birla Institute of Technology Mesra", shortName: "BIT Mesra (Ranchi)", acronyms: ["bit mesra"], city: "Ranchi", state: "Jharkhand", lat: 23.4123, lng: 85.4399, category: "East & Central", tags: ["engineering", "ranchi"] },
    { id: "kiit-bhubaneswar", name: "Kalinga Institute of Industrial Technology", shortName: "KIIT University Bhubaneswar", acronyms: ["kiit"], city: "Bhubaneswar", state: "Odisha", lat: 20.3547, lng: 85.8197, category: "East & Central", tags: ["private", "odisha"] },
    { id: "soa-bhubaneswar", name: "Siksha 'O' Anusandhan Deemed University", shortName: "SOA University Bhubaneswar", acronyms: ["soa"], city: "Bhubaneswar", state: "Odisha", lat: 20.2970, lng: 85.7928, category: "East & Central", tags: ["private", "odisha"] },
    { id: "gauhati-university", name: "Gauhati University", shortName: "Gauhati University (Jalukbari)", acronyms: ["gu", "gauhati university"], city: "Guwahati", state: "Assam", lat: 26.1554, lng: 91.6622, category: "East & Central", tags: ["assam", "northeast"] },
    { id: "tezpur-university", name: "Tezpur University", shortName: "Tezpur University (Napaam)", acronyms: ["tu", "tezpur university"], city: "Tezpur", state: "Assam", lat: 26.7006, lng: 92.8306, category: "East & Central", tags: ["central university", "assam"] },
    { id: "goa-university", name: "Goa University", shortName: "Goa University (Taleigao Plateau)", acronyms: ["gu goa", "goa university"], city: "Taleigao", state: "Goa", lat: 15.4578, lng: 73.8344, category: "Mumbai & Pune", tags: ["university", "goa"] },
    { id: "iim-ahmedabad", name: "Indian Institute of Management Ahmedabad", shortName: "IIM Ahmedabad (Vastrapur)", acronyms: ["iima", "iim ahmedabad"], city: "Ahmedabad", state: "Gujarat", lat: 23.0336, lng: 72.5323, category: "IIT / Premier", tags: ["management", "iim"] },
    { id: "iim-bangalore", name: "Indian Institute of Management Bangalore", shortName: "IIM Bangalore (Bannerghatta)", acronyms: ["iimb", "iim bangalore"], city: "Bengaluru", state: "Karnataka", lat: 12.8984, lng: 77.5996, category: "IIT / Premier", tags: ["management", "iim"] },
    { id: "iim-calcutta", name: "Indian Institute of Management Calcutta", shortName: "IIM Calcutta (Joka)", acronyms: ["iimc", "iim calcutta", "joka"], city: "Kolkata", state: "West Bengal", lat: 22.4414, lng: 88.3075, category: "IIT / Premier", tags: ["management", "iim"] },

    // === COACHING HUBS & STUDENT/PG RESIDENTIAL DISTRICTS ===
    { id: "hub-kota-indraprastha", name: "Kota Coaching Hub (Indraprastha & Mahaveer Nagar)", shortName: "Kota Coaching Hub", acronyms: ["kota", "allen kota", "resonance", "indraprastha"], city: "Kota", state: "Rajasthan", lat: 25.1388, lng: 75.8407, category: "Coaching & Student Hubs", tags: ["jee", "neet", "coaching", "hostel", "pg", "kota"] },
    { id: "hub-delhi-mukherjee-nagar", name: "Mukherjee Nagar UPSC & Student District", shortName: "Mukherjee Nagar (Delhi)", acronyms: ["mukherjee nagar", "drishti ias", "upsc hub"], city: "New Delhi", state: "Delhi NCR", lat: 28.7118, lng: 77.2155, category: "Coaching & Student Hubs", tags: ["upsc", "ssc", "delhi", "pg", "student hub"] },
    { id: "hub-delhi-rajinder-nagar", name: "Old Rajinder Nagar Civil Services Hub", shortName: "Rajinder Nagar (Delhi)", acronyms: ["rajinder nagar", "vajiram", "upsc delhi"], city: "New Delhi", state: "Delhi NCR", lat: 28.6415, lng: 77.1825, category: "Coaching & Student Hubs", tags: ["upsc", "civil services", "delhi", "pg"] },
    { id: "hub-delhi-kalu-sarai", name: "Kalu Sarai & Hauz Khas IIT-JEE Coaching Hub", shortName: "Kalu Sarai (IIT Hub)", acronyms: ["kalu sarai", "fiitjee", "hauz khas"], city: "New Delhi", state: "Delhi NCR", lat: 28.5444, lng: 77.2026, category: "Coaching & Student Hubs", tags: ["jee", "coaching", "delhi", "pg"] },
    { id: "hub-blr-koramangala", name: "Koramangala Student & Tech Neighborhood", shortName: "Koramangala (Bengaluru)", acronyms: ["koramangala", "sony world", "blr pg"], city: "Bengaluru", state: "Karnataka", lat: 12.9352, lng: 77.6245, category: "Coaching & Student Hubs", tags: ["bangalore", "pg", "students", "tech"] },
    { id: "hub-blr-btm", name: "BTM Layout Student & PG Cluster", shortName: "BTM Layout (Bengaluru)", acronyms: ["btm", "btm layout"], city: "Bengaluru", state: "Karnataka", lat: 12.9166, lng: 77.6101, category: "Coaching & Student Hubs", tags: ["bangalore", "pg", "students"] },
    { id: "hub-pune-kothrud", name: "Kothrud Student & College Neighborhood", shortName: "Kothrud (Pune)", acronyms: ["kothrud", "mit kothrud"], city: "Pune", state: "Maharashtra", lat: 18.5074, lng: 73.8077, category: "Coaching & Student Hubs", tags: ["pune", "hostel", "pg", "students"] },
    { id: "hub-hyd-ameerpet", name: "Ameerpet IT Training & Student District", shortName: "Ameerpet (Hyderabad)", acronyms: ["ameerpet", "ameerpet hub"], city: "Hyderabad", state: "Telangana", lat: 17.4375, lng: 78.4482, category: "Coaching & Student Hubs", tags: ["it coaching", "hyderabad", "pg"] },
    { id: "hub-patna-boring-rd", name: "Boring Road Coaching & Student District", shortName: "Boring Road (Patna)", acronyms: ["boring road", "patna coaching"], city: "Patna", state: "Bihar", lat: 25.6178, lng: 85.1206, category: "Coaching & Student Hubs", tags: ["patna", "coaching", "bihar"] }
  ];

  /**
   * High-Precision In-Memory Multi-Token & Acronym Search
   */
  function searchCampuses(query, limit = 25) {
    if (!query || !query.trim()) {
      return INDIAN_CAMPUSES.slice(0, limit);
    }
    const cleanQ = query.trim().toLowerCase();
    const qTokens = cleanQ.split(/\s+/).filter(Boolean);

    const scored = INDIAN_CAMPUSES.map((campus) => {
      let score = 0;
      const cName = campus.name.toLowerCase();
      const cShort = campus.shortName.toLowerCase();
      const cCity = (campus.city || "").toLowerCase();
      const cState = (campus.state || "").toLowerCase();
      const cAcronyms = (campus.acronyms || []).map((a) => a.toLowerCase());
      const cTags = (campus.tags || []).map((t) => t.toLowerCase());

      // Exact Acronym match gets the highest priority
      if (cAcronyms.includes(cleanQ)) {
        score += 200;
      } else if (cAcronyms.some((a) => a.startsWith(cleanQ))) {
        score += 120;
      }

      // Exact short name match
      if (cShort === cleanQ) {
        score += 150;
      }

      // Name or shortName starts with query
      if (cName.startsWith(cleanQ) || cShort.startsWith(cleanQ)) {
        score += 90;
      }

      // City or State exact match
      if (cCity === cleanQ) {
        score += 70;
      }

      // Token matching
      qTokens.forEach((tok) => {
        if (cAcronyms.some((a) => a.includes(tok))) score += 45;
        if (cShort.includes(tok)) score += 35;
        if (cName.includes(tok)) score += 25;
        if (cCity.includes(tok)) score += 20;
        if (cState.includes(tok)) score += 15;
        if (cTags.some((t) => t.includes(tok))) score += 10;
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
   * Filter Campuses by Category Tab
   */
  function getCampusesByCategory(category = "all", limit = 35) {
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
      if (category === "hubs" || category === "coaching") {
        return c.category === "Coaching & Student Hubs";
      }
      return (c.category || "").toLowerCase().includes(category.toLowerCase());
    }).slice(0, limit);
  }

  /**
   * Find Nearest Pre-Seeded Campus by Coordinates
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
   * Find Multiple Nearest Pre-Seeded Campuses by Coordinates (sorted by proximity)
   */
  function findNearestCampuses(lat, lng, limit = 3) {
    if (typeof lat !== "number" || typeof lng !== "number") return [];

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

    return INDIAN_CAMPUSES
      .map((c) => ({
        ...c,
        distanceMeters: Math.round(haversine(lat, lng, c.lat, c.lng))
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);
  }

  /**
   * Multi-Engine Live Pan-India College Search Pipeline:
   * 1. First tries backend proxy /api/campuses/search?q=... (bypasses CORS & rate limits)
   * 2. Concurrently queries Photon API (https://photon.komoot.io) with Indian bounding box
   * 3. Queries Nominatim directly as fallback
   */
  async function searchLiveIndianColleges(query) {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim();

    // 1. Try backend proxy
    try {
      const backendUrl = `/api/campuses/search?q=${encodeURIComponent(q)}`;
      const bResp = await fetch(backendUrl);
      if (bResp.ok) {
        const bData = await bResp.json();
        if (bData && bData.results && bData.results.length > 0) {
          return bData.results;
        }
      }
    } catch (e) {
      // Backend momentarily offline or local static mode
    }

    // 2. Try Photon API (OpenStreetMap ElasticSearch with high rate limit & typo tolerance)
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q + ' college')}&limit=10&bbox=68.1,8.0,97.4,37.1`;
      const pResp = await fetch(photonUrl);
      if (pResp.ok) {
        const pData = await pResp.json();
        const features = pData.features || [];
        if (features.length > 0) {
          return features.map((feat, idx) => {
            const props = feat.properties || {};
            const coords = feat.geometry?.coordinates || [];
            const name = props.name || props.city || q;
            const city = props.city || props.district || props.county || props.state || "India";
            const stateName = props.state || "India";
            return {
              id: `photon-${props.osm_id || idx}`,
              name: `${name}, ${city}, ${stateName}`,
              shortName: name,
              city: city,
              state: stateName,
              lat: coords[1],
              lng: coords[0],
              category: "Live Map Campus",
              isLiveGeocoded: true
            };
          });
        }
      }
    } catch (pe) {}

    // 3. Direct Nominatim fallback without restrictive query suffixes
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in&limit=10&addressdetails=1`;
      const nResp = await fetch(nomUrl, { headers: { "Accept-Language": "en" } });
      if (nResp.ok) {
        const nData = await nResp.json();
        return (nData || []).map((r, idx) => {
          const addr = r.address || {};
          const city = addr.city || addr.town || addr.county || addr.suburb || "India";
          const stateName = addr.state || "India";
          const short = (r.display_name || "").split(",")[0].strip ? (r.display_name || "").split(",")[0].trim() : (r.display_name || "").split(",")[0];
          return {
            id: `nom-${r.place_id || idx}`,
            name: r.display_name,
            shortName: short,
            city: city,
            state: stateName,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            category: "Live Map Campus",
            isLiveGeocoded: true
          };
        });
      }
    } catch (ne) {}

    return [];
  }

  // Export to global scope
  window.IndianCampuses = {
    CAMPUSES: INDIAN_CAMPUSES,
    searchCampuses,
    getCampusesByCategory,
    findNearestCampus,
    findNearestCampuses,
    searchLiveIndianColleges
  };
})(window);

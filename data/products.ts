
import { Product, Review } from '../types';

// Review author pools for variety
const authors = [
  "Julian V.", "Elena S.", "Marcus K.", "Sophia L.", "Oliver T.", "Mia W.",
  "Noah H.", "Isabella R.", "James M.", "Charlotte F.", "Liam D.", "Amelia B.",
  "Benjamin C.", "Harper N.", "Lucas P.", "Evelyn G.", "Henry A.", "Abigail J."
];

const dates = [
  "January 5, 2025", "January 18, 2025", "February 2, 2025", "December 15, 2024",
  "November 28, 2024", "October 20, 2024", "January 25, 2025", "February 10, 2025"
];

// Generate unique reviews for a product based on its characteristics
const generateReviews = (productId: string, category: string): Review[] => {
  const templates: Record<string, string[]> = {
    'Outerwear': [
      "Keeps me warm without feeling bulky. The fit is spot-on.",
      "Easily the best coat I've owned. Worth every penny.",
      "The silhouette is incredibly flattering. Receive compliments every time.",
    ],
    'Basics': [
      "This is now my go-to everyday piece. Simple but elevated.",
      "The quality blew me away — way better than I expected.",
      "Finally, basics that don't feel basic. Perfect fit.",
    ],
    'Accessories': [
      "The finishing touch my wardrobe was missing.",
      "Exquisite craftsmanship. You can feel the quality.",
      "Gets noticed every time. Pairs with everything.",
    ],
    'Home': [
      "Elevated my entire space. Guests always comment on it.",
      "A statement piece that doesn't feel aggressive. Perfect balance.",
      "The quality is evident. Worth the investment.",
    ],
    'Apparel': [
      "The fit is immaculate. Tailoring that actually delivers.",
      "Comfortable enough for all day, sharp enough for meetings.",
      "This is what I expected from a premium piece. No regrets.",
    ],
    'Footwear': [
      "Comfortable from day one — no break-in needed.",
      "The craftsmanship is visible in every stitch.",
      "These get better with age. A true investment.",
    ],
  };

  const pool = templates[category] || templates['Apparel'];
  const reviewCount = 2 + (parseInt(productId) % 2); // 2-3 reviews per product
  
  return pool.slice(0, reviewCount).map((text, idx) => ({
    id: `r${productId}-${idx}`,
    product_id: productId,
    author: authors[(parseInt(productId) * 3 + idx) % authors.length],
    rating: 4 + (((parseInt(productId) + idx) % 3) > 0 ? 1 : 0), // 4 or 5 stars
    date: dates[(parseInt(productId) + idx) % dates.length],
    text
  }));
};

export const productsData: Product[] = [
  {
    id: "1",
    name: "Standard Wool Overcoat",
    price: 850,
    bottom_price: 600,
    category: "Outerwear",
    description: "A timeless silhouette crafted from Italian virgin wool. Sharp shoulders and a modern drape for the architectural wardrobe.",
    image_url: "https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?q=80&w=800&auto=format&fit=crop",
    tags: ["winter", "formal", "essential"],
    reviews: generateReviews("1", "Outerwear")
  },
  {
    id: "2",
    name: "Heavyweight Boxy Tee",
    price: 95,
    bottom_price: 45,
    category: "Basics",
    description: "Structured 300gsm cotton tee with a slightly cropped fit. A sculptural take on an everyday staple.",
    image_url: "https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop",
    tags: ["summer", "casual", "staple"],
    reviews: generateReviews("2", "Basics")
  },
  {
    id: "3",
    name: "Nappa Leather Tote",
    price: 1200,
    bottom_price: 900,
    category: "Accessories",
    description: "Supple lambskin leather with hand-painted edges. Minimalist geometry designed for high-frequency travel.",
    image_url: "https://images.unsplash.com/photo-1547949003-9792a18a2601?q=80&w=800&auto=format&fit=crop",
    tags: ["luxury", "leather", "travel"],
    reviews: generateReviews("3", "Accessories")
  },
  {
    id: "4",
    name: "Ceramic Sculpture Vase",
    price: 320,
    bottom_price: 210,
    category: "Home",
    description: "Matte finish stoneware with a brutalist silhouette. Each piece is hand-thrown by artisans in Copenhagen.",
    image_url: "https://images.unsplash.com/photo-1580136579312-94651dfd596d?q=80&w=800&auto=format&fit=crop",
    tags: ["interior", "art", "minimalist"],
    reviews: generateReviews("4", "Home")
  },
  {
    id: "5",
    name: "Pleated Tapered Trousers",
    price: 450,
    bottom_price: 300,
    category: "Apparel",
    description: "High-waisted wool trousers with sharp double pleats. An exercise in precision tailoring for the modern professional.",
    image_url: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?q=80&w=800&auto=format&fit=crop",
    tags: ["formal", "tailoring", "office"],
    reviews: generateReviews("5", "Apparel")
  },
  {
    id: "6",
    name: "Silver Signet Ring",
    price: 210,
    bottom_price: 150,
    category: "Accessories",
    description: "Solid 925 sterling silver. Hand-polished to a mirror finish with a weighted, structural feel.",
    image_url: "https://images.unsplash.com/photo-1611591437281-460bfbe15705?q=80&w=800&auto=format&fit=crop",
    tags: ["jewelry", "essential", "gift"],
    reviews: generateReviews("6", "Accessories")
  },
  {
    id: "7",
    name: "Merino Knit Polo",
    price: 280,
    bottom_price: 180,
    category: "Apparel",
    description: "Ultra-fine merino wool in a rich midnight navy. Breathable yet insulating with a soft, textural hand.",
    image_url: "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?q=80&w=800&auto=format&fit=crop",
    tags: ["knitwear", "casual", "luxury"],
    reviews: generateReviews("7", "Apparel")
  },
  {
    id: "8",
    name: "Architectural Table Lamp",
    price: 650,
    bottom_price: 450,
    category: "Home",
    description: "Brushed aluminum and frosted glass. Inspired by mid-century industrial design with a soft ambient glow.",
    image_url: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?q=80&w=800&auto=format&fit=crop",
    tags: ["lighting", "modern", "decor"],
    reviews: generateReviews("8", "Home")
  },
  {
    id: "9",
    name: "Raw Denim Jacket",
    price: 390,
    bottom_price: 250,
    category: "Outerwear",
    description: "14oz Japanese selvedge denim. Designed to develop a unique patina through high-contrast wear.",
    image_url: "https://images.unsplash.com/photo-1576905307837-59ac50a49de1?q=80&w=800&auto=format&fit=crop",
    tags: ["casual", "heritage", "rugged"],
    reviews: generateReviews("9", "Outerwear")
  },
  {
    id: "10",
    name: "Chelsea Boots in Suede",
    price: 520,
    bottom_price: 380,
    category: "Footwear",
    description: "Premium calf suede with a durable Goodyear welt. Hand-crafted in Portugal with a sharp, elongated toe.",
    image_url: "https://images.unsplash.com/photo-1638247025967-b4e38f787b76?q=80&w=800&auto=format&fit=crop",
    tags: ["shoes", "formal", "classic"],
    reviews: generateReviews("10", "Footwear")
  },
  {
    id: "11",
    name: "Cashmere Travel Blanket",
    price: 890,
    bottom_price: 650,
    category: "Home",
    description: "Pure Inner Mongolian cashmere. The ultimate luxury for long-haul journeys and quiet nights.",
    image_url: "https://images.unsplash.com/photo-1528906819430-0a557348d883?q=80&w=800&auto=format&fit=crop",
    tags: ["luxury", "home", "travel"],
    reviews: generateReviews("11", "Home")
  },
  {
    id: "12",
    name: "Oxford Button-Down",
    price: 165,
    bottom_price: 110,
    category: "Basics",
    description: "A crisp, heavy-duty oxford shirt. Pre-washed for a soft handle with a perfect roll collar.",
    image_url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=800&auto=format&fit=crop",
    tags: ["office", "casual", "staple"],
    reviews: generateReviews("12", "Basics")
  },
  {
    id: "13",
    name: "Geometric Wool Rug",
    price: 2400,
    bottom_price: 1800,
    category: "Home",
    description: "Hand-knotted 100% New Zealand wool. Featuring a subtle monochromatic pattern for textural depth.",
    image_url: "https://images.unsplash.com/photo-1600166898405-da9535204843?q=80&w=800&auto=format&fit=crop",
    tags: ["interior", "large", "premium"],
    reviews: generateReviews("13", "Home")
  },
  {
    id: "14",
    name: "Minimalist Leather Watch",
    price: 480,
    bottom_price: 320,
    category: "Accessories",
    description: "Swiss movement with a sapphire crystal face. Vegetable-tanned leather strap with raw edges.",
    image_url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800&auto=format&fit=crop",
    tags: ["timeless", "functional", "accessory"],
    reviews: generateReviews("14", "Accessories")
  },
  {
    id: "15",
    name: "Down-Filled Puffer",
    price: 750,
    bottom_price: 500,
    category: "Outerwear",
    description: "Water-repellent nylon shell with 800-fill power down. Extreme warmth with a technical matte finish.",
    image_url: "https://images.unsplash.com/photo-1544923246-77307dd654ca?q=80&w=800&auto=format&fit=crop",
    tags: ["winter", "technical", "performance"],
    reviews: generateReviews("15", "Outerwear")
  },
  {
    id: "16",
    name: "Leather Loafers",
    price: 450,
    bottom_price: 310,
    category: "Footwear",
    description: "Polished cordovan leather. A slip-on classic for transitioning from day to evening.",
    image_url: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?q=80&w=800&auto=format&fit=crop",
    tags: ["shoes", "smart", "evening"],
    reviews: generateReviews("16", "Footwear")
  },
  {
    id: "17",
    name: "Graphic Print Silk Scarf",
    price: 185,
    bottom_price: 120,
    category: "Accessories",
    description: "100% mulberry silk. Featuring an abstract original print for a refined focal point.",
    image_url: "https://images.unsplash.com/photo-1584030373081-f37b7bb4fa82?q=80&w=800&auto=format&fit=crop",
    tags: ["color", "art", "gift"],
    reviews: generateReviews("17", "Accessories")
  },
  {
    id: "18",
    name: "Concrete Coffee Table",
    price: 1800,
    bottom_price: 1400,
    category: "Home",
    description: "Industrial concrete cast with a smooth wax finish. A statement of pure form and weight.",
    image_url: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=800&auto=format&fit=crop",
    tags: ["furniture", "modern", "brutalist"],
    reviews: generateReviews("18", "Home")
  },
  {
    id: "19",
    name: "Shearling Aviator Jacket",
    price: 2800,
    bottom_price: 2100,
    category: "Outerwear",
    description: "The peak of luxury outerwear. Thick shearling lining with a rugged, cracked leather exterior.",
    image_url: "https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?q=80&w=800&auto=format&fit=crop",
    tags: ["luxury", "winter", "statement"],
    reviews: generateReviews("19", "Outerwear")
  },
  {
    id: "20",
    name: "Linen Lounge Set",
    price: 340,
    bottom_price: 240,
    category: "Basics",
    description: "Relaxed fit linen shirt and shorts. Designed for effortless cooling in high summer.",
    image_url: "https://images.unsplash.com/photo-1594932224828-b4b05a815032?q=80&w=800&auto=format&fit=crop",
    tags: ["summer", "casual", "relaxed"],
    reviews: generateReviews("20", "Basics")
  }
];

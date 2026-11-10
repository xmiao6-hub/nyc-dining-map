const PLACE_ICON_ATTR =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

const PLACE_CATS = [
  {
    key: 'bagel',
    label: 'Bagel shop',
    color: '#e0a458',
    re: /bagel|beigel/,
    icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.7"/><path d="M9.5 6.6l.9.5M14.4 7.2l.9-.5M6.4 13.6l1 .4M16.6 14l1-.4"/>',
  },
  {
    key: 'coffee',
    label: 'Coffee & tea',
    color: '#a9714c',
    re: /coffee|caf[eé]|caff[eè]|caff[eé]|espresso|latte|cappuccino|capuccino|roaster|roastery|java|barista|bubble ?tea|boba|matcha|tea ?house|juice|smoothie|butter ?and ?bee/,
    icon: '<path d="M4 9h12v5.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M16 10.5h1.8a2.4 2.4 0 0 1 0 4.8H16"/><path d="M7.5 3c-.7 1 .7 1.6 0 2.6M11.5 3c-.7 1 .7 1.6 0 2.6"/>',
  },
  {
    key: 'icecream',
    label: 'Ice cream & gelato',
    color: '#f26d9a',
    re: /ice ?cream|icecream|gelato|gelateria|sundae|cremeria|crema|sorbet|frozen yogurt|yogurt|soft ?serve|baskin|sweet ?shop/,
    icon: '<path d="M8.4 10.8 12 21l3.6-10.2"/><path d="M8.4 10.8a3.6 3.6 0 0 1 .6-6.3 3.7 3.7 0 0 1 6.5.9 3.4 3.4 0 0 1-1.1 5.4z"/>',
  },
  {
    key: 'burger',
    label: 'Burgers & dogs',
    color: '#f0a500',
    re: /burger|hamburger|smash|patty|whopper|hot ?dog|frank|wiener|pretzel|cheesesteak|slagel/, 
    icon: '<path d="M4 9.5a8 8 0 0 1 16 0z"/><path d="M4.3 13h15.4"/><path d="M5 16.4h14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/>',
  },
  {
    key: 'pizza',
    label: 'Pizzeria',
    color: '#ff5d6c',
    re: /pizza|pizzeria|pzza|slice|focaccia|calzone|pepperoni/,
    icon: '<path d="M12 3 5.2 18.8a.9.9 0 0 0 1.1 1.2L12 18l5.7 2a.9.9 0 0 0 1.1-1.2z"/><circle cx="10.4" cy="12.4" r=".9"/><circle cx="13.6" cy="15.4" r=".9"/>',
  },
  {
    key: 'italian',
    label: 'Italian',
    color: '#57c07a',
    re: /italian|osteria|trattoria|ristorante|pasta|cucina|risotto|ravioli|lasagna|gnocchi|gnocco|polenta|mozzarella|prosciutto|locanda|vini|all'antico|antipasti|carbonara|bolognese|parmigiana|liberty ?towel/, 
    label: 'Salads & juice',
    color: '#2d9a52',
    re: /salad|sweetgreen|green ?kind|bowl|poke|vegan|vegetarian|acai|açaí|grain|greens/,
    icon: '<path d="M5 19c0-8 5.5-13 14-13 0 8-5 13.5-13 13.5"/><path d="M6.5 17.5c2.8-3.8 5.8-5.8 9.5-7.6"/>',
  },
  {
    key: 'bakery',
    label: 'Bakery',
    color: '#d9a35b',
    re: /baker|bakery|bakeries|bread|pain|brioche|croissant|donut|doughnut|pasticceria|pastry|pastries|cake|patisserie|forno|panaderia|tart|strudel|kouglof/,
    icon: '<path d="M4.5 11.5a4 4 0 0 1 4-4h7a4 4 0 0 1 4 4V18a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/><path d="M9 11.5V19M13.5 11.5V19"/>',
  },
  {
    key: 'latin',
    label: 'Latin American',
    color: '#2ec4b6',
    re: /taco|taquer|burrito|mexican|cantina|quesadilla|nacho|mole|charro|tortiller|aguas|elotes|arepa|empanada|ceviche|cebiche|peruvian|brazilian|colombian|dominican|guatemalan|salvadoran|mofongo|patacon|cuban|latina?/, 
    icon: '<path d="M3.5 15.5a8.5 8.5 0 0 1 17 0z"/><path d="M3 18.5h18"/>',
  },
  {
    key: 'asian',
    label: 'Asian kitchen',
    color: '#b388e0',
    re: /sushi|ramen|noodle|dumpling|bao|dim ?sum|thai|chinese|japanese|korean|vietnamese|pho|pad ?thai|udon|soba|teriyaki|hibachi|bento|wonton|hot ?pot|malatang|curry ?house|saimin|lo ?mein|gyoza|teppanyaki|kinza/,
    icon: '<path d="M4 12.5h16a8 8 0 0 1-16 0z"/><path d="M13.6 4.5l3.4 5.5M17.4 4.2l-2.6 5.8"/>',
  },
  {
    key: 'indian',
    label: 'Indian',
    color: '#ff8a5c',
    re: /indian|curry|tikka|tandoor|biryani|masala|dosa|naan|chaat|pakora|mutton ?spot/,
    icon: '<path d="M3 12h18"/><rect x="5.6" y="8.6" width="4.6" height="6.8" rx="1.4"/><rect x="13.8" y="8.6" width="4.6" height="6.8" rx="1.4"/>',
  },
  {
    key: 'middleeast',
    label: 'Middle Eastern',
    color: '#8fbf8e',
    re: /gyro|falafel|kebab|shawarma|halal|hummus|mezze|meze|middle ?east|lebanese|turkish|borek|bouza|falaffel|souvlaki|greek/,
    icon: '<path d="M7.5 3.5h9l2 13.5a3.5 3.5 0 0 1-3.5 3.5h-6a3.5 3.5 0 0 1-3.5-3.5z"/><path d="M7 9h10"/>',
  },
  {
    key: 'wine',
    label: 'Wine bar',
    color: '#c0392b',
    re: /wine|vino|vinaio|enoteca|vinoteca|prosecco|champagne|cava|sherry|sake ?bar/,
    icon: '<path d="M8 3h8l-.6 6.2a3.4 3.4 0 0 1-6.8 0z"/><path d="M12 15.4V20M9 20.4h6"/>',
  },
  {
    key: 'bar',
    label: 'Bar & brewery',
    color: '#4aa3ff',
    re: /\bbar\b|pub\b|tavern|taproom|tap ?room|brew|beer|ale\b|lounge|cocktail|distillery|saloon|dive\b|cellar|public ?house|whisky|whiskey|gin\b|sake\b/,
    icon: '<path d="M5.5 8.5h10.5v9.5a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2z"/><path d="M16 10.5h1.8a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H16"/><path d="M5.5 8.5a2.4 2.4 0 0 1 2.8-2.4 3 3 0 0 1 5 0 2.4 2.4 0 0 1 2.7 2.4"/>',
  },
  {
    key: 'brunch',
    label: 'Diner & brunch',
    color: '#ffd23f',
    re: /diner|brunch|breakfast|waffle|pancake|omelet|omelette|bacon|hash|griddle|panini|eggs?\b|toast|crepe|bagel ?shop/,
    icon: '<path d="M4.6 12.5h14.8"/><path d="M6 12.5a6 6 0 0 1 12 0"/><path d="M4.6 16.4h14.8"/>',
  },
  {
    key: 'deli',
    label: 'Deli & market',
    color: '#7c9a8e',
    re: /deli|grocer|market|bodega|gourmet|provision|cheese ?mong|food ?shop|butcher|candy|confection/,
    icon: '<path d="M5.5 8h13l-1 11.5h-11z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  },
  {
    key: 'seafood',
    label: 'Seafood',
    color: '#00b4d8',
    re: /seafood|oyster|crab|lobster|shrimp|clam|fish|tuna|salmon|cod|ceviche|poke ?bar/,
    icon: '<path d="M20 12c-2 3-5.6 5-8.6 5S4.8 15 3.8 12c1-3 4.6-5 7.6-5s6.6 2 8.6 5z"/><path d="M20 12l2.2-3.2v6.4z"/><circle cx="9" cy="11" r=".7"/>',
  },
  {
    key: 'grill',
    label: 'Grill & BBQ',
    color: '#e8712f',
    re: /steak|grill|bbq|barbecue|ribs|brasa|asado|churrasco|smoke|smokehouse|rotisserie|fried chicken|chicken\b|ribs/,
    icon: '<path d="M12 3.2c1 3-2 4.2-2 7a3 3 0 0 0 6 0c0-1-.4-2-1-2.9 2 1.1 4 3.1 4 6a7 7 0 0 1-14 0c0-4 4-6.1 7-10.1z"/>',
  },
];

const PLACE_DEFAULT = {
  key: 'dining',
  label: 'Outdoor dining',
  color: '#45c8ff',
  re: null,
  icon: '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10"/><path d="M16.5 3c-2.2 2-2.2 6.2 0 8.2V21"/>',
};

function classifyPlace(p) {
  const hay = ((p.name || '') + ' ' + (p.street || '') + ' ' + (p.city || '')).toLowerCase();
  for (const cat of PLACE_CATS) {
    if (cat.re.test(hay)) return cat;
  }
  return PLACE_DEFAULT;
}

function placeIconSvg(cat, size) {
  const px = size || 20;
  return (
    '<svg ' + PLACE_ICON_ATTR + ' width="' + px + '" height="' + px + '" aria-hidden="true">' + cat.icon + '</svg>'
  );
}

function googleMapsUrl(p) {
  const name = (p.name || '').trim();
  const street = (p.street || '').trim();
  const parts = [name, street].filter(Boolean).join(', ');
  if (parts.length > 3) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(parts + ', New York, NY');
  }
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.lat + ',' + p.lon);
}

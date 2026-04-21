/** Shared image URL builder & dictionaries for Unsplash cover/event images. */
const IMG = (id: string) =>
  `https://images.unsplash.com/photo-${id}?q=80&w=1200&auto=format&fit=crop`;

export { IMG };

export const IMAGE_BANK: Record<string, string[]> = {
  flight:   [IMG("1436491865332-7a61a109cc05"), IMG("1464037866556-6812c9d1c72e"), IMG("1559628377-4b107ed2bfbc"), IMG("1570710891163-6d3b5c47248b")],
  hotel:    [IMG("1551882547-ff40c63fe5fa"), IMG("1582719508461-905c673771fd"), IMG("1566073771259-6a8506099945"), IMG("1520250497591-112f2f40a3f4"), IMG("1542314831-068cd1dbfeeb")],
  safari:   [IMG("1516426122078-c23e76319801"), IMG("1547471080-7cc2caa01a7e"), IMG("1504701954957-2010ec3bcec1"), IMG("1534177616072-ef7dc120449d"), IMG("1523805009345-7448845a9e53")],
  beach:    [IMG("1512100356356-de1b84283e18"), IMG("1573843981267-be1999ff37cd"), IMG("1544551763-46a013bb70d5"), IMG("1507525428034-b723cf961d3e")],
  japan:    [IMG("1493976040374-85c8e12f0c0e"), IMG("1545569341-9eb8b30979d9"), IMG("1528360983277-13d401cdc186"), IMG("1540959733332-eab4deabeeaf")],
  dining:   [IMG("1414235077428-338989a2e8c0"), IMG("1555396273-367ea4eb4db5"), IMG("1559339352-11d035aa65de"), IMG("1504674900247-0877df9cc836")],
  activity: [IMG("1527631746610-bca00a040d60"), IMG("1551632811-561732d1e306"), IMG("1564760055775-d63b17a55c44"), IMG("1517649763962-0c623066013b")],
  mountain: [IMG("1531366936337-7c912a4589a7"), IMG("1506905925346-21bda4d32df4"), IMG("1464822759023-fed622ff2c3b")],
  city:     [IMG("1496442226666-8d4d0e62e6e9"), IMG("1477959858617-67f85cf4f1df"), IMG("1534430480872-3498386e7856")],
  italy:    [IMG("1680454769871-f58768c6187b"), IMG("1516483638261-f4dbaf036963")],
  bali:     [IMG("1537996194471-e657df975ab4"), IMG("1518548419970-58e3b4079ab2")],
};

export const COVER_IMAGES = [
  { url: IMG("1763878119119-aff0820121fd"), label: "Safari" },
  { url: IMG("1603477849227-705c424d1d80"), label: "Beach" },
  { url: IMG("1604223190546-a43e4c7f29d7"), label: "Mountain" },
  { url: IMG("1677254817050-cb9b29fbb16e"), label: "Japan" },
  { url: IMG("1680454769871-f58768c6187b"), label: "Italy" },
  { url: IMG("1643718220983-d6499832d422"), label: "Bali" },
  { url: IMG("1514939775307-d44e7f10cabd"), label: "City" },
  { url: IMG("1637576308588-6647bf80944d"), label: "Maldives" },
  { url: IMG("1669711671489-3f181b312531"), label: "Kyoto" },
  { url: IMG("1629711129507-d09c820810b1"), label: "Resort" },
  { url: IMG("1612638945907-1cb1d758f2d3"), label: "Alps" },
  { url: IMG("1647363377737-8d0ad7c2f494"), label: "Flight" },
];

export const KEYWORD_MAP: Array<[string, string]> = [
  ["kenya","safari"],["safari","safari"],["mara","safari"],["masai","safari"],["amboseli","safari"],
  ["elephant","safari"],["lion","safari"],["wildlife","safari"],["game drive","safari"],["bush","safari"],["angama","safari"],["hemingway","safari"],
  ["maldives","beach"],["bali","bali"],["beach","beach"],["ocean","beach"],["coral","beach"],["snorkel","beach"],["dive","beach"],
  ["japan","japan"],["tokyo","japan"],["kyoto","japan"],["osaka","japan"],["sushi","japan"],["omakase","japan"],["jiro","dining"],
  ["alps","mountain"],["mountain","mountain"],["ski","mountain"],["snow","mountain"],["switzerland","mountain"],["iceland","mountain"],["glacier","mountain"],
  ["amalfi","italy"],["italy","italy"],["florence","italy"],["rome","italy"],["venice","italy"],
  ["hotel","hotel"],["resort","hotel"],["lodge","hotel"],["villa","hotel"],["hyatt","hotel"],["marriott","hotel"],["hilton","hotel"],["camp","safari"],
  ["dinner","dining"],["lunch","dining"],["breakfast","dining"],["restaurant","dining"],["cuisine","dining"],["carnivore","dining"],["boma","dining"],
  ["flight","flight"],["airways","flight"],["airport","flight"],["charter","flight"],["airline","flight"],
  ["balloon","activity"],["tour","activity"],["cultural","activity"],["museum","activity"],["temple","activity"],["market","activity"],["walk","activity"],
  ["new york","city"],["london","city"],["paris","city"],["dubai","city"],
];

export function getEventImageCategory(title: string, type: string): string {
  const lower = title.toLowerCase();
  for (const [kw, cat] of KEYWORD_MAP) {
    if (lower.includes(kw)) return cat;
  }
  if (type === "flight") return "flight";
  if (type === "hotel") return "hotel";
  if (type === "dining") return "dining";
  return "activity";
}

export function generateEventImage(title: string, type: string, seed: number): string {
  const cat = getEventImageCategory(title, type);
  const bank = IMAGE_BANK[cat] ?? IMAGE_BANK.activity;
  return bank[((seed % bank.length) + bank.length) % bank.length];
}

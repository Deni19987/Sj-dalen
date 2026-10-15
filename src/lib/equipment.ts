// Utrustningskatalog – samma lista i admin, för AI:n, på bilsidan och i Blocket-checklistan.
// Namnen följer det som brukar stå i svenska bilannonser så att de är lätta att hitta på Blocket.

export interface EquipmentGroup {
  name: string;
  items: string[];
}

export const EQUIPMENT_GROUPS: EquipmentGroup[] = [
  {
    name: "Komfort",
    items: [
      "Klimatanläggning",
      "AC",
      "Farthållare",
      "Adaptiv farthållare",
      "Elhissar fram",
      "Elhissar bak",
      "Elspeglar",
      "Eljusterbara stolar",
      "Minnesstolar",
      "Stolsvärme fram",
      "Stolsvärme bak",
      "Ventilerade stolar",
      "Rattvärme",
      "Läderklädsel",
      "Keyless",
      "Elmanövrerad baklucka",
      "Panoramatak",
      "Taklucka",
    ],
  },
  {
    name: "Säkerhet & förarstöd",
    items: [
      "ABS-bromsar",
      "Antisladdsystem",
      "Krockkuddar fram",
      "Sidokrockkuddar",
      "Isofix",
      "Parkeringssensorer bak",
      "Parkeringssensorer fram",
      "Backkamera",
      "360-kamera",
      "Automatisk nödbromsning",
      "Filhållningsassistent",
      "Döda vinkeln-varning",
      "Trafikskyltsigenkänning",
      "Head-up display",
      "Larm",
    ],
  },
  {
    name: "Multimedia",
    items: [
      "Navigation",
      "Bluetooth",
      "Apple CarPlay",
      "Android Auto",
      "USB",
      "Pekskärm",
      "Digital instrumentpanel",
      "DAB-radio",
      "Premiumljudsystem",
      "Trådlös mobilladdning",
    ],
  },
  {
    name: "Vinter",
    items: ["Motorvärmare", "Kupévärmare", "Uppvärmd vindruta", "Sommar- och vinterdäck"],
  },
  {
    name: "Exteriör & ljus",
    items: [
      "LED-strålkastare",
      "Xenonstrålkastare",
      "Dimljus",
      "Automatisk helljusavbländning",
      "Regnsensor",
      "Alufälgar",
      "Tonade rutor",
      "Takräcke",
      "Dragkrok",
      "Elinfällbar dragkrok",
    ],
  },
];

export const ALL_EQUIPMENT = EQUIPMENT_GROUPS.flatMap((g) => g.items);
export const OTHER_GROUP = "Övrigt";

/** Delar upp en bils utrustning i katalogens grupper (i katalogens ordning). Okända punkter hamnar i "Övrigt". */
export function groupEquipment(items: string[]): EquipmentGroup[] {
  const set = new Set(items);
  const groups = EQUIPMENT_GROUPS.map((g) => ({ name: g.name, items: g.items.filter((i) => set.has(i)) }));
  const known = new Set(ALL_EQUIPMENT);
  const other = items.filter((i) => !known.has(i));
  if (other.length) groups.push({ name: OTHER_GROUP, items: other });
  return groups.filter((g) => g.items.length > 0);
}

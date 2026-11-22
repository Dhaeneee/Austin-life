// Sporten uit Garmin Connect (typeKey) -> categorie + Nederlandse naam.
export type Cat = "lopen" | "fietsen" | "zwemmen" | "kracht" | "andere";
const NAMES: Record<string, string> = {
  SQUASH: "Squash", PADEL: "Padel", TENNIS: "Tennis", PICKLEBALL: "Pickleball", BADMINTON: "Badminton", TABLE_TENNIS: "Tafeltennis",
  RACQUETBALL: "Racquetball", PLATFORM_TENNIS: "Platformtennis", RACKET: "Racketsport", WALKING: "Wandelen", CASUAL_WALKING: "Wandelen",
  SPEED_WALKING: "Snelwandelen", HIKING: "Hiken", ROWING: "Roeien", INDOOR_ROWING: "Roeien (binnen)", ELLIPTICAL: "Crosstrainer",
  STAIR_CLIMBING: "Traplopen", FLOOR_CLIMBING: "Traplopen", SOCCER: "Voetbal", FOOTBALL: "Voetbal", BASKETBALL: "Basketbal",
  VOLLEYBALL: "Volleybal", HOCKEY: "Hockey", FIELD_HOCKEY: "Hockey", ICE_HOCKEY: "IJshockey", GOLF: "Golf", MULTI_SPORT: "Multisport",
  TRIATHLON: "Triatlon", DUATHLON: "Duatlon", RESORT_SKIING: "Skiën", RESORT_SKIING_SNOWBOARDING_WS: "Skiën", SKIING: "Skiën",
  BACKCOUNTRY_SKIING: "Toerskiën", CROSS_COUNTRY_SKIING: "Langlaufen", CROSS_COUNTRY_SKIING_WS: "Langlaufen", SNOWBOARDING: "Snowboarden",
  INLINE_SKATING: "Inline skaten", SKATING: "Schaatsen", ICE_SKATING: "Schaatsen", ROCK_CLIMBING: "Klimmen", INDOOR_CLIMBING: "Klimmen",
  BOULDERING: "Boulderen", MOUNTAINEERING: "Bergbeklimmen", BOXING: "Boksen", MIXED_MARTIAL_ARTS: "Vechtsport", DANCE: "Dansen",
  JUMP_ROPE: "Touwspringen", KAYAKING: "Kajakken", PADDLING: "Peddelen", STAND_UP_PADDLEBOARDING: "Suppen", SURFING: "Surfen",
  SAILING: "Zeilen", HORSEBACK_RIDING: "Paardrijden", YOGA: "Yoga", PILATES: "Pilates", HIIT: "HIIT", STRENGTH_TRAINING: "Kracht",
  INDOOR_CARDIO: "Cardio", FITNESS_EQUIPMENT: "Fitness", OTHER: "Andere sport",
};
export function sportOf(typeKey: unknown): [Cat, string] | null {
  const ty = String(typeKey ?? "").toUpperCase().trim();
  if (!ty || /MEDITATION|BREATHWORK|SLEEP|NAP/.test(ty)) return null;
  if (/SWIM/.test(ty)) return ["zwemmen", "Zwemmen"];
  if (/RUN/.test(ty)) return ["lopen", "Lopen"];
  if (/CYCL|BIK|RIDE|SPIN/.test(ty) && !/MOTOR/.test(ty)) return ["fietsen", "Fietsen"];
  const name = NAMES[ty] ?? ty.toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  if (/STRENGTH|HIIT|INDOOR_CARDIO|FITNESS|YOGA|PILATES/.test(ty)) return ["kracht", name];
  return ["andere", name];
}

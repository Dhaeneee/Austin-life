// Verbinding met de database. De publishable key is bedoeld om openbaar te zijn;
// de beveiliging zit in de privacyregels (Row Level Security) van de database.
// Zet hier NOOIT de secret/service_role key.
window.TD_CONFIG = {
  url: "https://lqxcqibqkacctmdqghru.supabase.co",
  key: "sb_publishable_eNiEgO6i8T06fEEwDDv4Fw_6O7Zd50i",
  club: "AD Omniserve",
  solo: true,     // persoonlijke app: geen clubgedeelte, één gebruiker
  mail: false,
  garmin: false,
  garminKey: true // koppelen met je persoonlijke Garmin-sleutel
};

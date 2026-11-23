// Sound effect library: index entries are { name, category, duration, file, license, source }.

export const CATEGORIES = ["whoosh", "click", "pop", "impact", "riser", "typing", "ui", "glitch", "sparkle", "cartoon", "transition", "notification", "camera", "paper", "money", "scifi", "misc"];

/** Category from a file or title: first keyword that matches. */
export function categorize(name) {
  const n = name.toLowerCase();
  const table = [
    ["riser", /riser|rise|build|uplift|sweep up|power ?up/],
    ["transition", /maximi[sz]e|minimi[sz]e|transition|swell|reverse|stinger/],
    ["whoosh", /whoosh|swoosh|swish|swipe|woosh|swoop|fly ?by|pass/],
    ["impact", /impact|hit|thud|boom|slam|punch|stomp|bass drop|kick|metal|wood|break|falling|crash|explosion/],
    ["typing", /typing|keyboard|key[- ]?press|keystroke|typewriter/],
    ["click", /click|tick|tap|snap|switch|toggle|select|scroll|back|tools|mouse|release/],
    ["pop", /pop|bubble|blip|plop|bloop|drop|pluck/],
    ["glitch", /glitch|static|digital error|bitcrush/],
    ["sparkle", /sparkle|shimmer|twinkle|magic|chime|glitter/],
    ["cartoon", /cartoon|boing|spring|slide whistle|squeak|wobble|jelly/],
    ["scifi", /laser|phaser|zap|space|sci-?fi|tone|beep/],
    ["notification", /notification|ding|ping|alert|bell|message|bong|glass|question|chime/],
    ["camera", /camera|shutter|photo/],
    ["paper", /paper|page|flip|cardboard|box/],
    ["money", /cash|coin|register|money|kaching/],
    ["ui", /ui|interface|button|confirm|success|error|menu|hover|open|close/],
  ];
  for (const [cat, re] of table) if (re.test(n)) return cat;
  return "misc";
}

/** Safe file stem from a title. */
export const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "sound";

/** Find a sound by exact name, then by name prefix, then by category. */
export function resolveName(index, query) {
  const q = query.toLowerCase();
  return (
    index.find((e) => e.name === q) ??
    index.find((e) => e.name.startsWith(q)) ??
    index.filter((e) => e.category === q).sort((a, b) => a.duration - b.duration)[0] ??
    null
  );
}

// A curated bank of dedication lines, offered under "Need help finding the words?"
// Each is a starting point the reader edits. Keep every line under 120 characters.
// Brock reviews this list in week 3.

export const LINES = {
  for: [
    'who waits at the door every single day.',
    'who never once asked where I had been.',
    'who taught me that every walk is the best walk.',
    'who thinks I am the most interesting person alive.',
    'who sleeps on my feet and calls it guarding.',
    'who has never met a stranger.',
    'who makes the house a home just by being in it.',
    'who got me out of bed on the mornings I couldn’t.',
    'who knows the sound of my car from a block away.',
    'who has heard every secret and kept them all.',
    'who is better at forgiveness than I will ever be.',
    'who still thinks the mail carrier is a daily emergency.',
    'who turned a quiet house into a loud one, in the best way.',
    'who came home with us and never looked back.',
    'who makes room for me on the couch, eventually.',
    'who has walked more miles beside me than anyone.',
    'whose whole body wags when I say their name.',
    'who found me when I was not looking.',
    'who is the reason I know every neighbor on the street.',
    'who has aged into the gentlest version of himself.',
  ],
  inMemory: [
    'who waited at the door every single day.',
    'who walked every mile of it beside me.',
    'who never once left my side, and still hasn’t.',
    'who taught me what it means to be loyal.',
    'who made every ordinary day feel like a good one.',
    'who was there for all of it, start to finish.',
    'who I still look for when I open the door.',
    'whose collar still hangs by the back door.',
    'who asked for nothing and gave everything.',
    'who was the best part of coming home.',
    'who is somewhere ahead on the trail, waiting.',
    'who loved us without ever needing a reason.',
    'who I would do it all again for.',
    'whose paw prints are still all over this house.',
    'who got the whole family through the hard years.',
    'who showed up every morning like it was a gift.',
  ],
};

export function suggest(mode, n = 5) {
  const pool = [...(mode === 'inMemory' ? LINES.inMemory : LINES.for)];
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

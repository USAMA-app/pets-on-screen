# Pets On Screen

Realistic 3D pets that live on your Windows desktop: cats and dogs walk along the top of the taskbar,
birds fly around the screen. Adopt as many as you like.

## Why
People who sit at a computer all day lose track of time and forget to take breaks. Real pets fix that for their
owners: they ask for food, want attention, and make you stop, move and smile. Pets On Screen brings that to your
desktop. It's a **wellbeing companion**: realistic pets that keep you company and gently look after you while you work.

- **Hunger is a break reminder.** After about an hour at the computer a pet gets hungry, comes over and asks for a
  snack. Feeding it takes ten seconds, and that's your cue to stretch, drink some water or look away from the screen.
- **Care shows.** Petting, playing and feeding make a pet more affectionate; a neglected one gets grumpy and sulks.
- **Never in the way.** A grumpy pet sulks with its back turned; it never blocks your work, follows you around,
  makes noise or dies. Needs only change while you're at the computer, pets hide while a full-screen app is in
  front, Quiet mode silences them for meetings, and one click sends them all off screen.

```
npm install
python tools/fetch_models.py YOUR_SKETCHFAB_TOKEN   # once: downloads the pets (about 330 MB)
npm start
```
The 3D models are other people's work, so they aren't in this repo. The script downloads each one from Sketchfab;
you need a free Sketchfab account, and your API token is at https://sketchfab.com/settings/password.

Click the **tray icon** (next to the clock) to open the picker: adopt pets, rename them, resize them, send them home.

## Characters
Each kind of animal has its own personality (`brains.js`):

- **Cat**: independent. Wanders, sits, grooms, naps a lot, stalks and pounces on your cursor,
  purrs when stroked, ignores you sometimes, hisses if you poke it 5 times quickly.
- **Dog**: loyal. Follows your cursor, runs over to greet you when you come back, does a different
  trick each click (paw, roll over, play dead, jump, sit, bark), fetches a ball, digs, naps when you're away.
- **Bird**: flies around and lands on the taskbar, hops and pecks, chirps, startles if you move the
  mouse fast near it, lands on your cursor if you hold it still ("Come here"). Mew always floats.

Pets also notice each other (each rests 15-35 s between encounters):
dogs chase cats (cats bolt, or stand their ground and hiss; a bigger cat sends the dog off yelping) and birds;
two dogs sniff hello then run off together; cats sit together or hiss each other away; cats stalk birds on the
ground; birds chirp back and forth, fly along with each other, and perch on a sleeping pet's back until it wakes.

Mouse: click = pet, stroke back and forth = purr/wag, right-click = menu
(Pet, Feed, Come here, Throw a ball for dogs, Nap, Size, Send home). Drag to pick a pet up: it hangs from where you
grabbed it and swings as you move; flick to throw it. Landings depend on how hard they are (cats always act like
they meant it). Wandering pets that walk off one end of your screens come back in on the other end.

## Needs
- **Hunger**: hungry after ~70 min (cats), ~60 (dogs), ~50 (birds) of you being at the computer; grumpy about
  40 min later. Hungry pets come near your cursor and ask ("Snack break? 🍖") every few minutes. Grumpy pets
  complain once, then sulk with their back turned and refuse tricks until fed. Feed from the right-click menu
  or the Feed button in the picker, which also shows each pet's mood.
- **Affection**: grows with petting, stroking and feeding, fades slowly; affectionate cats are less aloof.
- Needs pause when the mouse hasn't moved for 5 minutes, and while the app is closed.

## Staying out of your way
- The **🐾 button** (drag it to any screen edge) sends every pet running or flying off screen; click again (🏠)
  and they come back. Also in the tray menu as "Pets away / come back".
- **Quiet mode** (tray): no speech bubbles, hearts or asking for food.
- Pets hide automatically while another app is full screen (videos, games, presentations).

## Files
- `main.js`: overlay window spanning all screens, tray, picker window, full-screen watcher, saved pets (`%APPDATA%/Pets On Screen/pets.json`).
- `renderer.js`: the shared 3D scene, per-screen floors, mouse input, the away button, treats and balls.
- `pet.js`: one pet: model loading and fixes, animation, movement, carrying and landing, needs, a queue of steps.
- `brains.js`: the characters.
- `picker.html`: adopt / manage pets.
- `models/catalog.json`: every model, its kind, size, facing and **animation map** (action -> clip names).

## Adding a model
Put the `.glb` in `models/<kind>/`, add an entry to `catalog.json` with `kind`, `file`, `thumb`, `height` (px at
Medium) and `anims`. Then check it with the calibration view, which lines up every pet of a kind walking or
flying in place, facing right:

```
npx electron . --gallery=cat      # or dog, bird, all; --gallery=play = a test mix with real characters
```
If one faces the wrong way, set `"yaw": 3.14159`. Helper meshes (ground planes, cubes) can be removed with
`"hide": ["MeshName"]`. Walking speed is measured from each gait automatically so paws don't slide.

## Credits
All models are from Sketchfab; authors and licences are listed per model in `models/catalog.json` and shown in
the picker. Models marked CC BY-NC are for personal use only.

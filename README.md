# Pets On Screen

Realistic 3D pets that live on your Windows desktop: cats and dogs walk along the top of the taskbar,
birds fly around the screen. Adopt as many as you like.

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

Mouse: click = pet, stroke back and forth = purr/wag, drag = pick up, right-click = menu
(Pet, Feed, Come here, Throw a ball for dogs, Nap, Size, Send home).

## Files
- `main.js`: overlay window, tray, picker window, saved pets (`%APPDATA%/Pets On Screen/pets.json`).
- `renderer.js`: the shared 3D scene, mouse input, treats and balls.
- `pet.js`: one pet: model loading and fixes, animation, movement, a queue of steps.
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

# Mehr's Birthday Secret 🎂

A browser game made as a birthday gift for Mehr: play as many games as you can on your monitors without anyone behind you noticing.

## Play
- Tap a monitor to start a game on it, tap again to hide it behind a spreadsheet.
- More games at once = way more points (5 × 2ⁿ per second), and each screen ramps up the longer it stays on.
- Slacking off drains points. You start with 1,000; hit 0 and you're out.
- Only people behind you can see your screens. Flashing red = hide it now.
- Tap the floor left/right to roll your chair and block the screens behind you.
- 😱 **OH CRAP!** hides everything. 🍩 **Donuts** lure people away.
- 3 busts and you're fired.

Keyboard: `1–6` monitors · `A/D` roll chair · `Space` oh crap · `F` donuts · `P` pause

## Develop
```sh
npm install
npm run dev      # http://localhost:5173 (add ?debug for an FPS counter)
npm run build    # static site in dist/, deployable anywhere
```

Built with three.js + Vite. All art, sound and music are generated in code.

# Flowers of Ferdinand — Story Bank

### 2026-08-31 — The scroll that shipped and moved nothing

**The moment.** Rachel asked that tapping a bed on the site plan scroll the page to that bed's
list, because on a phone the panel was opening below the fold. I wrote it with
`scrollIntoView({behavior: "smooth", block: "start"})`, which is the textbook call, and it
looked fine: tap a bed, the right panel opens. What made it sneaky is that the visible half of
the feature worked perfectly. The panel appeared, the correct bed highlighted, nothing errored
in the console. Only the scrolling silently did nothing.

**What I did & why.** I did not trust the look of it. I measured `window.scrollY` immediately
before the tap and again after, and printed the panel's position: 228 before, 228 after, with
the panel sitting at 867 pixels down a 626-pixel viewport. So the page had not moved at all and
the thing she asked for was entirely absent, in a build I would otherwise have called done. I
never fully explained why smooth failed. Calling `scrollIntoView` directly on the same element
worked, and smooth froze the browser's renderer under automation twice. Rather than keep digging
at a behaviour I could not pin down, I switched to an instant jump, which I could prove worked on
every bed I tested. That is also the better call on its own merits: the distance from the plan to
the panel is most of a screen and grows as the page grows, and a long animated scroll is slow to
sit through. It removed the reduced-motion branch too, because there is no motion left to reduce.

**The detail that lands.** 228 before the tap, 228 after. The panel opened correctly at 867
pixels down a 626-pixel viewport, so by eye the feature looked shipped. Two identical numbers
were the only thing that said otherwise.

**What it shows.** Verifying with numbers rather than appearance, and knowing when to stop
debugging a mechanism and switch to one you can prove. I could have spent an hour on why smooth
scrolling failed in that context. The user-visible outcome of the instant jump is at least as
good, so the debugging would have been for my own satisfaction, not for her.

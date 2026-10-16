# Margin

A notepad calculator for macOS, rebuilt from scratch as a better Numi. Write on the left; answers land in the margin on the right. Click an answer to copy it (or press ⌘⏎ on its line).

The engine has no dependencies and does real dimensional analysis, so units combine the way they do on paper.

## Download

1. Download `Margin.dmg` from the [latest release](https://github.com/hspeiser/margin/releases/latest). It runs on Apple Silicon and Intel Macs with macOS 11 or later.
2. Open the DMG and drag Margin to Applications.
3. The first time you open it, macOS blocks it because the app isn't signed with an Apple Developer ID. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to the Margin message. You only need to do this once.

If you prefer the Terminal, this clears the download flag instead:

```bash
xattr -dr com.apple.quarantine /Applications/Margin.app
```

## What it understands

**Units.** Conversions use `in`, `to`, `as`, or `into`. Compound units multiply, divide, and cancel:

```
5 km in miles                 3.1069 mi
60 mph * 45 min               45 mi
100 GB / 25 MB/s              1 h 6 min 40 s
5 kg * 9.8 m/s²               49 N
2 kW * 3 h * $0.18/kWh        $1.08
$60,000 per year in $/month   $5,000/mo
30 mpg in L/100km             7.8405 L/100km
3000 rpm in Hz                50 Hz
```

- Mixed units in and out: `6'2" in cm`, `5 ft 11 in in cm`, `1.8 m in feet and inches`, `90 min in hours and minutes`, `1.25 kg in lb oz`
- Every SI prefix, binary data prefixes (`KiB`, `GiB`), bits and bytes (`Mbps`, `MB/s`), powers (`m²`, `m^3`, `sq ft`, `cubic inches`)
- Densities for kitchen and materials: `2 cups flour in grams`, `1 stick of butter in tbsp`, `1 m³ of concrete in kg`
- Bare numbers adopt units (`$5 + 3` → `$8`), ounces fall back to fluid ounces for volume, and weight converts to force under standard gravity
- "in" means inches or "convert" depending on context: `5 in`, `5 in in cm`, `5 in cm`, `100 in hex`
- Forgiving spellings: `kilos`, `kms`, `msec`, `°K`, `6ft2in`, `1h30m`, `20° C`, `5 km -> m`
- An unknown unit is never silently ignored: `100 farenheit in celsius` says `Did you mean fahrenheit?`

**Money.** `$`, `€`, `£`, `¥`, ISO codes, names (`dollars`, `euros`, `yen`), crypto (`BTC`, `ETH`, `sats`), and scales (`$5k`, `€2.5M`, `$1.2B`). Rates refresh from open.er-api.com and CoinGecko, with built-in estimates when offline.

**Plain English.** `how many feet in a mile`, `average of 2, 4 and 6`, `days between Jan 1 and Dec 31`, `2 nights at $150`, `two thousand twenty six`, `log base 2 of 8`, `√2`

**Percentages.** `20% of 50`, `$50 - 10%`, `5% on $30`, `6% off 40`, `$45 as a % of $180`, `6 is what % of 24`, `5% of what is 6`, `6 is 5% of what`, `$50 to $75 is what %`

**Dates and time zones.** `today + 90 days`, `days until Dec 25`, `next friday`, `tomorrow at 3pm`, `3pm PT in London`, `time in Tokyo`, `5:30pm - 9:15am`, `3 days ago`, `fromunix(1700000000)`, `now in unix`

**Formats.** `255 in hex`, `0b1010`, `0.375 as fraction`, `1e6 in sci`, `pi to 2 dp`, `123456 to 2 sf`, `17 to the nearest 5`, `1234 in words`, `2026 in roman`

**Notepad features**

- `# Headers` and `// comments`
- `Labels: $1,450`: text before a colon is ignored
- Prose is ignored, so `I spent $5 on coffee and $3 on tea` gives `$8`
- Variables, including multi-word ones: `hourly rate = $95/hr`
- `sum`/`total` and `average` add up the block above (until a blank line or header), converting units as they go
- `prev`/`ans` refers to the line above
- Functions: `sqrt`, `cbrt`, `root`, `log`, `ln`, trig (with degree or radian input), `round`, `floor`, `ceil`, `abs`, `min`, `max`, `gcd`, `lcm`, `fact`, `choose`, `hypot`
- Errors are specific: `Can't convert km (length) to kg (mass)`

## Keyboard

| Shortcut | Action |
| --- | --- |
| ⌥Space | Show or hide Margin from anywhere (desktop app) |
| ⌘N | New sheet |
| ⌘\\ | Show or hide the sheet list |
| ⌘1…9 | Switch to a recent sheet |
| ⌘, | Settings |
| ⌘⏎ | Copy the current line's answer |

## Development

Building from source needs Node 20.19 or later and pnpm. The desktop app also needs Rust and the Xcode command line tools.

```bash
pnpm install
pnpm dev          # web version at http://localhost:1420
pnpm test         # engine test suite
pnpm tauri dev    # desktop app with hot reload
pnpm tauri build  # Margin.app and .dmg in src-tauri/target/release/bundle
```

Code layout:

- `src/engine/`: lexer, Pratt parser, evaluator, unit registry, formatting. No DOM, no dependencies.
- `src/ui/`: the editor (CodeMirror 6, with answers drawn in a layer aligned to each line, even when it wraps), sheets, settings, and exchange rates.
- `src-tauri/`: the native shell (global hotkey, window behavior).

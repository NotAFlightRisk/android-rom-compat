# Contributing

Thanks for helping out 🎉<br />
You don't need to know how to code, or have used YAML before. By joining in, you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

Rather not touch any files? Fill in a form instead:
[report what works](https://github.com/NotAFlightRisk/android-rom-compat/issues/new?template=report-feature.yml),
[add a device](https://github.com/NotAFlightRisk/android-rom-compat/issues/new?template=add-device.yml) or
[fix a mistake](https://github.com/NotAFlightRisk/android-rom-compat/issues/new?template=correction.yml).

---

## How the data is laid out

Everything lives in [`data/`](../data):

- `roms/` - one file per ROM, like `grapheneos.yml`, plus anything that's true on every device it runs on
- `devices/<brand>/` - one file per device, named after its codename, like `devices/google/tegu.yml`
- `upstream/` - generated from each ROM's own device list every week. Don't edit these
- `support/<codename>/` - one file per ROM, for what people have reported, like `support/tegu/lineageos.yml`

`brands.yml` lists the brands and `features.yml` lists the features we track.

The files in `upstream/` get rewritten by a bot every Monday, so any change you make there is gone within a week. If one's wrong (a missing device, the wrong Android version), it's wrong on the ROM's own site too - fix it there, or [tell us](https://github.com/NotAFlightRisk/android-rom-compat/issues/new?template=correction.yml) and we'll chase it.

---

## Reporting what works

The [form](https://github.com/NotAFlightRisk/android-rom-compat/issues/new?template=report-feature.yml) is the easy way. Pick a device and ROM, set whatever you've tried, and a bot opens a pull request for you with your name on the commit. If something's missing or doesn't add up, it comments on the issue saying what - just edit the issue and it'll try again. The "Report" link on each ROM row of a device page fills in the first two fields for you.

Rather do it by hand? Add a `features` section to `data/support/<codename>/<rom>.yml`, making the file if it's not there yet. Anything you leave out shows as unknown, which is fine.

```yaml
# yaml-language-server: $schema=../../../schema/support.json
features:
  nfc: { status: working, android: 16, build: '2026091000', checked: 2026-09-17, source: tested }
  camera: { status: partial, note: No 48MP mode, android: 16, checked: 2026-09-17, source: tested }
  esim: { status: broken, note: Activation hangs, variant: microg, android: 16, checked: 2026-09-17, source: https://example.com/thread }
  widevine: L3
```

`android` and `build` are what you tested on, `checked` is the date, and `variant` is for a ROM's other builds (like LineageOS for microG). A report shows as stale once the ROM moves to a newer Android than yours, or `checked` is over a year old.

The keys come from [`features.yml`](../data/features.yml). Most features use these:

| Status | When to use it |
| --- | --- |
| `working` | Works as well as it did on the stock ROM |
| `partial` | Works, but with a catch. Needs a `note` |
| `broken` | Doesn't work. Needs a `note` |
| `unknown` | Nobody's checked. Same as leaving it out |
| `n/a` | The phone doesn't have the hardware |

Widevine uses `L1`, `L3` or `none`, and Play Integrity (`integrity`) uses `strong`, `device`, `basic` or `none`.

---

## Adding a device

The weekly import adds any device a ROM we track supports, so you'll mostly only need this for fixing up details. Make `data/devices/<brand>/<codename>.yml`. The codename is the internal name the ROM's own device page uses (lowercase).

```yaml
# yaml-language-server: $schema=../../../schema/device.json
name: Pixel 9a
codenames: [tegu]
released: 2025
soc: Google Tensor G4
hardware: [5g, cellular, esim, fingerprint, nfc]
bootloader:
  unlock: conditional
  notes: Carrier models, like Verizon's, can't be unlocked.
```

Add `aliases` for model numbers and other names people search for. `type` is `tablet` or `handheld`, and left out for phones. `hardware` lists the bits that some features need, so a phone without NFC shows NFC as n/a. `bootloader.unlock` is `yes`, `no`, `conditional` (add `notes` saying when) or `unknown`.

The import only ever fills gaps in a device file, so your edits stay put. If the brand's new, add it to `data/brands.yml` too.

---

## Adding support for a ROM

If the ROM has a file in `data/upstream/`, its device list comes from there and you can't add rows by hand - the ROM's own site is the place to fix it. For a ROM without an importer, make `data/support/<codename>/<rom>.yml` with the whole row:

```yaml
# yaml-language-server: $schema=../../../schema/support.json
status: active
android: 16
maintainer: someone
latest: { version: '3.1', date: 2026-09-10 }
source: https://example.com/devices/tegu
install: https://example.com/devices/tegu/install
```

`status` is `active`, or `discontinued` once the ROM stops building for it. `status` and `source` are the only must-haves.

A new ROM lives at `data/roms/<rom>.yml`. Keep that name, and any variant key, to lowercase letters and numbers - imports are named `<rom>-<variant>.yml`, so a hyphen in either splits in the wrong place.

---

## Sources

Everything needs a `source`. The ROM's own device page, wiki or release notes are best. For features, a forum post or your own testing is fine too (`source: tested` by hand, or "tested it myself" in the form). If you can't back something up, leave it as unknown - a gap is better than a wrong answer.

---

## Bot pull requests

`android-rom-compat-bot` opens two kinds of PR:

- `chore(data): weekly import` - every Monday, refreshing `data/upstream/` and filling gaps in `data/devices/`. The description lists how each source got on
- `feat(data): ...` - one per report form, touching one file in `data/support/`, and closing the issue once merged

They run the same checks as everyone else's, and get squash merged once they pass.

---

## Checking your change

On GitHub, just open the pull request - the checks run automatically, and any problem shows up on the file it's in.

Working locally? Run `npm i` once, then `npm run validate`. It lists every problem it finds, like this:

```
✗ data/support/tegu/lineageos.yml
  android: comes from data/upstream/lineageos.yml, so only features go here
  features.esim: "partial" needs a note, e.g. { status: partial, note: ... }
✗ data/devices/google/tegu.yml
  bootloader.unlock: "maybe" isn't allowed. Use yes, no, conditional or unknown

3 problems in 2 files
```

Add `--file data/devices/google/tegu.yml` to check just one file.

---

## Editing on GitHub, no setup needed

1. Find the file on GitHub, or click "Edit on GitHub" at the bottom of any page on the site
2. Hit the pencil icon. GitHub will make you a copy (a fork) automatically
3. Make your change, then "Propose changes" and "Create pull request"
4. Say where the info came from in the description

To add a new file, go to the folder and pick Add file --> Create new file. Typing a path with slashes in the name box makes the folders for you.

---

## Code changes

Same deal as any project: fork, branch off `main`, keep it focused, and run `npm test` and `npm run build` before you push. Commit messages and PR titles use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` and so on), since the release notes are generated from them.

---

## Licensing

Data you add is licensed under [CC BY-SA 4.0](../data/LICENSE), and code under [MIT](../LICENSE).

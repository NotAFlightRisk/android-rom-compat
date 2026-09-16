# Contributing

Thanks for helping out 🎉<br />
You don't need to know how to code, or have used YAML before. By joining in, you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

Rather not touch any files? Fill in a form instead and we'll add it for you:
[add a device](https://github.com/NotAFlightRisk/android-rom-compat/issues/new?template=add-device.yml),
[report what works](https://github.com/NotAFlightRisk/android-rom-compat/issues/new?template=report-feature.yml) or
[fix a mistake](https://github.com/NotAFlightRisk/android-rom-compat/issues/new?template=correction.yml).

---

## How the data is laid out

Everything lives in [`data/`](../data), in three folders:

- `roms/` - one file per ROM, like `grapheneos.yml`
- `devices/<brand>/` - one file per device, named after its codename, like `devices/google/panther.yml`
- `support/<codename>/` - one file per ROM that supports that device, like `support/panther/lineageos.yml`

If there's no support file, that ROM doesn't support the device. `brands.yml` lists the brands and `features.yml` lists the features we track.

---

## Adding a device

Make `data/devices/<brand>/<codename>.yml`. The codename is the internal name the ROM's own device page uses (lowercase).

```yaml
# yaml-language-server: $schema=../../../schema/device.json
name: Pixel 7
codenames: [panther]
aliases: [GVU6C, GQML3, GO3Z5]
released: 2022
soc: Google Tensor G2
bootloader:
  unlock: conditional
  relock: yes
  notes: Carrier models, like Verizon's, can't be unlocked.
```

`aliases` are model numbers and other names people search for. `bootloader.unlock` is `yes`, `no`, `conditional` (add `notes` saying when) or `unknown`. `relock` is whether it can be locked again with a custom ROM installed: `yes`, `no` or `unknown`.

If the brand's new, add it to `data/brands.yml` too.

---

## Adding support for a ROM

Make `data/support/<codename>/<rom>.yml`:

```yaml
# yaml-language-server: $schema=../../../schema/support.json
official: true
status: active
android: 16
maintainer: GrapheneOS
verified: 2026-09-16
source: https://grapheneos.org/faq#supported-devices
install: https://grapheneos.org/install/web
```

`status` is `active`, or `discontinued` once the ROM stops building for it. `verified` is the date you checked, and anything older than a year shows as stale on the site.

---

## Reporting what works

Add a `features` section to the support file. Anything you leave out shows as unknown, which is fine.

```yaml
features:
  nfc: working
  volte: broken
  esim: { status: partial, note: Activation needs sandboxed Google Play }
  widevine: L3
  integrity: basic
```

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

## Sources

Every support file needs a `source` link. The ROM's own device page, wiki or release notes are best. A forum post or your own testing is ok for features, just say so in a note, like `{ status: working, note: Tested on build 2026091000 }`. If you can't back something up, leave it as unknown - a gap is better than a wrong answer.

---

## Checking your change

On GitHub, just open the pull request - the checks run automatically, and any problem shows up on the file it's in.

Working locally? Run `npm i` once, then `npm run validate`. It lists every problem it finds, like this:

```
✗ data/support/panther/lineageos.yml
  features.esim: "partial" needs a note, e.g. { status: partial, note: ... }
✗ data/devices/google/cheetah.yml
  bootloader.unlock: "maybe" isn't allowed. Use yes, no, conditional or unknown

2 problems in 2 files
```

Add `--file data/devices/google/panther.yml` to check just one file.

---

## Editing on GitHub, no setup needed

1. Find the file on GitHub, or click "Edit on GitHub" at the bottom of any page on the site
2. Hit the pencil icon. GitHub will make you a copy (a fork) automaticaly
3. Make your change, then "Propose changes" and "Create pull request"
4. Say where the info came from in the description

To add a new file, go to the folder and pick Add file --> Create new file. Typing a path with slashes in the name box makes the folders for you.

---

## Code changes

Same deal as any project: fork, branch off `main`, keep it focused, and run `npm test` and `npm run build` before you push. Commit messages and PR titles use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` and so on), since the release notes are generated from them.

---

## Licensing

Data you add is licensed under [CC BY-SA 4.0](../data/LICENSE), and code under [MIT](../LICENSE).

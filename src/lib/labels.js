const named = {
  aosp: 'AOSP',
  lineageos: 'LineageOS',
  microg: 'microG',
  sandboxed: 'Sandboxed Play',
  fdroid: 'F-Droid',
  'app-lounge': 'App Lounge',
  aurora: 'Aurora Store',
  'play-store': 'Play Store',
  grapheneos: 'GrapheneOS App Store',
  'web-installer': 'Web installer',
  cli: 'Command line',
  'n/a': 'N/A',
  rom: 'ROM',
};

export const labelOf = (value) =>
  named[value] ?? `${value.charAt(0).toUpperCase()}${value.slice(1).replace(/-/g, ' ')}`;

export const yesNo = (value) => (value ? 'Yes' : 'No');

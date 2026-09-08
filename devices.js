// Device library. A device is data, not a feature (PRD §121).
const d = (id, brand, name, category, os, w, h, dpr, tags = []) => ({
  id, brand, name, category, os, width: w, height: h, dpr,
  mobile: category !== 'laptop' && category !== 'desktop',
  touch: category !== 'laptop' && category !== 'desktop',
  tags,
});
const bp = (w, h = 900) => ({
  id: `bp-${w}`, brand: 'Breakpoint', name: `${w}px`, category: 'breakpoint', os: 'any',
  width: w, height: h, dpr: w < 700 ? 2 : 1, mobile: w < 1024, touch: w < 1024, tags: ['breakpoint'],
});

export const DEVICES = [
  // Apple
  d('iphone-se', 'Apple', 'iPhone SE', 'phone', 'ios', 375, 667, 2, ['popular', 'small']),
  d('iphone-15', 'Apple', 'iPhone 15', 'phone', 'ios', 393, 852, 3, []),
  d('iphone-16', 'Apple', 'iPhone 16', 'phone', 'ios', 393, 852, 3, []),
  d('iphone-16-pro-max', 'Apple', 'iPhone 16 Pro Max', 'phone', 'ios', 440, 956, 3, []),
  d('iphone-17', 'Apple', 'iPhone 17', 'phone', 'ios', 402, 874, 3, ['popular']),
  d('iphone-17-pro', 'Apple', 'iPhone 17 Pro', 'phone', 'ios', 402, 874, 3, ['popular']),
  d('iphone-17-pro-max', 'Apple', 'iPhone 17 Pro Max', 'phone', 'ios', 440, 956, 3, ['popular']),
  d('ipad-mini', 'Apple', 'iPad Mini', 'tablet', 'ipados', 744, 1133, 2, ['popular']),
  d('ipad', 'Apple', 'iPad', 'tablet', 'ipados', 820, 1180, 2, []),
  d('ipad-air', 'Apple', 'iPad Air 13"', 'tablet', 'ipados', 1024, 1366, 2, []),
  d('ipad-pro-11', 'Apple', 'iPad Pro 11"', 'tablet', 'ipados', 834, 1210, 2, ['popular']),
  d('ipad-pro-13', 'Apple', 'iPad Pro 13"', 'tablet', 'ipados', 1032, 1376, 2, []),
  d('macbook-air', 'Apple', 'MacBook Air 13"', 'laptop', 'macos', 1470, 956, 2, []),
  d('macbook-pro-16', 'Apple', 'MacBook Pro 16"', 'laptop', 'macos', 1728, 1117, 2, []),
  // Google
  d('pixel-8', 'Google', 'Pixel 8', 'phone', 'android', 412, 915, 2.625, []),
  d('pixel-9', 'Google', 'Pixel 9', 'phone', 'android', 412, 915, 2.625, []),
  d('pixel-10', 'Google', 'Pixel 10', 'phone', 'android', 412, 915, 2.625, ['popular']),
  d('pixel-10-pro', 'Google', 'Pixel 10 Pro', 'phone', 'android', 412, 915, 2.625, []),
  d('pixel-10-pro-xl', 'Google', 'Pixel 10 Pro XL', 'phone', 'android', 448, 998, 3, []),
  d('pixel-fold', 'Google', 'Pixel Fold (open)', 'foldable', 'android', 841, 701, 2.5, []),
  d('pixel-tablet', 'Google', 'Pixel Tablet', 'tablet', 'android', 1600, 1000, 1.6, []),
  // Samsung
  d('galaxy-s24', 'Samsung', 'Galaxy S24', 'phone', 'android', 360, 780, 3, []),
  d('galaxy-s25', 'Samsung', 'Galaxy S25', 'phone', 'android', 384, 832, 3, []),
  d('galaxy-s26', 'Samsung', 'Galaxy S26', 'phone', 'android', 384, 854, 3, ['popular']),
  d('galaxy-s26-ultra', 'Samsung', 'Galaxy S26 Ultra', 'phone', 'android', 412, 915, 3.5, []),
  d('galaxy-a55', 'Samsung', 'Galaxy A55', 'phone', 'android', 360, 800, 3, ['popular']),
  d('galaxy-z-fold', 'Samsung', 'Galaxy Z Fold (open)', 'foldable', 'android', 904, 1104, 2, []),
  d('galaxy-z-fold-closed', 'Samsung', 'Galaxy Z Fold (closed)', 'foldable', 'android', 344, 882, 2.5, []),
  d('galaxy-z-flip', 'Samsung', 'Galaxy Z Flip', 'phone', 'android', 360, 880, 3, []),
  d('galaxy-tab-s10', 'Samsung', 'Galaxy Tab S10', 'tablet', 'android', 800, 1280, 2, []),
  // Xiaomi / others
  d('xiaomi-14', 'Xiaomi', 'Xiaomi 14', 'phone', 'android', 393, 873, 3, []),
  d('redmi-note-13', 'Xiaomi', 'Redmi Note 13', 'phone', 'android', 393, 873, 2.75, []),
  d('oneplus-12', 'OnePlus', 'OnePlus 12', 'phone', 'android', 412, 919, 3.5, []),
  // Generic desktop
  d('laptop-1366', 'Generic', 'Laptop 1366', 'laptop', 'any', 1366, 768, 1, ['popular']),
  d('laptop-1536', 'Generic', 'Laptop 1536', 'laptop', 'any', 1536, 864, 1.25, []),
  d('desktop-1920', 'Generic', 'Desktop 1080p', 'desktop', 'any', 1920, 1080, 1, ['popular']),
  d('desktop-2560', 'Generic', 'Desktop 1440p', 'desktop', 'any', 2560, 1440, 1, []),
  // Raw breakpoints
  bp(319, 700), bp(320, 700), bp(359, 780), bp(360, 780), bp(374, 800), bp(375, 800), bp(389, 844),
  bp(390, 844), bp(411, 900), bp(412, 900), bp(429, 932), bp(430, 932), bp(480, 900), bp(640, 900),
  bp(767, 1024), bp(768, 1024), bp(820, 1180), bp(1023, 768), bp(1024, 768), bp(1280, 800),
  bp(1440, 900), bp(1536, 864), bp(1920, 1080),
];

export const QUICK_WIDTHS = [320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1440];

export const SETS = [
  { id: 'essential-mobile', name: 'Essential Mobile', deviceIds: ['bp-360', 'bp-390', 'bp-412', 'bp-430'] },
  { id: 'mobile-tablet', name: 'Mobile + Tablet', deviceIds: ['bp-390', 'bp-430', 'bp-768', 'bp-1024'] },
  { id: 'essential-responsive', name: 'Essential Responsive', deviceIds: ['bp-320', 'bp-375', 'bp-390', 'bp-430', 'bp-768', 'bp-1024', 'bp-1440'] },
  { id: 'popular-mobile', name: 'Popular Mobile', deviceIds: ['iphone-se', 'iphone-17', 'iphone-17-pro-max', 'pixel-10', 'galaxy-s26'] },
  { id: 'apple', name: 'Apple Devices', deviceIds: ['iphone-se', 'iphone-17', 'iphone-17-pro', 'iphone-17-pro-max', 'ipad-mini', 'ipad', 'ipad-pro-11'] },
  { id: 'android', name: 'Android Devices', deviceIds: ['galaxy-a55', 'galaxy-s26', 'galaxy-s26-ultra', 'pixel-10', 'pixel-10-pro-xl', 'galaxy-tab-s10'] },
  { id: 'breakpoint-stress', name: 'Breakpoint Stress Test', deviceIds: ['bp-319', 'bp-320', 'bp-359', 'bp-360', 'bp-374', 'bp-375', 'bp-389', 'bp-390', 'bp-411', 'bp-412', 'bp-429', 'bp-430', 'bp-767', 'bp-768', 'bp-1023', 'bp-1024'] },
];

export const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
  ipados: 'Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  mobile: 'Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
};

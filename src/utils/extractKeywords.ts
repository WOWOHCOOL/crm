/**
 * Auto-extract product/service keywords from inquiry content.
 * Uses pattern matching + comprehensive keyword dictionary for electronics/accessories trade.
 */
export function extractKeywords(text: string | null): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tags = new Set<string>();

  // ── 1. Model numbers ──
  const modelPatterns = [
    /\b[A-Z]{2,6}[\s-]?\d{2,6}[A-Za-z]?\b/g,        // UB20-65W, YJ721, PD20W
    /\b\d+\.?\d*\s?[MGWAmAh]\b/g,                     // 1.5M, 2M, 100W, 20W, 5000mAh
    /\b[A-Z]-[A-Z]\b/g,                                // C-C, A-C, C-L
    /\b\d{2,4}[MGW][hz]?\b/gi,                        // 65W, 100W, 20W
    /\b[A-Z]{2,4}\d{2,4}\b/g,                         // PD20, QC30, UFCS
  ];
  for (const p of modelPatterns) {
    const m = text.match(p);
    if (m) m.forEach((x) => tags.add(x));
  }

  // ── 2. Prefix patterns: "X charger", "X cable", "X adapter" etc ──
  const prefixPatterns = [
    /\b([a-z]+\s)?(charger|charging|adapter|cable|hub|dock|stand|holder|mount|case|cover|protector|battery|bank|speaker|earphone|headphone|earbuds|buds|keyboard|mouse|pad|lamp|light|fan|cooler|clip|ring|strap|band|watch|tag|tracker|mat)\b/gi,
  ];
  for (const p of prefixPatterns) {
    const m = text.match(p);
    if (m) m.forEach((x) => tags.add(x.toLowerCase().trim()));
  }

  // ── 3. Comprehensive electronics/accessories keyword dictionary ──
  const productDict: string[] = [
    // Chargers & Power
    'power bank', 'wireless charger', 'car charger', 'wall charger', 'gan charger',
    'fast charger', 'quick charger', 'usb charger', 'type-c charger', 'pd charger',
    'magsafe charger', 'portable charger', 'solar charger', 'multi-port charger',
    'desktop charger', 'travel charger', 'mini charger', 'super fast charging',
    'wireless charging', 'fast charging', 'quick charge', 'power delivery',
    'charging station', 'charging dock', 'charging pad', 'charging stand',
    'power strip', 'extension cord', 'power adapter', 'travel adapter',
    'usb hub', 'usb-c hub', 'multiport hub',

    // Cables & Connectors
    'data cable', 'charging cable', 'usb cable', 'type-c cable', 'lightning cable',
    'magnetic cable', 'retractable cable', 'braided cable', 'nylon cable',
    'c to c cable', 'c to lightning', 'usb a to c', 'aux cable', 'audio cable',
    'hdmi cable', 'displayport cable', 'otg cable', 'adapter', 'converter',
    'dongle', 'splitter', 'connector',

    // Audio
    'earphone', 'headphone', 'earbuds', 'wireless earbuds', 'bluetooth earphone',
    'tws', 'tws earbuds', 'neckband', 'sport earphone', 'gaming headset',
    'bluetooth speaker', 'portable speaker', 'mini speaker', 'soundbar',
    'bluetooth transmitter', 'bluetooth receiver', 'bluetooth adapter',
    'airpods', 'airpods case',

    // Phone & Tablet Accessories
    'phone case', 'phone cover', 'silicon case', 'leather case', 'tpu case',
    'magsafe case', 'ring holder', 'phone stand', 'phone holder', 'car mount',
    'car holder', 'dashboard mount', 'windshield mount', 'bike mount',
    'screen protector', 'tempered glass', 'privacy screen', 'camera protector',
    'lens protector', 'stylus pen', 'stylus', 'tablet stand', 'tablet case',

    // Smartwatch & Wearables
    'watch band', 'watch strap', 'sport band', 'silicone strap', 'leather strap',
    'watch case', 'watch charger', 'watch protector', 'smartwatch',
    'fitness tracker', 'smart band',

    // Power & Batteries
    'power bank', 'portable battery', 'solar power bank', 'magsafe power bank',
    'battery pack', 'rechargeable battery', 'aa battery', 'aaa battery',
    'lithium battery', 'battery charger',

    // Car Accessories
    'car charger', 'car mount', 'car holder', 'car phone holder',
    'car air purifier', 'car vacuum', 'car diffuser', 'car trash can',
    'car organizer', 'car sun shade', 'car cover',

    // Home & Office
    'desk lamp', 'led lamp', 'night light', 'reading light', 'book light',
    'clip fan', 'mini fan', 'usb fan', 'desk fan', 'portable fan',
    'bluetooth keyboard', 'wireless keyboard', 'mechanical keyboard',
    'bluetooth mouse', 'wireless mouse', 'ergonomic mouse', 'gaming mouse',
    'mouse pad', 'desk mat', 'wrist rest', 'laptop stand', 'laptop cooler',
    'monitor stand', 'monitor mount',

    // Cables / Connectivity
    'usb flash drive', 'memory card', 'sd card', 'card reader',
    'bluetooth', 'wireless', 'wifi', 'nfc',

    // Travel
    'travel adapter', 'universal adapter', 'luggage tag', 'luggage strap',
    'travel pillow', 'neck pillow', 'packing cubes', 'toiletry bag',
    'passport holder', 'travel wallet', 'rfid', 'rfid blocking',

    // Other electronics
    'smart tag', 'bluetooth tracker', 'item finder', 'key finder',
    'smart plug', 'smart bulb', 'smart home', 'iot',
    'selfie stick', 'tripod', 'gimbal', 'ring light', 'led light',
    'microphone', 'lavalier mic', 'wireless mic',
    'webcam', 'webcam cover', 'privacy cover',
  ];

  for (const kw of productDict) {
    if (lower.includes(kw)) tags.add(kw);
  }

  // ── 4. Service/business terms ──
  const serviceDict = [
    'OEM', 'ODM', 'FOB', 'CIF', 'DDP', 'EXW', 'FCA',
    'custom logo', 'private label', 'custom packaging', 'branding',
    'wholesale', 'dropshipping', 'dropship', 'bulk order', 'bulk',
    'sample', 'free sample', 'customization', 'customized', 'custom made',
    'MOQ', 'lead time', 'factory', 'manufacturer', 'supplier',
    'door to door', 'DDP shipping', 'sea freight', 'air freight',
  ];
  for (const kw of serviceDict) {
    if (text.includes(kw)) tags.add(kw);
  }

  // ── 5. Chinese keywords ──
  const cnDict = [
    // Chargers
    '移动电源', '充电宝', '充电器', '充电头', '快充', '闪充',
    '无线充', '磁吸充', '氮化镓', '氮化镓充电器', '多口充',
    '车充', '车载充电器', '旅充', '座充',
    // Cables
    '数据线', '充电线', '快充线', '磁吸线', '伸缩线',
    '编织线', '尼龙线', 'type-c线', '苹果线', '安卓线',
    // Audio
    '耳机', '蓝牙耳机', '无线耳机', '降噪耳机', '运动耳机',
    '游戏耳机', '头戴耳机', '挂脖耳机', 'TWS', '音箱',
    '蓝牙音箱', '便携音箱', '小音箱',
    // Phone accessories
    '手机壳', '保护套', '硅胶壳', '磁吸壳', '指环扣',
    '手机支架', '车载支架', '钢化膜', '镜头膜', '防窥膜',
    // Tablet / Watch
    '平板壳', '平板支架', '触控笔', '表带', '手表壳',
    '手表充电器', '智能手表',
    // Power
    '电池', '充电电池', '锂电池',
    // Car
    '车载支架', '车载手机架', '车载净化器',
    // Home/Office
    '台灯', '小夜灯', '阅读灯', '风扇', '小风扇', '桌面风扇',
    '键盘', '鼠标', '蓝牙键盘', '无线鼠标', '鼠标垫',
    '笔记本支架', '散热架',
    // Travel
    '转换插头', '万能插头', '行李牌', '颈枕', '旅行枕',
    '收纳包', '洗漱包', '护照套',
    // Other
    '自拍杆', '三脚架', '补光灯', '麦克风', '防尘塞',
    '智能标签', '防丢器', '追踪器',
    // Service CN
    '贴牌', '定制', '代工', '批发', '一件代发',
    '打样', '出样', '样品', '外贸', '出口', '工厂',
    '海运', '空运', '门到门',
  ];
  for (const kw of cnDict) {
    if (text.includes(kw)) tags.add(kw);
  }

  // ── 6. Extract GaN / PD / QC / technology mentions ──
  const techTerms = [
    'GaN', 'PD', 'PD3.0', 'PD3.1', 'QC3.0', 'QC4.0', 'UFCS',
    'PPS', 'AFC', 'SCP', 'FCP', 'VOOC', 'dash charge', 'warp charge',
    'USB-C', 'USB-A', 'Micro USB', 'Lightning', 'MagSafe',
    'Qi', 'Qi2', 'Bluetooth 5', 'BT5.0', 'BT5.3',
    'HDMI', 'VGA', 'DisplayPort', 'Thunderbolt',
  ];
  for (const t of techTerms) {
    if (text.includes(t)) tags.add(t);
  }

  // ── 7. Deduplicate & sort ──
  // Remove model numbers from the product list if they already appear as part of a longer tag
  const result = Array.from(tags)
    .filter((t) => t.length > 1 && t.length < 40)
    .sort((a, b) => a.length - b.length);

  // Remove substrings: if a shorter tag is contained in a longer tag, remove the short one
  const filtered: string[] = [];
  for (const tag of result) {
    const alreadyCovered = filtered.some((f) => f.includes(tag));
    if (!alreadyCovered) filtered.push(tag);
  }

  // Return up to 6, prefer shorter unique tags
  return filtered.slice(0, 6);
}

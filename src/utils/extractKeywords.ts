/**
 * Auto-extract product/service keywords from inquiry content.
 * Looks for: model numbers, common product terms, service terms, and key phrases.
 */
export function extractKeywords(text: string | null): string[] {
  if (!text) return [];
  const tags = new Set<string>();

  // 1. Model numbers: alphanumeric patterns like UB20-65W, YJ721, 1.5M, C-C
  const modelPatterns = [
    /\b[A-Z]{2,6}[\s-]?\d{2,4}[A-Z]?\b/g,      // UB20-65W, YJ721
    /\b\d+\.?\d*[MGWAm]\b/g,                      // 1.5M, 2M, 100W
    /\b[A-Z]-[A-Z]\b/g,                            // C-C, A-C
    /\b\d{2,4}[MGW][hz]?\b/gi,                     // 65W, 100W
  ];

  for (const pattern of modelPatterns) {
    const matches = text.match(pattern);
    if (matches) matches.forEach((m) => tags.add(m));
  }

  // 2. Common product keywords (English)
  const productKeywords = [
    'power bank', 'wireless charger', 'charger', 'cable',
    'adapter', 'hub', 'dock', 'stand', 'holder', 'mount',
    'battery', 'speaker', 'earphone', 'headphone', 'earbuds',
    'case', 'cover', 'screen protector', 'tempered glass',
    'data cable', 'charging cable', 'USB cable', 'type-c',
    'lightning cable', 'magnetic', 'car charger', 'wall charger',
    'fast charging', 'wireless', 'bluetooth', 'portable',
    'travel adapter', 'power strip', 'extension cord',
  ];

  for (const kw of productKeywords) {
    if (text.toLowerCase().includes(kw.toLowerCase())) {
      tags.add(kw);
    }
  }

  // 3. Service/business terms
  const serviceKeywords = [
    'OEM', 'ODM', 'FOB', 'CIF', 'DDP', 'EXW',
    'custom logo', 'private label', 'custom packaging',
    'wholesale', 'dropshipping', 'bulk order',
    'sample', 'customization', 'branding',
  ];

  for (const kw of serviceKeywords) {
    if (text.toLowerCase().includes(kw.toLowerCase())) {
      tags.add(kw);
    }
  }

  // 4. Chinese product keywords
  const cnKeywords = [
    '移动电源', '充电宝', '数据线', '充电器', '充电头',
    '无线充', '蓝牙', '耳机', '音箱', '手机壳',
    '钢化膜', '支架', '车载', '快充', '磁吸',
    '保护套', '转接头', '扩展坞',
  ];

  for (const kw of cnKeywords) {
    if (text.includes(kw)) {
      tags.add(kw);
    }
  }

  // 5. Chinese service keywords
  const cnServiceKeywords = [
    '贴牌', '定制', '代工', '批发', '一件代发',
    '打样', '样品', '外贸', '出口',
  ];

  for (const kw of cnServiceKeywords) {
    if (text.includes(kw)) {
      tags.add(kw);
    }
  }

  // 6. Extract potential product names: consecutive capitalized words
  const capPhrases = text.match(/\b[A-Z][a-z]+\s[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g);
  if (capPhrases) {
    capPhrases.forEach((p) => {
      // Filter out common non-product phrases
      if (!/^(Hi|Hello|Dear|Thank|Best|Kind|I am|We are|This is|Please|Could|Would|Can you)/i.test(p)) {
        tags.add(p);
      }
    });
  }

  // Deduplicate, limit to 4, prefer shorter tags
  const result = Array.from(tags)
    .filter((t) => t.length > 1)
    .sort((a, b) => a.length - b.length)
    .slice(0, 4);

  return result;
}
